const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const Hall = require("../models/Hall");

const router = express.Router();

/* =========================
   ENSURE UPLOAD FOLDER
========================= */
const uploadDir = path.join(__dirname, "..", "uploads", "halls");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* =========================
   MULTER CONFIG
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");
    cb(null, Date.now() + "-" + safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/* =====================================================
   🔥 SEARCH HALLS (MAIN FILTER API)
===================================================== */
router.get("/search", async (req, res) => {
  try {
    const { city, location, venueType } = req.query;

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
   ✅ ADD HALL (FIXED WITH PRICES)
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

    if (!hallName || !category || !vendorId) {
      return res.status(400).json({
        message: "hallName, category and vendorId are required",
      });
    }

    /* =========================
       PARSE JSON FIELDS
    ========================= */
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

    /* =========================
       ⭐⭐⭐ PRICE PARSING (CRITICAL FIX)
    ========================= */
    const pricePerDay = req.body.pricePerDay
      ? Number(req.body.pricePerDay)
      : 0;

    const pricePerEvent = req.body.pricePerEvent
      ? Number(req.body.pricePerEvent)
      : 0;

    const pricePerPlate = req.body.pricePerPlate
      ? Number(req.body.pricePerPlate)
      : 0;

    /* =========================
       CREATE HALL
    ========================= */
    const hall = await Hall.create({
      vendor: vendorId,
      hallName,
      category: category.toLowerCase(),
      capacity: Number(capacity) || 0,
      parkingCapacity: Number(parkingCapacity) || 0,
      rooms: Number(rooms) || 0,
      about: about || "",

      // ⭐⭐⭐ FIXED PRICES
      pricePerDay,
      pricePerEvent,
      pricePerPlate,

      address,
      location,
      features,

      images: req.files
        ? req.files.map(
            (f) => `/uploads/halls/${path.basename(f.path)}`
          )
        : [],

      status: "pending",
    });

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

module.exports = router;