const express = require("express");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/* =========================
   TEMP STORE FOR RESET OTP
========================= */
const resetOtpStore = new Map();

/* =========================
   HELPERS
========================= */
const normalizePhone = (phone) => {
  if (!phone) return phone;

  let value = phone.toString().replace(/\D/g, "");

  if (value.length === 10) {
    value = `91${value}`;
  }

  return value;
};

const serializeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    _id: user._id,
    id: String(user._id),
    name: user.name || "",
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    email: user.email || "",
    phone: user.phone || "",
    city: user.city || "",
    country: user.country || "",
    gender: user.gender || "",
  };
};

/* =========================
   REGISTER USER
========================= */
router.post("/register", async (req, res) => {
  try {
    let {
      firstName,
      lastName,
      email,
      phone,
      city,
      country,
      gender,
      password,
    } = req.body;

    if (!firstName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    email = email.toLowerCase().trim();
    const cleanPhone = normalizePhone(phone);

    const existing = await User.findOne({
      $or: [{ email }, { phone: cleanPhone }],
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const fullName = `${firstName || ""} ${lastName || ""}`.trim();

    const user = await User.create({
      name: fullName,
      firstName,
      lastName,
      email,
      phone: cleanPhone,
      city,
      country,
      gender,
      password: hashedPassword,
    });

    const token = generateToken({
      id: String(user._id),
      role: "user",
    });

    res.json({
      success: true,
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* =========================
   LOGIN USER
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, phone, identifier, emailOrPhone, password } = req.body;
    const loginValue = email || phone || identifier || emailOrPhone;

    if (!loginValue || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/Phone and password required",
      });
    }

    let user;

    if (String(loginValue).includes("@")) {
      user = await User.findOne({
        email: loginValue.toLowerCase().trim(),
      });
    } else {
      user = await User.findOne({
        phone: normalizePhone(loginValue),
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    const token = generateToken({
      id: String(user._id),
      role: "user",
    });

    res.json({
      success: true,
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* =========================
   GET CURRENT USER (ME)
========================= */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("ME ERROR:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
});

/* =========================
   SEND RESET OTP
========================= */
router.post("/forgot-password/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    const cleanPhone = normalizePhone(phone);

    const user = await User.findOne({ phone: cleanPhone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    resetOtpStore.set(cleanPhone, {
      otp,
      expires: Date.now() + 5 * 60 * 1000,
    });

    await axios.get("https://www.fast2sms.com/dev/bulkV2", {
      params: {
        authorization: process.env.FAST2SMS_API_KEY,
        route: "q",
        message: `Your UTSAVAS password reset OTP is ${otp}`,
        language: "english",
        flash: 0,
        numbers: cleanPhone,
      },
    });

    res.json({
      success: true,
      message: "OTP sent",
    });
  } catch (error) {
    console.error("RESET OTP ERROR:", error.response?.data || error.message);

    res.status(500).json({
      success: false,
      message: "OTP send failed",
    });
  }
});

/* =========================
   VERIFY RESET OTP
========================= */
router.post("/forgot-password/verify-otp", (req, res) => {
  const { phone, otp } = req.body;
  const cleanPhone = normalizePhone(phone);
  const data = resetOtpStore.get(cleanPhone);

  if (!data) {
    return res.status(404).json({
      success: false,
      message: "OTP not found",
    });
  }

  if (Date.now() > data.expires) {
    resetOtpStore.delete(cleanPhone);

    return res.status(400).json({
      success: false,
      message: "OTP expired",
    });
  }

  if (Number(otp) !== data.otp) {
    return res.status(400).json({
      success: false,
      message: "Invalid OTP",
    });
  }

  res.json({
    success: true,
  });
});

/* =========================
   RESET PASSWORD
========================= */
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { phone, newPassword } = req.body;
    const cleanPhone = normalizePhone(phone);

    const user = await User.findOne({ phone: cleanPhone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    await user.save();

    resetOtpStore.delete(cleanPhone);

    res.json({
      success: true,
      message: "Password updated",
    });
  } catch (error) {
    console.error("RESET PASSWORD ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Password reset failed",
    });
  }
});

module.exports = router;
