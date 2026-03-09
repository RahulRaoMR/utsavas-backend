const express = require("express");
const mongoose = require("mongoose");
const Hall = require("../models/Hall");

// ✅ NEW — S3 upload middleware
const upload = require("../middleware/uploadToS3");

const router = express.Router();

/* =====================================================
   🔥 SEARCH HALLS (MAIN FILTER API)
===================================================== */
router.get("/search", async (req, res) => {
  try {
    const { q, city, location, venueType } = req.query;

    let filter = { status: "approved" };

    if (city) {
      filter["address.city"] = new RegExp(`^${city}$`, "i");
    }

    if (location) {
      filter["address.area"] = new RegExp(`^${location}$`, "i");
    }

    if (venueType) {
      filter.category = venueType.toLowerCase();
    }

    if (q && String(q).trim()) {
      const escaped = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const queryRegex = new RegExp(escaped, "i");

      filter.$or = [
        { hallName: queryRegex },
        { "address.area": queryRegex },
        { "address.city": queryRegex },
        { category: queryRegex },
      ];
    }

    const halls = await Hall.find(filter)
      .populate("vendor", "businessName phone")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: halls.length,
      data: halls,
    });
  } catch (error) {
    console.error("SEARCH ERROR ❌", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   ✅ ADD HALL (NOW UPLOADS TO S3)
===================================================== */
router.post("/add", upload.array("images", 10), async (req, res) => {
  try {
    const {
      hallName,
      category,
      capacity,
      parkingCapacity,
      rooms,
      about,
      vendorId,
    } = req.body;

    console.log("📥 ADD HALL vendorId:", vendorId);

    if (!hallName || !category || !vendorId) {
      return res.status(400).json({
        message: "hallName, category and vendorId are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        message: "Invalid vendorId",
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

    const pricePerDay = req.body.pricePerDay
      ? Number(req.body.pricePerDay)
      : 0;

    const pricePerEvent = req.body.pricePerEvent
      ? Number(req.body.pricePerEvent)
      : 0;

    const pricePerPlate = req.body.pricePerPlate
      ? Number(req.body.pricePerPlate)
      : 0;

    // ✅🔥 S3 IMAGE URLS (CRITICAL CHANGE)
    const imageUrls = req.files
      ? req.files.map((f) => f.location)
      : [];

    const hall = await Hall.create({
      vendor: new mongoose.Types.ObjectId(vendorId),
      hallName,
      category: category.toLowerCase(),
      capacity: Number(capacity) || 0,
      parkingCapacity: Number(parkingCapacity) || 0,
      rooms: Number(rooms) || 0,
      about: about || "",
      pricePerDay,
      pricePerEvent,
      pricePerPlate,
      address,
      location,
      features,
      images: imageUrls, // ✅ NOW S3 URLs
      status: "pending",
    });

    console.log("✅ Hall created for vendor:", vendorId);

    res.status(201).json({
      message: "Hall added successfully",
      hall,
    });
  } catch (error) {
    console.error("ADD HALL ERROR ❌", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =====================================================
   🔥✅ VENDOR APPROVED HALLS
===================================================== */
router.get("/vendor/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;

    console.log("📥 Vendor halls request for:", vendorId);

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Invalid vendorId" });
    }

    const halls = await Hall.find({
      vendor: new mongoose.Types.ObjectId(vendorId),
      status: "approved",
    }).sort({ createdAt: -1 });

    console.log("✅ Approved halls found:", halls.length);

    res.json({
      success: true,
      count: halls.length,
      data: halls,
    });
  } catch (error) {
    console.error("VENDOR HALLS ERROR ❌", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   PUBLIC APPROVED HALLS
===================================================== */
router.get("/public", async (req, res) => {
  try {
    const filter = { status: "approved" };

    if (req.query.category) {
      filter.category = req.query.category.toLowerCase();
    }

    const halls = await Hall.find(filter).sort({ createdAt: -1 });
    res.json(halls);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch public halls" });
  }
});

/* =====================================================
   ADMIN APPROVE
===================================================== */
router.put("/approve/:id", async (req, res) => {
  const hall = await Hall.findByIdAndUpdate(
    req.params.id,
    { status: "approved" },
    { new: true }
  );

  if (!hall) {
    return res.status(404).json({ message: "Hall not found" });
  }

  res.json({ message: "Hall approved ✅", hall });
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
    console.error("FETCH HALL ERROR ❌", error);
    res.status(500).json({ message: "Failed to fetch hall" });
  }
});

/* =====================================================
   VENDOR DELETE HALL
===================================================== */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = (req.query.vendorId || req.body?.vendorId || "").toString();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid hall id" });
    }

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Invalid vendor id" });
    }

    const hall = await Hall.findOne({
      _id: new mongoose.Types.ObjectId(id),
      vendor: new mongoose.Types.ObjectId(vendorId),
    });

    if (!hall) {
      return res.status(404).json({ message: "Hall not found for this vendor" });
    }

    await Hall.deleteOne({ _id: hall._id });

    return res.json({
      success: true,
      message: "Hall deleted successfully",
    });
  } catch (error) {
    console.error("DELETE HALL ERROR", error);
    return res.status(500).json({ message: "Failed to delete hall" });
  }
});

router.post("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = (req.body?.vendorId || "").toString();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid hall id" });
    }

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: "Invalid vendor id" });
    }

    const hall = await Hall.findOne({
      _id: new mongoose.Types.ObjectId(id),
      vendor: new mongoose.Types.ObjectId(vendorId),
    });

    if (!hall) {
      return res.status(404).json({ message: "Hall not found for this vendor" });
    }

    await Hall.deleteOne({ _id: hall._id });

    return res.json({
      success: true,
      message: "Hall deleted successfully",
    });
  } catch (error) {
    console.error("DELETE HALL FALLBACK ERROR", error);
    return res.status(500).json({ message: "Failed to delete hall" });
  }
});
module.exports = router;


