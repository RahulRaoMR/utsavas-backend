const mongoose = require("mongoose");

const hallSchema = new mongoose.Schema(
  {
    /* =========================
       RELATION
    ========================= */
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    /* =========================
       BASIC DETAILS
    ========================= */
    hallName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: ["wedding", "banquet", "party"],
      required: true,
    },

    capacity: {
      type: Number,
      default: 0,
    },

    parkingCapacity: {
      type: Number,
      default: 0,
    },

    rooms: {
      type: Number,
      default: 0,
    },

    about: {
      type: String,
      default: "",
    },

    /* =========================
       ADDRESS (LIKE SWIGGY / UBER)
    ========================= */
    address: {
      flat: { type: String, required: true },
      floor: { type: String },
      area: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      landmark: { type: String },
    },

    /* =========================
       MAP LOCATION
    ========================= */
    location: {
      lat: {
        type: Number,
        required: true,
      },
      lng: {
        type: Number,
        required: true,
      },
    },

    /* =========================
       FEATURES & POLICIES
    ========================= */
    features: {
      diningHall: { type: Boolean, default: false },
      stage: { type: Boolean, default: false },
      powerBackup: { type: Boolean, default: false },
      ac: { type: Boolean, default: false },
      nonAc: { type: Boolean, default: false },
      outsideFood: { type: Boolean, default: false },
      outsideDecorators: { type: Boolean, default: false },
      outsideDJ: { type: Boolean, default: false },
      alcoholAllowed: { type: Boolean, default: false },
      valetParking: { type: Boolean, default: false },
    },

    /* =========================
       IMAGES
    ========================= */
    images: {
      type: [String],
      default: [],
    },

    /* =========================
       ADMIN APPROVAL
    ========================= */
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Hall || mongoose.model("Hall", hallSchema);