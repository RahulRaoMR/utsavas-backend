const express = require("express");
const {
  normalizePhoneForStorage,
  sendFast2SmsOtp,
} = require("../utils/fast2sms");

const router = express.Router();
const isOtpDebugModeEnabled =
  process.env.OTP_DEBUG_MODE?.trim().toLowerCase() === "true";

// 🔥 temporary OTP store
const otpStore = new Map();

/* =========================
   SEND OTP
========================= */
router.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    const cleanPhone = normalizePhoneForStorage(phone);

    if (!cleanPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone required",
      });
    }

    // ✅ generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpAsString = String(otp);
    let providerAccepted = false;
    let fallbackReason = null;

    console.log("Generated OTP:", otp);
    try {
      await sendFast2SmsOtp({
        phone: cleanPhone,
        otp,
      });
      providerAccepted = true;
    } catch (error) {
      fallbackReason = error.message || "SMS delivery failed";

      if (!isOtpDebugModeEnabled) {
        throw error;
      }

      console.warn("SEND OTP DEBUG FALLBACK:", fallbackReason);
    }

    // ✅ store OTP for 5 minutes after provider accepts it,
    // or in debug mode when we intentionally fall back to on-screen OTP.
    otpStore.set(cleanPhone, {
      otp,
      expires: Date.now() + 5 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: providerAccepted
        ? "OTP sent successfully"
        : "SMS delivery is pending or failed. Use the debug OTP for local testing.",
      debugOtp: isOtpDebugModeEnabled ? otpAsString : undefined,
      debugMode: isOtpDebugModeEnabled,
      smsDelivery: providerAccepted ? "provider_accepted" : "debug_fallback",
      fallbackReason,
    });
  } catch (error) {
    console.error(
      "SEND OTP ERROR:",
      error.providerResponse || error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: error.message || "Failed to send OTP",
    });
  }
});

/* =========================
   VERIFY OTP
========================= */
router.post("/verify-otp", (req, res) => {
  try {
    const { phone, otp } = req.body;
    const cleanPhone = normalizePhoneForStorage(phone);

    const data = otpStore.get(cleanPhone);

    if (!data) {
      return res.json({
        success: false,
        message: "OTP not found",
      });
    }

    if (Date.now() > data.expires) {
      otpStore.delete(cleanPhone);
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

    otpStore.delete(cleanPhone);

    res.json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Verification failed",
    });
  }
});

module.exports = router; // ✅ VERY IMPORTANT
