const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    // Hall being booked
    hall: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hall",
      required: true,
    },

    // Vendor (hall owner)
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    // 🔥 NEW: Check-in date
    checkIn: {
      type: Date,
      required: true,
    },

    // 🔥 NEW: Check-out date
    checkOut: {
      type: Date,
      required: true,
    },

    eventType: {
      type: String,
      required: true,
    },

    guests: {
      type: Number,
    },

    customerName: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);