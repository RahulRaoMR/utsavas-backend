const express = require("express");
const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const Booking = require("../models/Booking");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

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

const buildReceiptId = (bookingId) => {
  const bookingPart = String(bookingId || "").slice(-12);
  const timePart = Date.now().toString().slice(-8);

  return `bk_${bookingPart}_${timePart}`;
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
      receipt: buildReceiptId(booking._id),
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

module.exports = router;
