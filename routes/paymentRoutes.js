const express = require("express");
const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const Booking = require("../models/Booking");

const router = express.Router();

router.get("/config", (req, res) => {
  res.json({
    keyId: process.env.RAZORPAY_KEY_ID || "",
  });
});

/* =========================
   CREATE RAZORPAY ORDER
========================= */
router.post("/create-order", async (req, res) => {
  try {
    const { amount, bookingId } = req.body;

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    if (!bookingId) {
      return res.status(400).json({ message: "Booking ID is required" });
    }

    const order = await razorpay.orders.create({
      amount: Number(amount) * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        bookingId: String(bookingId),
      },
    });

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to create order" });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const {
      bookingId,
      amount,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body;

    if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: "Missing payment verification details" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      await Booking.findByIdAndUpdate(bookingId, {
        paymentMethod: "online",
        paymentStatus: "failed",
      });

      return res.status(400).json({ message: "Payment signature verification failed" });
    }

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        paymentMethod: "online",
        paymentStatus: "paid",
        amount: Number(amount) || 0,
      },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json({
      message: "Payment verified successfully",
      booking,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Payment verification failed" });
  }
});

module.exports = router;
