const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const vendorSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },

    ownerName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    serviceType: {
      type: String,
      required: true,
      enum: [
        "premium-venues",
        "resorts",
        "banquet-halls",
        "farm-houses",
        "convention-halls",
        "kalyana-mandapams",
        "destination-weddings",
        "lawns",
        "5-star-hotels",
        "4-star-hotels",
        "mini-halls",
        "fort-and-palaces",
        "wedding",
        "party",
        "service",
      ],
    },

    password: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

/* =========================
   HASH PASSWORD BEFORE SAVE
========================= */
vendorSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

/* =========================
   COMPARE PASSWORD
========================= */
vendorSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Vendor", vendorSchema);
