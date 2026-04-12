const express = require("express");
const mongoose = require("mongoose");
const Hall = require("../models/Hall");
const Booking = require("../models/Booking");
const {
  getListingPlanDetails,
  getListingPlanMonthlyCost,
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

const normalizeStartOfDay = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

const normalizeEndOfDay = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(23, 59, 59, 999);
  return date;
};

const rangesOverlap = (startA, endA, startB, endB) =>
  startA <= endB && endA >= startB;

const normalizeAnalyticsDay = (value = new Date()) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

const getAnalyticsDateKey = (value = new Date()) => {
  const date = normalizeAnalyticsDay(value);
  return date ? date.toISOString().split("T")[0] : "";
};

const parseAnalyticsMonth = (value) => {
  const normalizedValue =
    typeof value === "string" && /^\d{4}-\d{2}$/.test(value)
      ? value
      : new Date().toISOString().slice(0, 7);

  const [year, month] = normalizedValue.split("-").map(Number);
  const monthStart = new Date(year, (month || 1) - 1, 1);

  if (Number.isNaN(monthStart.getTime())) {
    const fallbackDate = new Date();
    return {
      value: fallbackDate.toISOString().slice(0, 7),
      monthStart: new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1),
    };
  }

  return {
    value: normalizedValue,
    monthStart,
  };
};

const incrementHallAnalyticsMetric = async (hallId, metric) => {
  const day = normalizeAnalyticsDay();
  const dateKey = getAnalyticsDateKey(day);

  if (!day || !dateKey || !["hallViews", "phoneViews"].includes(metric)) {
    return;
  }

  const updateExisting = await Hall.updateOne(
    {
      _id: hallId,
      "analyticsDaily.dateKey": dateKey,
    },
    {
      $inc: {
        [`analyticsDaily.$.${metric}`]: 1,
      },
    }
  );

  if (updateExisting.matchedCount > 0) {
    return;
  }

  await Hall.updateOne(
    { _id: hallId },
    {
      $push: {
        analyticsDaily: {
          dateKey,
          date: day,
          hallViews: metric === "hallViews" ? 1 : 0,
          phoneViews: metric === "phoneViews" ? 1 : 0,
        },
      },
    }
  );
};

const buildVendorAnalyticsPayload = (halls, monthValue) => {
  const { value, monthStart } = parseAnalyticsMonth(monthValue);
  const monthEnd = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  const daysInMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0
  ).getDate();

  const chartData = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      index + 1
    );

    return {
      dateKey: getAnalyticsDateKey(date),
      label: date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      hallViews: 0,
      phoneViews: 0,
    };
  });

  const chartLookup = chartData.reduce((lookup, entry) => {
    lookup[entry.dateKey] = entry;
    return lookup;
  }, {});

  const hallBreakdown = halls
    .map((hall) => {
      const monthlyStats = (hall.analyticsDaily || []).filter((entry) => {
        const entryDate = new Date(entry.date || entry.dateKey);
        return entryDate >= monthStart && entryDate <= monthEnd;
      });

      const hallViews = monthlyStats.reduce(
        (sum, entry) => sum + (Number(entry.hallViews) || 0),
        0
      );
      const phoneViews = monthlyStats.reduce(
        (sum, entry) => sum + (Number(entry.phoneViews) || 0),
        0
      );
      const monthlyPlanCost = getListingPlanMonthlyCost(hall.listingPlan);
      const estimatedCpc = hallViews > 0 ? monthlyPlanCost / hallViews : 0;
      const listingPlan = getListingPlanDetails(hall.listingPlan);

      monthlyStats.forEach((entry) => {
        const key = getAnalyticsDateKey(entry.date || entry.dateKey);
        const chartEntry = chartLookup[key];

        if (!chartEntry) {
          return;
        }

        chartEntry.hallViews += Number(entry.hallViews) || 0;
        chartEntry.phoneViews += Number(entry.phoneViews) || 0;
      });

      return {
        hallId: String(hall._id),
        hallName: hall.hallName || "Untitled hall",
        listingPlan: listingPlan?.name || hall.listingPlan || "Basic Listing",
        monthlyPlanCost,
        hallViews,
        phoneViews,
        estimatedCpc,
      };
    })
    .sort(
      (left, right) =>
        right.hallViews - left.hallViews || right.phoneViews - left.phoneViews
    );

  const totals = hallBreakdown.reduce(
    (summary, hall) => {
      summary.hallViews += hall.hallViews;
      summary.phoneViews += hall.phoneViews;
      summary.monthlyPlanCost += hall.monthlyPlanCost;
      return summary;
    },
    {
      hallViews: 0,
      phoneViews: 0,
      monthlyPlanCost: 0,
    }
  );

  return {
    month: value,
    chartData,
    hallBreakdown,
    totals: {
      hallViews: totals.hallViews,
      phoneViews: totals.phoneViews,
      monthlyPlanCost: totals.monthlyPlanCost,
      estimatedCpc:
        totals.hallViews > 0 ? totals.monthlyPlanCost / totals.hallViews : 0,
    },
  };
};

