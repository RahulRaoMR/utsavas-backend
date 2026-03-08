const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Vendor = require("../models/Vendor");
const Hall = require("../models/Hall");
const Booking = require("../models/Booking");

const router = express.Router();

/* =========================
   TEST ROUTE
========================= */
router.get("/test", (req, res) => {
  res.json({ success: true, message: "Vendor route OK ✅" });
});

/* =========================
   VENDOR REGISTER
========================= */
router.post("/register", async (req, res) => {
  try {
    let {
      businessName,
      ownerName,
      phone,
      email,
      city,
      serviceType,
      password
    } = req.body;

    businessName = businessName?.toString().trim();
    ownerName = ownerName?.toString().trim();
    phone = phone?.toString().trim();
    email = email?.toString().toLowerCase().trim();
    city = city?.toString().trim();
    serviceType = serviceType?.toString().trim().toLowerCase();

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
        success: false,
        message: "All fields are required"
      });
    }

    if (!["wedding", "banquet", "party", "service"].includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service type"
      });
    }

    const existingVendor = await Vendor.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingVendor) {
      return res.status(400).json({
        success: false,
        message: "Vendor already exists"
      });
    }

    const vendor = new Vendor({
      businessName,
      ownerName,
      phone,
      email,
      city,
      serviceType,
      password,
      status: "pending"
    });

    await vendor.save();

    res.status(201).json({
      success: true,
      message: "Vendor registered successfully. Waiting for admin approval.",
      vendor
    });

  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || "field";
      return res.status(409).json({
        success: false,
        message: `${duplicateField} already exists`
      });
    }

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    console.error("REGISTER ERROR:", error?.message || error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
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
        success: false,
        message: "Email/Phone and password required"
      });
    }

    const vendor = await Vendor.findOne({
      $or: [
        { email: identifier },
        { phone: identifier }
      ]
    });

    if (!vendor) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    if (vendor.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Account not approved by admin yet"
      });
    }

    const isMatch = await bcrypt.compare(password, vendor.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const token = jwt.sign(
      { id: vendor._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      vendor: {
        _id: vendor._id,
        businessName: vendor.businessName,
        email: vendor.email,
        phone: vendor.phone,
        status: vendor.status
      }
    });

  } catch (error) {

    console.error("LOGIN ERROR ❌", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }
});

/* =========================
   ADMIN – GET ALL VENDORS
========================= */
router.get("/all", async (req, res) => {
  try {

    const vendors = await Vendor.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      vendors
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: "Failed to fetch vendors"
    });

  }
});

/* =========================
   ADMIN – UPDATE STATUS
========================= */
router.put("/status/:id", async (req, res) => {
  try {

    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }

    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found"
      });
    }

    res.json({
      success: true,
      message: "Vendor status updated",
      vendor
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: "Failed to update status"
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
      success: true,
      total,
      pending,
      approved,
      rejected
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: "Failed to load stats"
    });

  }
});

/* =========================
   DELETE VENDOR (CASCADE)
========================= */
router.delete("/delete/:id", async (req, res) => {
  try {

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor id"
      });
    }

    await Booking.deleteMany({ vendor: id });
    await Hall.deleteMany({ vendor: id });

    const deletedVendor = await Vendor.findByIdAndDelete(id);

    if (!deletedVendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found"
      });
    }

    res.json({
      success: true,
      message: "Vendor and related data deleted successfully"
    });

  } catch (error) {

    console.error("DELETE VENDOR ERROR ❌", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete vendor"
    });

  }
});

module.exports = router;
