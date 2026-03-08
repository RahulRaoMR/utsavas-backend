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
      index: true,
    },

    /* =========================
       BASIC DETAILS
    ========================= */
    hallName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    category: {
      type: String,
      enum: ["wedding", "banquet", "party"],
      required: true,
      lowercase: true,
      index: true,
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
       ⭐⭐⭐ PRICE (UTSAVAM PREMIUM)
    ========================= */
    pricePerPlate: {
      type: Number,
      default: 0,
      index: true,
    },

    pricePerDay: {
      type: Number,
      default: 0,
      index: true,
    },

    pricePerEvent: {
      type: Number,
      default: 0,
      index: true,
    },

    /* =========================
       ADDRESS (SEARCH CRITICAL)
    ========================= */
    address: {
      flat: { type: String, required: true },
      floor: { type: String },

      area: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      city: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      state: { type: String, required: true },
      pincode: { type: String, required: true },
      landmark: { type: String },
    },

    /* =========================
       MAP LOCATION
    ========================= */
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },

    /* =========================
       FEATURES & POLICIES
       (MATCHES YOUR FILTER UI)
    ========================= */
    features: {
      // Primary keys used by vendor add-hall form
      diningHall: { type: Boolean, default: false },
      stage: { type: Boolean, default: false },
      powerBackup: { type: Boolean, default: false },
      airConditioning: { type: Boolean, default: false },
      nonAcHall: { type: Boolean, default: false },
      outsideFoodAllowed: { type: Boolean, default: false },
      outsideDecoratorsAllowed: { type: Boolean, default: false },
      outsideDjAllowed: { type: Boolean, default: false },
      ac: { type: Boolean, default: false },
      nonAc: { type: Boolean, default: false },
      outsideFood: { type: Boolean, default: false },
      outsideDecorators: { type: Boolean, default: false },
      outsideDJ: { type: Boolean, default: false },
      alcoholAllowed: { type: Boolean, default: false },
      valetParking: { type: Boolean, default: false },

      // Extended amenities from vendor add-hall form
      parking: { type: Boolean, default: false },
      restaurant: { type: Boolean, default: false },
      roomService: { type: Boolean, default: false },
      frontDesk24: { type: Boolean, default: false },
      fitnessCentre: { type: Boolean, default: false },
      fitnessCenter: { type: Boolean, default: false },
      nonSmokingRooms: { type: Boolean, default: false },
      spaWellness: { type: Boolean, default: false },
      freeWifi: { type: Boolean, default: false },
      evCharging: { type: Boolean, default: false },
      liquorLicense: { type: Boolean, default: false },
      hotTub: { type: Boolean, default: false },
      evChargingStation: { type: Boolean, default: false },
      swimmingPool: { type: Boolean, default: false },
      selfCatering: { type: Boolean, default: false },
      breakfastIncluded: { type: Boolean, default: false },
      allMealsIncluded: { type: Boolean, default: false },
      breakfastDinnerIncluded: { type: Boolean, default: false },
      bonfireIncluded: { type: Boolean, default: false },
      privateDiningIncluded: { type: Boolean, default: false },
      freeCancellation: { type: Boolean, default: false },
      catering: { type: Boolean, default: false },
      inhouseStaffAllowed: { type: Boolean, default: false },
      shuttleAvailable: { type: Boolean, default: false },
      indoorVenue: { type: Boolean, default: false },
      danceFloor: { type: Boolean, default: false },
      smokingRoom: { type: Boolean, default: false },
      ageOfBookingGuests: { type: Boolean, default: false },
      nearWifi: { type: Boolean, default: false },
      wheelchairAccessible: { type: Boolean, default: false },
      cctvCoverage: { type: Boolean, default: false },
      minibarIncluded: { type: Boolean, default: false },
      acceptsOnlinePayments: { type: Boolean, default: false },
      airportShuttle: { type: Boolean, default: false },
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
      index: true,
    },
  },
  { timestamps: true }
);

/* =========================
   🔥 COMPOUND INDEX (FAST SEARCH)
========================= */
hallSchema.index({
  "address.city": 1,
  "address.area": 1,
  category: 1,
  status: 1,
});

module.exports =
  mongoose.models.Hall || mongoose.model("Hall", hallSchema);
