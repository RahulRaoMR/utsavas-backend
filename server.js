require("dotenv").config({ quiet: true });

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { getMailRuntimeStatus } = require("./utils/bookingConfirmationEmail");

const app = express();

/* =========================
   CORS CONFIG (SAFE)
========================= */

const defaultAllowedOrigins = [
  "http://localhost:3000",
  "https://utsavas.vercel.app",
  "https://www.utsavas.com",
  "https://utsavas.com",
];

const allowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS || defaultAllowedOrigins.join(",")
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

/* =========================
   MIDDLEWARES
========================= */

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

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
const chatRoutes = require("./routes/chatRoutes");

/* =========================
   API ROUTES
========================= */

app.use("/api/auth/forgot-password", otpLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/otp", otpLimiter);
app.use("/api/payment", paymentLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/halls", hallRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/chat", chatRoutes);

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
    console.log("MAIL CONFIG STATUS", getMailRuntimeStatus());

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
