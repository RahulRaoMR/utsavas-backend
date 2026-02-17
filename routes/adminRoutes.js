const express = require("express");
const Admin = require("../models/Admin");
const Vendor = require("../models/Vendor");
const Hall = require("../models/Hall");
const generateToken = require("../utils/generateToken");

const router = express.Router();

/* =========================
   ADMIN LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    if (admin.password !== password) {
      return res.status(401).json({
        message: "Invalid password",
      });
    }

    const token = generateToken({
      id: admin._id,
      role: "admin",
    });

    res.json({
      message: "Admin login successful ✅",
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("ADMIN LOGIN ERROR ❌", error);
    res.status(500).json({
      message: "Server error",
    });
  }
});

/* =========================
   ADMIN DASHBOARD STATS
========================= */
router.get("/dashboard-stats", async (req, res) => {
  try {
    const totalVendors = await Vendor.countDocuments();
    const pendingVendors = await Vendor.countDocuments({ status: "pending" });

    const totalHalls = await Hall.countDocuments();
    const pendingHalls = await Hall.countDocuments({ status: "pending" });

    res.json({
      totalVendors,
      pendingVendors,
      totalHalls,
      pendingHalls,
    });
  } catch (error) {
    console.error("ADMIN DASHBOARD STATS ERROR ❌", error);
    res.status(500).json({
      message: "Failed to load dashboard stats",
    });
  }
});

/* =========================
   GET PENDING HALLS (ADMIN)
========================= */
router.get("/halls", async (req, res) => {
  try {
    const halls = await Hall.find({ status: "pending" })
      .populate("vendor", "businessName email phone");

    res.json(halls);
  } catch (error) {
    console.error("GET PENDING HALLS ERROR ❌", error);
    res.status(500).json({
      message: "Failed to fetch pending halls",
    });
  }
});

/* =========================
   APPROVE HALL
========================= */
router.put("/halls/:id/approve", async (req, res) => {
  try {
    const hall = await Hall.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );

    res.json({
      message: "Hall approved ✅",
      hall,
    });
  } catch (error) {
    console.error("APPROVE HALL ERROR ❌", error);
    res.status(500).json({
      message: "Failed to approve hall",
    });
  }
});

/* =========================
   REJECT HALL
========================= */
router.put("/halls/:id/reject", async (req, res) => {
  try {
    const hall = await Hall.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );

    res.json({
      message: "Hall rejected ❌",
      hall,
    });
  } catch (error) {
    console.error("REJECT HALL ERROR ❌", error);
    res.status(500).json({
      message: "Failed to reject hall",
    });
  }
});

module.exports = router;