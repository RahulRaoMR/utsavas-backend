const express = require("express");
const axios = require("axios");

const router = express.Router();

// 🔥 temporary OTP store
const otpStore = new Map();

/* =========================
   SEND OTP
========================= */
router.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone required",
      });
    }

    // ✅ generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // ✅ store OTP for 5 minutes
    otpStore.set(phone, {
      otp,
      expires: Date.now() + 5 * 60 * 1000,
    });

    console.log("Generated OTP:", otp);

    // 🚀 Fast2SMS API call
    await axios.get("https://www.fast2sms.com/dev/bulkV2", {
      params: {
        authorization:
          "5T32lKEdfGSrVqbpX8YmNiCOz4gsWkwQFj6ZLRuaDhv9B0UxM7ESiBPntd9YLKcJ7O2F5C0emabX4zgh",
        route: "q",
        message: `Your UTSAVAS OTP is ${otp}`,
        language: "english",
        flash: 0,
        numbers: phone,
      },
    });

    res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("SEND OTP ERROR:", error.response?.data || error.message);

    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
});

/* =========================
   VERIFY OTP
========================= */
router.post("/verify-otp", (req, res) => {
  try {
    const { phone, otp } = req.body;

    const data = otpStore.get(phone);

    if (!data) {
      return res.json({
        success: false,
        message: "OTP not found",
      });
    }

    if (Date.now() > data.expires) {
      otpStore.delete(phone);
      return res.json({
        success: false,
        message: "OTP expired",
      });
    }

    if (Number(otp) !== data.otp) {
      return res.json({
        success: false,
        message: "Invalid OTP",
      });
    }

    otpStore.delete(phone);

    res.json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Verification failed",
    });
  }
});

module.exports = router; // ✅ VERY IMPORTANT
