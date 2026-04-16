const express = require("express");
const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const Booking = require("../models/Booking");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const {
  FREE_PHONE_REVEAL_LIMIT,
  getPhoneRevealPricing,
} = require("../utils/phoneRevealPricing");

const router = express.Router();

const normalizePhone = (phone) => {
  if (!phone) return "";

  let value = String(phone).replace(/\D/g, "");

  if (value.length === 10) {
    value = `91${value}`;
  }

  return value;
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const buildReceiptId = (prefix, entityId) => {
  const bookingPart = String(entityId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-12);
  const timePart = Date.now().toString().slice(-8);

  return `${prefix}_${bookingPart}_${timePart}`;
};

const getPaymentErrorMessage = (error, fallbackMessage) =>
  error?.error?.description ||
  error?.description ||
  error?.message ||
  fallbackMessage;

const bookingBelongsToUser = (booking, user) => {
  if (!booking || !user) {
    return false;
  }

  if (booking.customer && String(booking.customer) === String(user._id)) {
    return true;
  }

  const bookingEmail = normalizeEmail(booking.customerEmail);
  const userEmail = normalizeEmail(user.email);

  if (bookingEmail && userEmail && bookingEmail === userEmail) {
    return true;
  }

  const bookingPhone = normalizePhone(booking.phone);
  const userPhone = normalizePhone(user.phone);

  return Boolean(bookingPhone && userPhone && bookingPhone === userPhone);
};

router.get("/config", (req, res) => {
  res.json({
    keyId: process.env.RAZORPAY_KEY_ID || "",
  });
});

/* =========================
   CREATE RAZORPAY ORDER
========================= */
router.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ message: "Booking ID is required" });
    }

    const [booking, user] = await Promise.all([
      Booking.findById(bookingId),
      User.findById(req.user.id).select("email phone"),
    ]);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!user || !bookingBelongsToUser(booking, user)) {
      return res.status(403).json({ message: "You can pay only for your own booking" });
    }

    const bookingAmount = Number(booking.amount) || 0;

    if (bookingAmount <= 0) {
      return res.status(400).json({ message: "Booking amount is invalid" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(bookingAmount * 100),
      currency: "INR",
      receipt: buildReceiptId("bk", booking._id),
      notes: {
        bookingId: String(booking._id),
      },
    });

    booking.razorpayOrderId = order.id;
    booking.paymentMethod = "online";
    booking.paymentStatus = "pending";
    await booking.save();

    res.json(order);
  } catch (error) {
    console.error("CREATE ORDER ERROR", error);
    res.status(500).json({
      message: getPaymentErrorMessage(error, "Failed to create order"),
    });
  }
});

router.post("/phone-reveal/create-order", authMiddleware, async (req, res) => {
  try {
    const { hallId } = req.body || {};
    const user = await User.findById(req.user.id).select(
      "phoneRevealSubscriptionActive phoneRevealPaymentOrderId phoneRevealPaymentStatus phoneRevealPaymentId phoneRevealPaymentVerifiedAt phoneRevealPaymentGstAmount phoneRevealPaymentTotalAmount phoneRevealSubscriptionAmount phoneRevealSubscriptionActivatedAt"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const pricing = getPhoneRevealPricing();

    if (user.phoneRevealSubscriptionActive) {
      return res.status(409).json({
        success: false,
        alreadyUnlocked: true,
        unlockAmount: pricing.baseAmount,
        gstRate: pricing.gstRate,
        gstAmount: pricing.gstAmount,
        totalAmount: pricing.totalAmount,
        currency: pricing.currency,
        message: "Paid access is already active for hall phone numbers.",
      });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(pricing.totalAmount * 100),
      currency: pricing.currency,
      receipt: buildReceiptId("ph", user._id),
      notes: {
        type: "phone_reveal_unlock",
        userId: String(user._id),
        hallId: String(hallId || ""),
        baseAmount: String(pricing.baseAmount),
        gstAmount: String(pricing.gstAmount),
        totalAmount: String(pricing.totalAmount),
      },
    });

    user.phoneRevealPaymentOrderId = order.id;
    user.phoneRevealPaymentId = "";
    user.phoneRevealPaymentStatus = "pending";
    user.phoneRevealPaymentGstAmount = pricing.gstAmount;
    user.phoneRevealPaymentTotalAmount = pricing.totalAmount;
    user.phoneRevealPaymentVerifiedAt = null;
    await user.save();

    return res.json({
      ...order,
      unlockAmount: pricing.baseAmount,
      gstRate: pricing.gstRate,
      gstAmount: pricing.gstAmount,
      totalAmount: pricing.totalAmount,
      currency: pricing.currency,
    });
  } catch (error) {
    console.error("CREATE PHONE REVEAL ORDER ERROR", error);
    return res.status(500).json({
      message: getPaymentErrorMessage(error, "Failed to create payment order"),
    });
  }
});

