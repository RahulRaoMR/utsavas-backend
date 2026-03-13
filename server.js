require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();

/* =========================
   CORS CONFIG (SAFE)
========================= */

const allowedOrigins = [
  "http://localhost:3000",
  "https://utsavas.vercel.app",
  "https://www.utsavas.com",
  "https://utsavas.com",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, true);
    },
    credentials: true,
  })
);

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

app.use("/api/auth", authRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/halls", hallRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payment", paymentRoutes);

/* =========================
   HEALTH CHECK
========================= */

app.get("/", (req, res) => {
  res.status(200).send("UTSAVAM Backend Running");
});

/* =========================
   DATABASE CONNECTION
========================= */

const mongoUri =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_ATLAS_URI;

if (!mongoUri) {
  console.error(
    "MongoDB connection error: missing MONGO_URI, MONGODB_URI, or MONGO_ATLAS_URI in .env"
  );
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("MongoDB Connected");

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);

    if (
      err?.code === "ECONNREFUSED" &&
      String(err?.hostname || "").includes("_mongodb._tcp")
    ) {
      console.error(
        "Atlas SRV DNS lookup failed. Keep MONGO_URI on local MongoDB or use a direct mongodb:// Atlas URI instead of mongodb+srv://."
      );
    }
  });
