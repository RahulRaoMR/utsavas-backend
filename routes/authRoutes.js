const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const User = require("../models/User");

const router = express.Router();

// temporary store for reset OTP
const resetOtpStore = new Map();

/* =========================
   🔧 PHONE NORMALIZER
========================= */
const normalizePhone = (phone) => {
  if (!phone) return phone;

  let p = phone.toString().replace(/\D/g, "");

  // if user enters 10 digit → add country code
  if (p.length === 10) {
    p = "91" + p;
  }

  return p;
};

/* =========================
   ✅ REGISTER USER
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

    // 🔍 check existing
    const existing = await User.findOne({
      $or: [{ email }, { phone: cleanPhone }],
    });

    if (existing) {
      return res.json({
        success: false,
        message: "User already exists",
      });
    }

    // 🔐 hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 👤 create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      phone: cleanPhone,
      city,
      country,
      gender,
      password: hashedPassword,
    });

    // 🎫 token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user,
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* =========================
   ✅ LOGIN USER (EMAIL OR PHONE)
========================= */
router.post("/login", async (req, res) => {
  try {
    let { emailOrPhone, password } = req.body;

    if (!emailOrPhone || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/Phone and password required",
      });
    }

    emailOrPhone = emailOrPhone.toString().trim();

    let query = {};

    // ✅ EMAIL LOGIN
    if (emailOrPhone.includes("@")) {
      query.email = emailOrPhone.toLowerCase();
    } else {
      // ✅ PHONE LOGIN (AUTO HANDLE 91)
      const cleanPhone = normalizePhone(emailOrPhone);
      query.phone = cleanPhone;
    }

    const user = await User.findOne(query);

    if (!user) {
      return res.json({
        success: false,
        message: "User not found",
      });
    }

    // 🔐 password check
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({
        success: false,
        message: "Invalid password",
      });
    }

    // 🎫 token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user,
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* =========================
   🔐 SEND RESET OTP
========================= */
router.post("/forgot-password/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    const cleanPhone = normalizePhone(phone);

    const user = await User.findOne({ phone: cleanPhone });

    if (!user) {
      return res.json({
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

    res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    console.error("RESET OTP ERROR:", err.response?.data || err.message);
    res.status(500).json({ success: false });
  }
});

/* =========================
   🔐 VERIFY RESET OTP
========================= */
router.post("/forgot-password/verify-otp", (req, res) => {
  const { phone, otp } = req.body;

  const cleanPhone = normalizePhone(phone);
  const data = resetOtpStore.get(cleanPhone);

  if (!data) {
    return res.json({ success: false, message: "OTP not found" });
  }

  if (Date.now() > data.expires) {
    resetOtpStore.delete(cleanPhone);
    return res.json({ success: false, message: "OTP expired" });
  }

  if (Number(otp) !== data.otp) {
    return res.json({ success: false, message: "Invalid OTP" });
  }

  res.json({ success: true });
});

/* =========================
   🔐 RESET PASSWORD
========================= */
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { phone, newPassword } = req.body;

    const cleanPhone = normalizePhone(phone);

    const user = await User.findOne({ phone: cleanPhone });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    await user.save();

    resetOtpStore.delete(cleanPhone);

    res.json({ success: true, message: "Password updated" });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