const INVALID_JSON_FIELD = Symbol("INVALID_JSON_FIELD");

const parseStructuredField = (value, fallback = {}) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return INVALID_JSON_FIELD;
    }
  }

  if (typeof value === "object") {
    return value;
  }

  return fallback;
};

const parseMultipartArray = (fieldName, maxCount) => (req, res, next) => {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    return upload.array(fieldName, maxCount)(req, res, (error) => {
      if (!error) {
        next();
        return;
      }

      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Each uploaded image must be 5MB or smaller"
          : error.message || "Image upload failed";

      res.status(400).json({ message });
    });
  }

  req.files = Array.isArray(req.files) ? req.files : [];
  return next();
};

const parseHallUpdateRequest = parseMultipartArray("images", 10);
const parseHallReviewUpload = parseMultipartArray("reviewImages", 5);

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
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }

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

router.get("/vendor/:vendorId/analytics", requireVendor, async (req, res) => {
  try {
    const ownership = ensureVendorOwnership(req, req.params.vendorId);

    if (!ownership.ok) {
      return res.status(ownership.status).json({ message: ownership.message });
    }

    const hallFilterId = String(req.query.hallId || "").trim();
    const hallQuery = {
      vendor: new mongoose.Types.ObjectId(ownership.vendorId),
      status: "approved",
    };

    if (hallFilterId) {
      if (!mongoose.Types.ObjectId.isValid(hallFilterId)) {
        return res.status(400).json({ message: "Invalid hall id" });
      }

      hallQuery._id = new mongoose.Types.ObjectId(hallFilterId);
    }

    const halls = await Hall.find(hallQuery)
      .select("hallName listingPlan analyticsDaily")
      .lean();

    return res.json({
      success: true,
      data: buildVendorAnalyticsPayload(halls, req.query.month),
    });
  } catch (error) {
    console.error("VENDOR ANALYTICS ERROR", error);
    return res.status(500).json({ message: "Failed to fetch hall analytics" });
  }
});

/* =====================================================
   VENDOR OFFLINE DATE BLOCKS
===================================================== */
router.post("/:id/offline-bookings", requireVendor, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, note } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid hall id" });
    }

    const hall = await Hall.findOne({
      _id: new mongoose.Types.ObjectId(id),
      vendor: new mongoose.Types.ObjectId(getAuthenticatedVendorId(req)),
    });

    if (!hall) {
      return res.status(404).json({ message: "Hall not found for this vendor" });
    }

    const normalizedStartDate = normalizeStartOfDay(startDate);
    const normalizedEndDate = normalizeEndOfDay(endDate);

    if (!normalizedStartDate || !normalizedEndDate) {
      return res.status(400).json({ message: "Valid start and end dates are required" });
    }

    if (normalizedStartDate > normalizedEndDate) {
      return res
        .status(400)
        .json({ message: "End date must be on or after the start date" });
    }

    const overlappingApprovedBooking = await Booking.findOne({
      hall: hall._id,
      status: "approved",
      checkIn: { $lte: normalizedEndDate },
      checkOut: { $gte: normalizedStartDate },
    }).select("_id checkIn checkOut");

    if (overlappingApprovedBooking) {
      return res.status(409).json({
        message: "These dates already have an approved booking",
      });
    }

    const overlappingOfflineBooking = (hall.offlineBookings || []).find((block) =>
      rangesOverlap(
        normalizedStartDate,
        normalizedEndDate,
        new Date(block.startDate),
        new Date(block.endDate)
      )
    );

    if (overlappingOfflineBooking) {
      return res.status(409).json({
        message: "These dates are already blocked as offline booked",
      });
    }

    const normalizedNote =
      String(note || "Offline booked").trim() || "Offline booked";
    const offlineBooking = {
      _id: new mongoose.Types.ObjectId(),
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      note: normalizedNote,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await Hall.updateOne(
      { _id: hall._id, vendor: hall.vendor },
      {
        $push: {
          offlineBookings: offlineBooking,
        },
      }
    );

    return res.status(201).json({
      success: true,
      message: "Offline booking dates blocked successfully",
      offlineBooking,
    });
  } catch (error) {
    console.error("CREATE OFFLINE BOOKING ERROR", error);
    return res.status(500).json({ message: "Failed to block offline booking dates" });
  }
});

