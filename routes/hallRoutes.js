const express = require("express");
const mongoose = require("mongoose");
const Hall = require("../models/Hall");
const Booking = require("../models/Booking");
const {
  normalizeListingPlan,
  sortHallsByListingPriority,
} = require("../utils/listingPlan");
const { normalizeVenueCategory } = require("../utils/venueCategory");
const upload = require("../middleware/uploadToS3");
const authMiddleware = require("../middleware/authMiddleware");

const { requireAdmin, requireVendor } = authMiddleware;
const router = express.Router();

const getAuthenticatedVendorId = (req) => String(req.user?.id || "");

const ensureVendorOwnership = (req, targetVendorId) => {
  const vendorId = getAuthenticatedVendorId(req);

  if (!vendorId) {
    return {
      ok: false,
      status: 401,
      message: "Vendor session is invalid",
    };
  }

  if (targetVendorId && String(targetVendorId) !== vendorId) {
    return {
      ok: false,
      status: 403,
      message: "You can access only your own halls",
    };
  }

  return {
    ok: true,
    vendorId,
  };
};

/* =====================================================
   SEARCH HALLS (MAIN FILTER API)
===================================================== */
router.get("/search", async (req, res) => {
  try {
    const { q, city, location, venueType } = req.query;

    const filter = { status: "approved" };
    const andConditions = [];

    if (city) {
      const cityRegex = new RegExp(
        `^${String(city).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      );

      andConditions.push({
        $or: [{ "address.city": cityRegex }, { "address.pincode": cityRegex }],
      });
    }

    if (location) {
      const locationRegex = new RegExp(
        `^${String(location).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      );

      andConditions.push({
        $or: [
          { "address.area": locationRegex },
          { "address.city": locationRegex },
          { "address.pincode": locationRegex },
        ],
      });
    }

    if (venueType) {
      const normalizedCategory = normalizeVenueCategory(venueType);
      if (normalizedCategory) {
        andConditions.push({ category: normalizedCategory });
      }
    }

    if (q && String(q).trim()) {
      const escaped = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const queryRegex = new RegExp(escaped, "i");

      andConditions.push({
        $or: [
          { hallName: queryRegex },
          { "address.area": queryRegex },
          { "address.city": queryRegex },
          { "address.pincode": queryRegex },
          { category: queryRegex },
        ],
      });
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const halls = await Hall.find(filter)
      .populate("vendor", "businessName phone")
      .lean();

    const sortedHalls = sortHallsByListingPriority(halls);

    res.json({
      success: true,
      count: sortedHalls.length,
      data: sortedHalls,
    });
  } catch (error) {
    console.error("SEARCH ERROR", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   VENDOR ADD HALL
===================================================== */
router.post("/add", requireVendor, upload.array("images", 10), async (req, res) => {
  try {
    const ownership = ensureVendorOwnership(req, req.body?.vendorId);

    if (!ownership.ok) {
      return res.status(ownership.status).json({ message: ownership.message });
    }

    const {
      hallName,
      category,
      capacity,
      parkingCapacity,
      rooms,
      about,
      listingPlan,
    } = req.body;

    if (!hallName || !category) {
      return res.status(400).json({
        message: "hallName and category are required",
      });
    }

    let address = {};
    let location = {};
    let features = {};

    try {
      if (req.body.address) address = JSON.parse(req.body.address);
      if (req.body.location) location = JSON.parse(req.body.location);
      if (req.body.features) features = JSON.parse(req.body.features);
    } catch {
      return res.status(400).json({ message: "Invalid JSON data" });
    }

    const imageUrls = req.files
      ? req.files
          .map((file) => file.location || `/uploads/halls/${file.filename}`)
          .filter(Boolean)
      : [];

    const hall = await Hall.create({
      vendor: new mongoose.Types.ObjectId(ownership.vendorId),
      hallName,
      category: normalizeVenueCategory(category),
      capacity: Number(capacity) || 0,
      parkingCapacity: Number(parkingCapacity) || 0,
      rooms: Number(rooms) || 0,
      about: about || "",
      pricePerDay: Number(req.body.pricePerDay) || 0,
      pricePerEvent: Number(req.body.pricePerEvent) || 0,
      pricePerPlate: Number(req.body.pricePerPlate) || 0,
      listingPlan: normalizeListingPlan(listingPlan),
      address,
      location,
      features,
      images: imageUrls,
      status: "pending",
    });

    console.log(`Vendor ${ownership.vendorId} created hall ${hall._id}`);

    res.status(201).json({
      message: "Hall added successfully",
      hall,
    });
  } catch (error) {
    console.error("ADD HALL ERROR", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =====================================================
   VENDOR APPROVED HALLS
===================================================== */
router.get("/vendor/:vendorId", requireVendor, async (req, res) => {
  try {
    const ownership = ensureVendorOwnership(req, req.params.vendorId);

    if (!ownership.ok) {
      return res.status(ownership.status).json({ message: ownership.message });
    }

    const halls = await Hall.find({
      vendor: new mongoose.Types.ObjectId(ownership.vendorId),
      status: "approved",
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: halls.length,
      data: halls,
    });
  } catch (error) {
    console.error("VENDOR HALLS ERROR", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   PUBLIC APPROVED HALLS
===================================================== */
router.get("/public", async (req, res) => {
  try {
    const requestedCategory = normalizeVenueCategory(req.query.category);
    const halls = await Hall.find({ status: "approved" }).lean();
    const filteredHalls = requestedCategory
      ? halls.filter(
          (hall) => normalizeVenueCategory(hall.category) === requestedCategory
        )
      : halls;

    res.json(sortHallsByListingPriority(filteredHalls));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch public halls" });
  }
});

/* =====================================================
   ADMIN APPROVE
===================================================== */
router.put("/approve/:id", requireAdmin, async (req, res) => {
  const hall = await Hall.findByIdAndUpdate(
    req.params.id,
    { status: "approved" },
    { new: true }
  );

  if (!hall) {
    return res.status(404).json({ message: "Hall not found" });
  }

  res.json({ message: "Hall approved", hall });
});

/* =====================================================
   SINGLE HALL
===================================================== */
router.get("/:id", async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id).populate(
      "vendor",
      "businessName phone email"
    );

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    res.json(hall);
  } catch (error) {
    console.error("FETCH HALL ERROR", error);
    res.status(500).json({ message: "Failed to fetch hall" });
  }
});

/* =====================================================
   VENDOR DELETE HALL
===================================================== */
router.delete("/:id", requireVendor, async (req, res) => {
  try {
    const { id } = req.params;
    const ownership = ensureVendorOwnership(
      req,
      req.query.vendorId || req.body?.vendorId
    );

    if (!ownership.ok) {
      return res.status(ownership.status).json({ message: ownership.message });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid hall id" });
    }

    const hall = await Hall.findOne({
      _id: new mongoose.Types.ObjectId(id),
      vendor: new mongoose.Types.ObjectId(ownership.vendorId),
    });

    if (!hall) {
      return res.status(404).json({ message: "Hall not found for this vendor" });
    }

    await Booking.deleteMany({ hall: hall._id });
    await Hall.deleteOne({ _id: hall._id });

    console.log(`Vendor ${ownership.vendorId} deleted hall ${hall._id}`);

    return res.json({
      success: true,
      message: "Hall and related bookings deleted successfully",
    });
  } catch (error) {
    console.error("DELETE HALL ERROR", error);
    return res.status(500).json({ message: "Failed to delete hall" });
  }
});

/* =====================================================
   VENDOR UPDATE HALL
===================================================== */
router.put("/:id", requireVendor, async (req, res) => {
  try {
    const { id } = req.params;
    const ownership = ensureVendorOwnership(
      req,
      req.query.vendorId || req.body?.vendorId
    );

    if (!ownership.ok) {
      return res.status(ownership.status).json({ message: ownership.message });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid hall id" });
    }

    const hall = await Hall.findOne({
      _id: new mongoose.Types.ObjectId(id),
      vendor: new mongoose.Types.ObjectId(ownership.vendorId),
    });

    if (!hall) {
      return res.status(404).json({ message: "Hall not found for this vendor" });
    }

    const {
      hallName,
      category,
      capacity,
      parkingCapacity,
      rooms,
      about,
      pricePerDay,
      pricePerEvent,
      pricePerPlate,
      listingPlan,
      address,
      location,
      features,
    } = req.body;

    hall.hallName = hallName?.toString().trim() || hall.hallName;
    hall.category = category
      ? normalizeVenueCategory(category)
      : hall.category;
    hall.capacity = Number(capacity) || 0;
    hall.parkingCapacity = Number(parkingCapacity) || 0;
    hall.rooms = Number(rooms) || 0;
    hall.about = about?.toString() || "";
    hall.pricePerDay = Number(pricePerDay) || 0;
    hall.pricePerEvent = Number(pricePerEvent) || 0;
    hall.pricePerPlate = Number(pricePerPlate) || 0;
    if (listingPlan) {
      hall.listingPlan = normalizeListingPlan(listingPlan);
    }

    if (address && typeof address === "object") {
      hall.address = {
        ...hall.address,
        ...address,
      };
    }

    if (
      location &&
      typeof location === "object" &&
      Number.isFinite(Number(location.lat)) &&
      Number.isFinite(Number(location.lng))
    ) {
      hall.location = {
        lat: Number(location.lat),
        lng: Number(location.lng),
      };
    }

    if (features && typeof features === "object") {
      hall.features = {
        ...hall.features,
        ...features,
      };
    }

    await hall.save();

    console.log(`Vendor ${ownership.vendorId} updated hall ${hall._id}`);

    return res.json({
      success: true,
      message: "Hall updated successfully",
      hall,
    });
  } catch (error) {
    console.error("UPDATE HALL ERROR", error);
    return res.status(500).json({ message: "Failed to update hall" });
  }
});

router.post("/delete/:id", requireVendor, async (req, res) => {
  try {
    const { id } = req.params;
    const ownership = ensureVendorOwnership(req, req.body?.vendorId);

    if (!ownership.ok) {
      return res.status(ownership.status).json({ message: ownership.message });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid hall id" });
    }

    const hall = await Hall.findOne({
      _id: new mongoose.Types.ObjectId(id),
      vendor: new mongoose.Types.ObjectId(ownership.vendorId),
    });

    if (!hall) {
      return res.status(404).json({ message: "Hall not found for this vendor" });
    }

    await Booking.deleteMany({ hall: hall._id });
    await Hall.deleteOne({ _id: hall._id });

    console.log(`Vendor ${ownership.vendorId} deleted hall ${hall._id} via fallback route`);

    return res.json({
      success: true,
      message: "Hall and related bookings deleted successfully",
    });
  } catch (error) {
    console.error("DELETE HALL FALLBACK ERROR", error);
    return res.status(500).json({ message: "Failed to delete hall" });
  }
});

module.exports = router;
