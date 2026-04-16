const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
      default: "",
    },
    lastName: {
      type: String,
      trim: true,
      default: "",
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    country: {
      type: String,
      trim: true,
      default: "",
    },
    gender: {
      type: String,
      trim: true,
      default: "",
    },
    password: {
      type: String,
      required: true,
    },
    phoneRevealHallIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Hall",
        },
      ],
      default: [],
    },
    phoneRevealSubscriptionActive: {
      type: Boolean,
      default: false,
    },
    phoneRevealSubscriptionAmount: {
      type: Number,
      default: 0,
    },
    phoneRevealSubscriptionActivatedAt: {
      type: Date,
      default: null,
    },
    phoneRevealPaymentOrderId: {
      type: String,
      trim: true,
      default: "",
    },
    phoneRevealPaymentId: {
      type: String,
      trim: true,
      default: "",
    },
    phoneRevealPaymentStatus: {
      type: String,
      trim: true,
      default: "",
    },
    phoneRevealPaymentGstAmount: {
      type: Number,
      default: 0,
    },
    phoneRevealPaymentTotalAmount: {
      type: Number,
      default: 0,
    },
    phoneRevealPaymentVerifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