router.delete("/:id/offline-bookings/:offlineBookingId", requireVendor, async (req, res) => {
  try {
    const { id, offlineBookingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid hall id" });
    }

    const hall = await Hall.findOne({
      _id: new mongoose.Types.ObjectId(id),
      vendor: new mongoose.Types.ObjectId(getAuthenticatedVendorId(req)),
    });

    if (!hall) {
      return res.status(404).json({ message: "Hall not found for this vendor" });
    }

    const offlineBooking = hall.offlineBookings.id(offlineBookingId);

    if (!offlineBooking) {
      return res.status(404).json({ message: "Offline booking block not found" });
    }

    await Hall.updateOne(
      { _id: hall._id, vendor: hall.vendor },
      {
        $pull: {
          offlineBookings: {
            _id: offlineBooking._id,
          },
        },
      }
    );

    return res.json({
      success: true,
      message: "Offline booking block removed successfully",
    });
  } catch (error) {
    console.error("DELETE OFFLINE BOOKING ERROR", error);
    return res.status(500).json({ message: "Failed to remove offline booking block" });
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
      "businessName ownerName phone email isOnline autoReplyEnabled"
    );

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    if (
      hall.status === "approved" &&
      String(req.query.trackView || "").toLowerCase() === "true"
    ) {
      try {
        await incrementHallAnalyticsMetric(hall._id, "hallViews");
      } catch (analyticsError) {
        console.error("TRACK HALL VIEW ERROR", analyticsError);
      }
    }

    res.json(hall);
  } catch (error) {
    console.error("FETCH HALL ERROR", error);
    res.status(500).json({ message: "Failed to fetch hall" });
  }
});

router.post("/:id/reviews", parseHallReviewUpload, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid hall id" });
    }

    const hall = await Hall.findOne({
      _id: new mongoose.Types.ObjectId(id),
      status: "approved",
    });

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    const requestBody =
      req.body && typeof req.body === "object" ? req.body : {};
    const reviewerName = String(requestBody.reviewerName || "").trim();
    const reviewerEmail = String(requestBody.reviewerEmail || "")
      .trim()
      .toLowerCase();
    const comment = String(requestBody.comment || "").trim();
    const rating = Number(requestBody.rating);

    if (!reviewerName) {
      return res.status(400).json({ message: "Reviewer name is required" });
    }

    if (!comment) {
      return res.status(400).json({ message: "Review comment is required" });
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const photoUrls = Array.isArray(req.files)
      ? req.files
          .map((file) => file.location || `/uploads/halls/${file.filename}`)
          .filter(Boolean)
      : [];

    hall.reviews.push({
      reviewerName,
      reviewerEmail,
      rating,
      comment,
      photos: photoUrls,
    });

    await hall.save();

    return res.status(201).json({
      success: true,
      message: "Review added successfully",
      review: hall.reviews[hall.reviews.length - 1],
      hall,
    });
  } catch (error) {
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }

    console.error("ADD HALL REVIEW ERROR", error);
    return res.status(500).json({ message: "Failed to add review" });
  }
});

router.post("/:id/analytics/hall-view", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid hall id" });
    }

    const hall = await Hall.findOne({
      _id: new mongoose.Types.ObjectId(id),
      status: "approved",
    }).select("_id");

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    await incrementHallAnalyticsMetric(hall._id, "hallViews");

    return res.json({
      success: true,
      message: "Hall view tracked successfully",
    });
  } catch (error) {
    console.error("TRACK HALL VIEW ERROR", error);
    return res.status(500).json({ message: "Failed to track hall view" });
  }
});

router.post("/:id/analytics/phone-view", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid hall id" });
    }

    const hall = await Hall.findOne({
      _id: new mongoose.Types.ObjectId(id),
      status: "approved",
    }).select("_id");

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    await incrementHallAnalyticsMetric(hall._id, "phoneViews");

    return res.json({
      success: true,
      message: "Phone view tracked successfully",
    });
  } catch (error) {
    console.error("TRACK PHONE VIEW ERROR", error);
    return res.status(500).json({ message: "Failed to track phone view" });
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
router.put("/:id", requireVendor, parseHallUpdateRequest, async (req, res) => {
  try {
    const { id } = req.params;
    const requestBody =
      req.body && typeof req.body === "object" ? req.body : {};
    const ownership = ensureVendorOwnership(
      req,
      req.query.vendorId || requestBody.vendorId
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
      address: rawAddress,
      location: rawLocation,
      features: rawFeatures,
    } = requestBody;

    const address = parseStructuredField(rawAddress, null);
    const location = parseStructuredField(rawLocation, null);
    const features = parseStructuredField(rawFeatures, null);

    if (
      address === INVALID_JSON_FIELD ||
      location === INVALID_JSON_FIELD ||
      features === INVALID_JSON_FIELD
    ) {
      return res.status(400).json({ message: "Invalid JSON data" });
    }

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

    if (Array.isArray(req.files) && req.files.length > 0) {
      hall.images = req.files
        .map((file) => file.location || `/uploads/halls/${file.filename}`)
        .filter(Boolean);
    }

    await hall.save();

    console.log(`Vendor ${ownership.vendorId} updated hall ${hall._id}`);

    return res.json({
      success: true,
      message: "Hall updated successfully",
      hall,
    });
  } catch (error) {
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }

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
