const express = require("express");
const mongoose = require("mongoose");
const Vendor = require("../models/Vendor");
const Hall = require("../models/Hall");
const Booking = require("../models/Booking");

const router = express.Router();

/* =========================
   TEST ROUTE
========================= */
router.get("/test", (req, res) => {
  res.json({ message: "Vendor route OK ✅" });
});

/* =========================
   VENDOR REGISTER
========================= */
router.post("/register", async (req, res) => {
  try {
    const {
      businessName,
      ownerName,
      phone,
      email,
      city,
      serviceType,
      password,
    } = req.body;

    // BASIC VALIDATION
    if (
      !businessName ||
      !ownerName ||
      !phone ||
      !email ||
      !city ||
      !serviceType ||
      !password
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    // CHECK DUPLICATE EMAIL / PHONE
    const existingVendor = await Vendor.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingVendor) {
      return res.status(400).json({
        message: "Vendor with this email or phone already exists",
      });
    }

    // CREATE VENDOR
    await Vendor.create({
      businessName,
      ownerName,
      phone,
      email,
      city,
      serviceType,
      password,
      status: "pending",
    });

    res.status(201).json({
      message:
        "Vendor registered successfully. Waiting for admin approval.",
    });
  } catch (error) {
    console.error("REGISTER ERROR ❌", error);

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Email or phone already registered",
      });
    }

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

/* =========================
   VENDOR LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        message: "Email/Phone and password required",
      });
    }

    const vendor = await Vendor.findOne({
      $or: [{ email: identifier }, { phone: identifier }],
    });

    if (!vendor) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // BLOCK LOGIN IF NOT APPROVED
    if (vendor.status !== "approved") {
      return res.status(403).json({
        message: "Account not approved by admin yet",
      });
    }

    const isMatch = await vendor.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    res.json({
      message: "Login successful ✅",
      vendor: {
        _id: vendor._id,
        businessName: vendor.businessName,
        email: vendor.email,
        phone: vendor.phone,
        status: vendor.status,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR ❌", error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

/* =========================
   ADMIN – GET ALL VENDORS
========================= */
router.get("/all", async (req, res) => {
  try {
    const vendors = await Vendor.find().sort({ createdAt: -1 });
    res.json(vendors);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch vendors",
    });
  }
});

/* =========================
   ADMIN – UPDATE VENDOR STATUS
========================= */
router.put("/status/:id", async (req, res) => {
  try {
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }

    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({
        message: "Vendor not found",
      });
    }

    res.json({
      message: "Vendor status updated ✅",
      vendor,
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to update status",
    });
  }
});

/* =========================
   ADMIN – VENDOR STATS
========================= */
router.get("/stats", async (req, res) => {
  try {
    const total = await Vendor.countDocuments();
    const pending = await Vendor.countDocuments({ status: "pending" });
    const approved = await Vendor.countDocuments({ status: "approved" });
    const rejected = await Vendor.countDocuments({ status: "rejected" });

    res.json({
      total,
      pending,
      approved,
      rejected,
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to load stats",
    });
  }
});

/* =========================
   🔥 DELETE VENDOR (CASCADE)
========================= */
router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🗑 Deleting vendor:", id);

    // ✅ validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid vendor id",
      });
    }

    // 1️⃣ delete bookings
    await Booking.deleteMany({ vendor: id });

    // 2️⃣ delete halls
    await Hall.deleteMany({ vendor: id });

    // 3️⃣ delete vendor
    const deletedVendor = await Vendor.findByIdAndDelete(id);

    if (!deletedVendor) {
      return res.status(404).json({
        message: "Vendor not found",
      });
    }

    console.log("✅ Vendor cascade deleted");

    res.json({
      message: "Vendor and related data deleted successfully",
    });
  } catch (error) {
    console.error("DELETE VENDOR ERROR ❌", error);
    res.status(500).json({
      message: "Failed to delete vendor",
    });
  }
});

module.exports = router;