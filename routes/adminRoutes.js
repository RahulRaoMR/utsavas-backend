const express = require("express");
const Admin = require("../models/Admin");
const Vendor = require("../models/Vendor");
const Hall = require("../models/Hall");
const Booking = require("../models/Booking");
const generateToken = require("../utils/generateToken");

const router = express.Router();

/* =========================
   ADMIN LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;
    email = email?.toString().toLowerCase().trim();
    password = password?.toString();

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

    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
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
    res.status(500).json({ message: "Server error" });
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
   GET PENDING HALLS
========================= */
router.get("/halls", async (req, res) => {
  try {
    const rawStatus = (req.query.status || "pending").toString().toLowerCase();
    const filter =
      rawStatus === "all"
        ? {}
        : ["pending", "approved", "rejected"].includes(rawStatus)
          ? { status: rawStatus }
          : { status: "pending" };

    const halls = await Hall.find(filter)
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

/* ======================================================
   🗑️ CASCADE DELETE VENDOR — PRODUCTION SAFE
====================================================== */
router.delete("/vendors/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;

    console.log("🗑️ Admin deleting vendor:", vendorId);

    // ✅ check vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        message: "Vendor not found",
      });
    }

    // ✅ find halls of vendor
    const halls = await Hall.find({ vendor: vendorId });
    const hallIds = halls.map((h) => h._id);

    // ✅ delete ALL related bookings (single efficient query)
    await Booking.deleteMany({
      $or: [
        { vendor: vendorId },
        { hall: { $in: hallIds } },
      ],
    });

    // ✅ delete halls
    await Hall.deleteMany({ vendor: vendorId });

    // ✅ delete vendor
    await Vendor.findByIdAndDelete(vendorId);

    console.log("✅ Vendor cascade deleted successfully");

    res.json({
      message: "Vendor and related data deleted successfully ✅",
    });
  } catch (error) {
    console.error("DELETE VENDOR ERROR ❌", error);
    res.status(500).json({
      message: "Failed to delete vendor",
    });
  }
});

/* ======================================================
   ADMIN — GET ALL BOOKINGS (CALENDAR READY)
====================================================== */
router.get("/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("vendor", "businessName")
      .populate("hall", "hallName")
      .sort({ createdAt: -1 });

    const formatted = bookings.map((b) => ({
      _id: b._id,
      customerName: b.customerName,
      vendorName: b.vendor?.businessName || "N/A",
      hallName: b.hall?.hallName || "N/A",

      // ⭐ calendar
      checkIn: b.checkIn,
      checkOut: b.checkOut,

      // ⭐ payment safe defaults
      paymentMethod: b.paymentMethod || "venue",
      paymentStatus: b.paymentStatus || "pending",
      amount: b.amount || 0,

      status: b.status,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("ADMIN BOOKINGS ERROR ❌", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
