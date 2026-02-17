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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/* =====================================================
   ADD HALL (VENDOR)
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

    if (
      typeof location.lat !== "number" ||
      typeof location.lng !== "number"
    ) {
      return res.status(400).json({
        message: "Valid map location required",
      });
    }

    const hall = await Hall.create({
      vendor: vendorId,
      hallName,
      category: category.toLowerCase(), // wedding | banquet | party
      capacity: Number(capacity) || 0,
      parkingCapacity: Number(parkingCapacity) || 0,
      rooms: Number(rooms) || 0,
      about: about || "",
      address,
      location,
      features,
      images: req.files
        ? req.files.map(
            (f) => `/uploads/halls/${path.basename(f.path)}`
          )
        : [],
      status: "pending", // ALWAYS pending first
    });

    res.status(201).json({
      message: "Hall added successfully, waiting for admin approval",
      hall,
    });
  } catch (error) {
    console.error("ADD HALL ERROR ❌", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/* =====================================================
   UPDATE HALL (VENDOR)
===================================================== */
router.put("/update/:id", async (req, res) => {
  try {
    const hall = await Hall.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    res.json({
      message: "Hall updated successfully ✅",
      hall,
    });
  } catch (error) {
    console.error("UPDATE HALL ERROR ❌", error);
    res.status(500).json({ message: "Failed to update hall" });
  }
});

/* =====================================================
   VENDOR – GET ONLY APPROVED HALLS
===================================================== */
router.get("/vendor/:vendorId", async (req, res) => {
  try {
    const halls = await Hall.find({
      vendor: req.params.vendorId,
      status: "approved",
    }).sort({ createdAt: -1 });

    res.json(halls);
  } catch {
    res.status(500).json({
      message: "Failed to fetch vendor halls",
    });
  }
});

/* =====================================================
   PUBLIC – APPROVED HALLS ONLY
   /api/halls/public?category=wedding
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
    console.error("PUBLIC HALL FETCH ERROR ❌", error);
    res.status(500).json({
      message: "Failed to fetch public halls",
    });
  }
});





/* =====================================================
   ADMIN – GET ALL HALLS (ALIAS FOR FRONTEND)
===================================================== */
router.get("/all", async (req, res) => {
  try {
    const halls = await Hall.find()
      .populate("vendor", "businessName email phone")
      .sort({ createdAt: -1 });

    res.json(halls);
  } catch {
    res.status(500).json({
      message: "Failed to fetch halls",
    });
  }
});


/* =====================================================
   ADMIN – APPROVE HALL
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

  res.json({
    message: "Hall approved ✅",
    hall,
  });
});

/* =====================================================
   ADMIN – REJECT HALL
===================================================== */
router.put("/reject/:id", async (req, res) => {
  try {
    const hall = await Hall.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    res.json({
      message: "Hall rejected ❌",
      hall,
    });
  } catch (error) {
    console.error("REJECT ERROR ❌", error);
    res.status(500).json({ message: "Failed to reject hall" });
  }
});


module.exports = router;


/* =====================================================
   SEARCH HALLS
   ⚠ MUST BE ABOVE /:id
===================================================== */
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.json([]);
    }

    const halls = await Hall.find({
      status: "approved",
      $or: [
        { hallName: { $regex: q, $options: "i" } },
        { "address.area": { $regex: q, $options: "i" } },
        { "address.city": { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } }
      ],
    }).limit(10);

    res.json(halls);
  } catch (error) {
    console.error("SEARCH ERROR ❌", error);
    res.status(500).json({ message: "Server Error" });
  }
});

/* =====================================================
   SEARCH HALLS BY NAME
===================================================== */
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.json([]);
    }

    const halls = await Hall.find({
      hallName: { $regex: q, $options: "i" },
      status: "approved"
    });

    res.json(halls);
  } catch (error) {
    console.error("SEARCH ERROR ❌", error);
    res.status(500).json({ message: "Server Error" });
  }
});




/* =====================================================
   PUBLIC – SINGLE APPROVED HALL
   ⚠ MUST BE BELOW /public
===================================================== */
router.get("/:id", async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id)
      .populate("vendor", "businessName phone email");

    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    res.json(hall);
  } catch (error) {
    console.error("FETCH HALL ERROR ❌", error);
    res.status(500).json({ message: "Failed to fetch hall" });
  }
});

/* =========================
   CREATE HALL
========================= */
router.post("/", async (req, res) => {
  try {
    const hall = new Hall(req.body);
    await hall.save();

    res.status(201).json({
      message: "Hall created successfully ✅",
      hall,
    });
  } catch (error) {
    console.error("CREATE HALL ERROR ❌", error);
    res.status(500).json({ message: "Failed to create hall" });
  }
});

/* =========================
   GET ALL HALLS
========================= */
router.get("/", async (req, res) => {
  try {
    const halls = await Hall.find();
    res.json(halls);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch halls" });
  }
});

/* =========================
   GET SINGLE HALL
========================= */
router.get("/:id", async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id);
    res.json(hall);
  } catch (error) {
    res.status(500).json({ message: "Hall not found" });
  }
});