router.post("/verify", authMiddleware, async (req, res) => {
  try {
    const {
      bookingId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body;

    if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: "Missing payment verification details" });
    }

    const [booking, user] = await Promise.all([
      Booking.findById(bookingId),
      User.findById(req.user.id).select("email phone"),
    ]);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!user || !bookingBelongsToUser(booking, user)) {
      return res.status(403).json({ message: "You can verify only your own booking payment" });
    }

    if (!booking.razorpayOrderId || booking.razorpayOrderId !== razorpayOrderId) {
      booking.paymentMethod = "online";
      booking.paymentStatus = "failed";
      await booking.save();

      return res.status(400).json({ message: "Payment order does not match this booking" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${booking.razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      booking.paymentMethod = "online";
      booking.paymentStatus = "failed";
      await booking.save();

      return res.status(400).json({ message: "Payment signature verification failed" });
    }

    booking.paymentMethod = "online";
    booking.paymentStatus = "paid";
    booking.razorpayPaymentId = razorpayPaymentId;
    booking.paymentVerifiedAt = new Date();
    await booking.save();

    res.json({
      message: "Payment verified successfully",
      booking,
    });
  } catch (error) {
    console.error("VERIFY PAYMENT ERROR", error);
    res.status(500).json({
      message: getPaymentErrorMessage(error, "Payment verification failed"),
    });
  }
});

router.post("/phone-reveal/verify", authMiddleware, async (req, res) => {
  try {
    const {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: "Missing payment verification details" });
    }

    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (
      !user.phoneRevealPaymentOrderId ||
      user.phoneRevealPaymentOrderId !== razorpayOrderId
    ) {
      user.phoneRevealPaymentStatus = "failed";
      await user.save();

      return res
        .status(400)
        .json({ message: "Payment order does not match this phone access request" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${user.phoneRevealPaymentOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      user.phoneRevealPaymentStatus = "failed";
      await user.save();

      return res.status(400).json({ message: "Payment signature verification failed" });
    }

    const pricing = getPhoneRevealPricing();
    const verifiedAt = new Date();

    user.phoneRevealSubscriptionActive = true;
    user.phoneRevealSubscriptionAmount = pricing.baseAmount;
    user.phoneRevealSubscriptionActivatedAt = verifiedAt;
    user.phoneRevealPaymentId = razorpayPaymentId;
    user.phoneRevealPaymentStatus = "paid";
    user.phoneRevealPaymentGstAmount = pricing.gstAmount;
    user.phoneRevealPaymentTotalAmount = pricing.totalAmount;
    user.phoneRevealPaymentVerifiedAt = verifiedAt;
    await user.save();

    return res.json({
      success: true,
      message: "Payment successful. All hall phone numbers are now unlocked.",
      unlockAmount: pricing.baseAmount,
      gstRate: pricing.gstRate,
      gstAmount: pricing.gstAmount,
      totalAmount: pricing.totalAmount,
      currency: pricing.currency,
      user: {
        phoneRevealSubscriptionActive: true,
        phoneRevealSubscriptionAmount: pricing.baseAmount,
        phoneRevealPaymentGstAmount: pricing.gstAmount,
        phoneRevealPaymentTotalAmount: pricing.totalAmount,
        phoneRevealFreeUsed: Array.isArray(user.phoneRevealHallIds)
          ? user.phoneRevealHallIds.length
          : 0,
        phoneRevealFreeLimit: FREE_PHONE_REVEAL_LIMIT,
      },
    });
  } catch (error) {
    console.error("VERIFY PHONE REVEAL PAYMENT ERROR", error);
    return res.status(500).json({
      message: getPaymentErrorMessage(error, "Payment verification failed"),
    });
  }
});

module.exports = router;
