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

const permissionsPolicy =
  "accelerometer=(), autoplay=(), camera=(), clipboard-read=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(self), usb=()";

const createJsonRateLimiter = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      res.status(429).json({
        success: false,
        message,
      });
    },
  });

const authLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many login attempts. Please try again in a few minutes.",
});

const authForgotPasswordLimiter = createJsonRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: "Too many password reset OTP requests. Please wait 10 minutes and try again.",
});

const vendorForgotPasswordLimiter = createJsonRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: "Too many vendor password reset attempts. Please wait 10 minutes and try again.",
});

const registerOtpLimiter = createJsonRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 12,
  message: "Too many OTP requests. Please wait 10 minutes and try again.",
});

const paymentLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many payment requests. Please try again shortly.",
});

const loginLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: "Too many failed attempts. Please try again in 15 minutes.",
});

const apiLimiter = createJsonRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests. Please try again later.",
});

const publicHallLimiter = createJsonRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 60,
  message: "Too many hall requests. Please try again in a few minutes.",
});

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "font-src": ["'self'", "https:", "data:"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
        "img-src": ["'self'", "data:", "https:"],
        "object-src": ["'none'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "https:", "'unsafe-inline'"],
        "upgrade-insecure-requests": [],
      },
    },
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
    frameguard: {
      action: "deny",
    },
    hsts: {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },
  })
);

app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", permissionsPolicy);
  next();
});

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

app.use("/api", apiLimiter);
app.use("/api/halls/public", publicHallLimiter);
app.use("/api/halls/search", publicHallLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/vendor/login", loginLimiter);
app.use("/api/admin/login", loginLimiter);

app.use("/api/auth/forgot-password", authForgotPasswordLimiter);
app.use("/api/vendor/forgot-password", vendorForgotPasswordLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/otp", registerOtpLimiter);
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
