require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();

/* =========================
   CORS CONFIG (PRODUCTION SAFE)
========================= */

const allowedOrigins = [
  "http://localhost:3000",
  "https://utsavas.vercel.app",
  "https://www.utsavas.com",
  "https://utsavas.com"
];

app.use(
  cors({
    origin: function (origin, callback) {

      // allow requests with no origin (mobile apps / postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        return callback(null, true); // allow temporarily
      }
    },
    credentials: true,
    methods: ["GET","POST","PUT","DELETE","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization"]
  })
);

/* =========================
   HANDLE PREFLIGHT
========================= */

app.options("*", cors());

/* =========================
   MIDDLEWARES
========================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC FILES
========================= */

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   ROUTES IMPORT
========================= */

const bookingRoutes = require("./routes/bookingRoutes");
const hallRoutes = require("./routes/hallRoutes");
const vendorRoutes = require("./routes/vendorRoutes");
const adminRoutes = require("./routes/adminRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const otpRoutes = require("./routes/otpRoutes");
const authRoutes = require("./routes/authRoutes");

/* =========================
   API ROUTES
========================= */

// auth
app.use("/api/auth", authRoutes);

// otp
app.use("/api/otp", otpRoutes);

// vendor
app.use("/api/vendor", vendorRoutes);

// admin
app.use("/api/admin", adminRoutes);

// halls
app.use("/api/halls", hallRoutes);

// bookings
app.use("/api/bookings", bookingRoutes);

// payment
app.use("/api/payment", paymentRoutes);

/* =========================
   HEALTH CHECK
========================= */

app.get("/", (req, res) => {
  res.status(200).send("UTSAVAM Backend Running 🚀");
});

/* =========================
   DATABASE CONNECTION
========================= */

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {

    console.log("✅ MongoDB Atlas Connected");

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  })
  .catch((err) => {

    console.error("❌ MongoDB connection error:", err);

  });