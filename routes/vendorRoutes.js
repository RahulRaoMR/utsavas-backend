const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Vendor = require("../models/Vendor");
const Hall = require("../models/Hall");
const Booking = require("../models/Booking");
const generateToken = require("../utils/generateToken");
const authMiddleware = require("../middleware/authMiddleware");
const uploadVendorDocuments = require("../middleware/uploadVendorDocuments");
const { sendVendorPasswordResetOtpEmail } = require("../utils/vendorPasswordResetEmail");
const { getMailErrorMessage } = require("../utils/bookingConfirmationEmail");

const { requireAdmin } = authMiddleware;
const router = express.Router();
const vendorResetOtpStore = new Map();
const VENDOR_RESET_OTP_TTL_MS = 5 * 60 * 1000;

const VALID_VENDOR_SERVICE_TYPES = [
  "banquet",
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

const VALID_IDENTITY_PROOF_TYPES = [
  "aadhaar-card",
  "passport",
  "driving-license",
];

const VALID_ADDRESS_PROOF_TYPES = [
  "electricity-bill",
  "rental-agreement",
  "shop-license",
];

const VENDOR_DOCUMENT_UPLOAD_FIELDS = [
  { name: "gstCertificate", maxCount: 1 },
  { name: "panCardDocument", maxCount: 1 },
  { name: "identityProofDocument", maxCount: 1 },
  { name: "addressProofDocument", maxCount: 1 },
];

const uploadVendorDocumentFields = uploadVendorDocuments.fields(
  VENDOR_DOCUMENT_UPLOAD_FIELDS
);

const normalizeProofType = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeUppercaseText = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const getUploadedFileUrl = (files, fieldName) => {
  const file = files?.[fieldName]?.[0];

  if (!file) {
    return "";
  }

  return file.location || `/uploads/vendor-documents/${file.filename}`;
};

const GSTIN_PATTERN =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const parseVendorRegisterUpload = (req, res, next) => {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();

  if (!contentType.includes("multipart/form-data")) {
    next();
    return;
  }

  uploadVendorDocumentFields(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Each legal document must be 5MB or smaller"
        : error.message || "Document upload failed";

    res.status(400).json({
      success: false,
      message,
    });
  });
};

const serializeVendor = (vendor) => {
  if (!vendor) {
    return null;
  }

  const verificationDocuments = vendor.verificationDocuments || {};

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
    isOnline: Boolean(vendor.isOnline),
    autoReplyEnabled:
      typeof vendor.autoReplyEnabled === "boolean"
        ? vendor.autoReplyEnabled
        : true,
    verificationDocuments: {
      gstNumber: verificationDocuments.gstNumber || "",
      gstCertificateUrl: verificationDocuments.gstCertificateUrl || "",
      panNumber: verificationDocuments.panNumber || "",
      panCardUrl: verificationDocuments.panCardUrl || "",
      identityProofType: verificationDocuments.identityProofType || "",
      identityProofUrl: verificationDocuments.identityProofUrl || "",
      addressProofType: verificationDocuments.addressProofType || "",
      addressProofUrl: verificationDocuments.addressProofUrl || "",
      submittedAt: verificationDocuments.submittedAt || null,
    },
    createdAt: vendor.createdAt || null,
    updatedAt: vendor.updatedAt || null,
  };
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const generateOtp = () =>
  String(Math.floor(100000 + Math.random() * 900000));

/* =========================
   TEST ROUTE
========================= */
router.get("/test", (req, res) => {
  res.json({ success: true, message: "Vendor route OK" });
});

