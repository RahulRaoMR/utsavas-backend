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

    // ✅ Check-in date
    checkIn: {
      type: Date,
      required: true,
      index: true,
    },

    // ✅ Check-out date
    checkOut: {
      type: Date,
      required: true,
      index: true,
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

    // 🔥 IMPORTANT: match frontend colors
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

/* ===================================
   🔥 Prevent double booking (VERY IMPORTANT)
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
