const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    // Hall being booked
    hall: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hall",
      required: true,
      index: true, // 🔥 fast calendar queries
    },

    // Vendor (hall owner)
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // ✅ Check-in date
    checkIn: {
      type: Date,
      required: true,
      index: true,
    },

    checkInTime: {
      type: String,
      trim: true,
      default: "",
    },

    // ✅ Check-out date
    checkOut: {
      type: Date,
      required: true,
      index: true,
    },

    checkOutTime: {
      type: String,
      trim: true,
      default: "",
    },

    eventType: {
      type: String,
      required: true,
    },

    guests: {
      type: Number,
      default: 0,
    },

    customerName: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    customerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    // 🔥 BOOKING STATUS (vendor/admin decision)
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    /* =========================
       ⭐ PAYMENT FIELDS (NEW)
    ========================= */

    paymentMethod: {
      type: String,
      enum: ["online", "pay_at_venue"],
      default: "pay_at_venue",
      index: true,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
      index: true,
    },

    amount: {
      type: Number,
      default: 0,
    },

    venueAmount: {
      type: Number,
      default: 0,
    },

    supportFee: {
      type: Number,
      default: 0,
    },

    taxableAmount: {
      type: Number,
      default: 0,
    },

    subtotalAmount: {
      type: Number,
      default: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
    },

    couponCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    pricingBasis: {
      type: String,
      trim: true,
      default: "",
    },

    gstRate: {
      type: Number,
      default: 0.18,
    },

    gstHsnCode: {
      type: String,
      trim: true,
      default: "998599",
    },

    razorpayOrderId: {
      type: String,
      trim: true,
      default: "",
    },

    razorpayPaymentId: {
      type: String,
      trim: true,
      default: "",
    },

    paymentVerifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/* ===================================
   🔥 Prevent double booking (soft)
=================================== */
bookingSchema.index(
  { hall: 1, checkIn: 1, checkOut: 1 },
  { unique: false }
);

/* ===================================
   ✅ Safe model export
=================================== */
module.exports =
  mongoose.models.Booking ||
  mongoose.model("Booking", bookingSchema);