/* =========================
   VENDOR REGISTER
========================= */
router.post("/register", parseVendorRegisterUpload, async (req, res) => {
  try {
    const requestBody =
      req.body && typeof req.body === "object" ? req.body : {};

    if (Object.keys(requestBody).length === 0) {
      console.error("REGISTER ERROR: empty request body", {
        contentType: req.headers["content-type"] || "",
        hasFiles: Boolean(req.files && Object.keys(req.files).length > 0),
      });

      return res.status(400).json({
        success: false,
        message:
          "Registration form data is missing. Please fill the form again and re-upload the documents.",
      });
    }

    let {
      businessName,
      ownerName,
      phone,
      email,
      city,
      serviceType,
      password,
      gstNumber,
      panNumber,
      identityProofType,
      addressProofType,
    } = requestBody;

    businessName = businessName?.toString().trim();
    ownerName = ownerName?.toString().trim();
    phone = phone?.toString().trim();
    email = email?.toString().toLowerCase().trim();
    city = city?.toString().trim();
    serviceType = serviceType?.toString().trim().toLowerCase();
    gstNumber = normalizeUppercaseText(gstNumber);
    panNumber = normalizeUppercaseText(panNumber);
    identityProofType = normalizeProofType(identityProofType);
    addressProofType = normalizeProofType(addressProofType);

    const gstCertificateUrl = getUploadedFileUrl(req.files, "gstCertificate");
    const panCardUrl = getUploadedFileUrl(req.files, "panCardDocument");
    const identityProofUrl = getUploadedFileUrl(
      req.files,
      "identityProofDocument"
    );
    const addressProofUrl = getUploadedFileUrl(
      req.files,
      "addressProofDocument"
    );

    if (
      !businessName ||
      !ownerName ||
      !phone ||
      !email ||
      !city ||
      !serviceType ||
      !password ||
      !gstNumber ||
      !gstCertificateUrl ||
      !panNumber ||
      !panCardUrl ||
      !identityProofType ||
      !identityProofUrl ||
      !addressProofType ||
      !addressProofUrl
    ) {
      return res.status(400).json({
        success: false,
        message: "All registration and legal document fields are required",
      });
    }

    if (!VALID_VENDOR_SERVICE_TYPES.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service type",
      });
    }

    if (!GSTIN_PATTERN.test(gstNumber)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid GSTIN",
      });
    }

    if (!PAN_PATTERN.test(panNumber)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid PAN number",
      });
    }

    if (!VALID_IDENTITY_PROOF_TYPES.includes(identityProofType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid identity proof type",
      });
    }

    if (!VALID_ADDRESS_PROOF_TYPES.includes(addressProofType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid address proof type",
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
      verificationDocuments: {
        gstNumber,
        gstCertificateUrl,
        panNumber,
        panCardUrl,
        identityProofType,
        identityProofUrl,
        addressProofType,
        addressProofUrl,
        submittedAt: new Date(),
      },
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
    const normalizedIdentifier = String(identifier || "").trim().toLowerCase();
    const passwordValue = String(password || "");

    if (!normalizedIdentifier || !passwordValue) {
      return res.status(400).json({
        success: false,
        message: "Email/Phone and password required",
      });
    }

    const vendor = await Vendor.findOne({
      $or: [{ email: normalizedIdentifier }, { phone: String(identifier || "").trim() }],
    });

    if (!vendor) {
      console.warn("VENDOR LOGIN FAILED: unknown account", {
        identifier: normalizedIdentifier,
      });
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (vendor.status !== "approved") {
      console.warn("VENDOR LOGIN BLOCKED: account not approved", {
        vendorId: String(vendor._id),
      });
      return res.status(403).json({
        success: false,
        message: "Account not approved by admin yet",
      });
    }

    const isMatch = await vendor.comparePassword(passwordValue);

    if (!isMatch) {
      console.warn("VENDOR LOGIN FAILED: invalid password", {
        vendorId: String(vendor._id),
      });
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
   VENDOR FORGOT PASSWORD
========================= */
router.post("/forgot-password/send-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Registered email is required",
      });
    }

    const vendor = await Vendor.findOne({ email });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor account not found for this email",
      });
    }

    const otp = generateOtp();

    await sendVendorPasswordResetOtpEmail({
      to: vendor.email,
      ownerName: vendor.ownerName,
      businessName: vendor.businessName,
      otp,
    });

    vendorResetOtpStore.set(email, {
      otp,
      expires: Date.now() + VENDOR_RESET_OTP_TTL_MS,
      verified: false,
    });

    return res.json({
      success: true,
      message: "OTP sent to your registered email",
    });
  } catch (error) {
    console.error("VENDOR SEND RESET OTP ERROR", error?.response?.data || error);

    return res.status(500).json({
      success: false,
      message: getMailErrorMessage(error),
    });
  }
});

router.post("/forgot-password/verify-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const data = vendorResetOtpStore.get(email);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "OTP not found. Request a new OTP.",
      });
    }

    if (Date.now() > data.expires) {
      vendorResetOtpStore.delete(email);
      return res.status(400).json({
        success: false,
        message: "OTP expired. Request a new OTP.",
      });
    }

    if (otp !== data.otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    vendorResetOtpStore.set(email, {
      ...data,
      verified: true,
    });

    return res.json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("VENDOR VERIFY RESET OTP ERROR", error);

    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
});

router.post("/forgot-password/reset", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const newPassword = String(req.body?.newPassword || "").trim();

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }

    const resetData = vendorResetOtpStore.get(email);

    if (!resetData) {
      return res.status(400).json({
        success: false,
        message: "Request and verify OTP before resetting password",
      });
    }

    if (Date.now() > resetData.expires) {
      vendorResetOtpStore.delete(email);
      return res.status(400).json({
        success: false,
        message: "OTP expired. Request a new OTP.",
      });
    }

    if (!resetData.verified) {
      return res.status(400).json({
        success: false,
        message: "Verify OTP before resetting password",
      });
    }

    const vendor = await Vendor.findOne({ email });

    if (!vendor) {
      vendorResetOtpStore.delete(email);
      return res.status(404).json({
        success: false,
        message: "Vendor account not found",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await Vendor.updateOne(
      { _id: vendor._id },
      {
        $set: {
          password: hashedPassword,
        },
      }
    );

    vendorResetOtpStore.delete(email);

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("VENDOR RESET PASSWORD ERROR", error);

    return res.status(500).json({
      success: false,
      message: "Password reset failed",
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
