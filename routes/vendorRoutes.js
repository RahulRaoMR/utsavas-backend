const express = require("express");
const mongoose = require("mongoose");
const Vendor = require("../models/Vendor");
const Hall = require("../models/Hall");
const Booking = require("../models/Booking");
const generateToken = require("../utils/generateToken");
const authMiddleware = require("../middleware/authMiddleware");

const { requireAdmin } = authMiddleware;
const router = express.Router();

const VALID_VENDOR_SERVICE_TYPES = [
  "premium-venues",
  "resorts",
  "banquet-halls",
  "farm-houses",
  "convention-halls",
  "kalyana-mandapams",
  "destination-weddings",
  "lawns",
  "5-star-hotels",
  "4-star-hotels",
  "mini-halls",
  "fort-and-palaces",
  "wedding",
  "party",
  "service",
];

const serializeVendor = (vendor) => {
  if (!vendor) {
    return null;
  }

  return {
    _id: vendor._id,
    id: String(vendor._id),
    businessName: vendor.businessName || "",
    ownerName: vendor.ownerName || "",
    email: vendor.email || "",
    phone: vendor.phone || "",
    city: vendor.city || "",
    serviceType: vendor.serviceType || "",
    status: vendor.status || "pending",
    createdAt: vendor.createdAt || null,
    updatedAt: vendor.updatedAt || null,
  };
};

/* =========================
   TEST ROUTE
========================= */
router.get("/test", (req, res) => {
  res.json({ success: true, message: "Vendor route OK" });
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
      password,
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
        message: "All fields are required",
      });
    }

    if (!VALID_VENDOR_SERVICE_TYPES.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service type",
      });
    }

    const existingVendor = await Vendor.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingVendor) {
      return res.status(409).json({
        success: false,
        message: "Vendor already exists",
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
      status: "pending",
    });

    await vendor.save();

    res.status(201).json({
      success: true,
      message: "Vendor registered successfully. Waiting for admin approval.",
      vendor: serializeVendor(vendor),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || "field";
      return res.status(409).json({
        success: false,
        message: `${duplicateField} already exists`,
      });
    }

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("REGISTER ERROR:", error?.message || error);

    res.status(500).json({
      success: false,
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
        success: false,
        message: "Email/Phone and password required",
      });
    }

    const normalizedIdentifier = String(identifier).trim().toLowerCase();

    const vendor = await Vendor.findOne({
      $or: [{ email: normalizedIdentifier }, { phone: String(identifier).trim() }],
    });

    if (!vendor) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (vendor.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Account not approved by admin yet",
      });
    }

    const isMatch = await vendor.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = generateToken({
      id: String(vendor._id),
      role: "vendor",
    });

    res.json({
      success: true,
      message: "Login successful",
      token,
      vendor: serializeVendor(vendor),
    });
  } catch (error) {
    console.error("LOGIN ERROR", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/* =========================
   ADMIN-ONLY VENDOR MANAGEMENT
========================= */
router.use(requireAdmin);

router.get("/all", async (req, res) => {
  try {
    const vendors = await Vendor.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      vendors: vendors.map(serializeVendor),
    });
  } catch (error) {
    console.error("FETCH VENDORS ERROR", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch vendors",
    });
  }
});

router.put("/status/:id", async (req, res) => {
  try {
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
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
        success: false,
        message: "Vendor not found",
      });
    }

    console.log(`Admin ${req.user.id} updated vendor ${vendor._id} to ${status}`);

    res.json({
      success: true,
      message: "Vendor status updated",
      vendor: serializeVendor(vendor),
    });
  } catch (error) {
    console.error("UPDATE VENDOR STATUS ERROR", error);

    res.status(500).json({
      success: false,
      message: "Failed to update status",
    });
  }
});

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
      rejected,
    });
  } catch (error) {
    console.error("VENDOR STATS ERROR", error);

    res.status(500).json({
      success: false,
      message: "Failed to load stats",
    });
  }
});

router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor id",
      });
    }

    await Booking.deleteMany({ vendor: id });
    await Hall.deleteMany({ vendor: id });

    const deletedVendor = await Vendor.findByIdAndDelete(id);

    if (!deletedVendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    console.log(`Admin ${req.user.id} deleted vendor ${id}`);

    res.json({
      success: true,
      message: "Vendor and related data deleted successfully",
    });
  } catch (error) {
    console.error("DELETE VENDOR ERROR", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete vendor",
    });
  }
});

module.exports = router;
