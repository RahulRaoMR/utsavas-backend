const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Hall = require("../models/Hall");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  getMailErrorMessage,
  sendBookingApprovalEmail,
} = require("../utils/bookingConfirmationEmail");

console.log("🔥 BOOKING ROUTES LOADED");

const normalizePhone = (phone) => {
  if (!phone) return "";

  let value = String(phone).replace(/\D/g, "");

  if (value.length === 10) {
    value = `91${value}`;
  }

  return value;
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const findUserFromRequest = async (req, phone, email) => {
  const directEmail = normalizeEmail(email);

  if (directEmail) {
    const userByEmail = await User.findOne({ email: directEmail }).select(
      "email firstName lastName name phone"
    );

    if (userByEmail) {
      return userByEmail;
    }
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userByToken = await User.findById(decoded.id).select(
        "email firstName lastName name phone"
      );

      if (userByToken) {
        return userByToken;
      }
    } catch (error) {
      console.warn("BOOKING TOKEN LOOKUP FAILED", error.message);
    }
  }

  const normalizedPhone = normalizePhone(phone);
  const last10 = normalizedPhone.slice(-10);

  if (!last10) {
    return null;
  }

  return User.findOne({
    $or: [{ phone: normalizedPhone }, { phone: new RegExp(`${last10}$`) }],
  }).select("email firstName lastName name phone");
};

/* =========================
   CREATE BOOKING
========================= */
router.post("/create", async (req, res) => {
  try {
    const {
      hallId,
      checkIn,
      checkOut,
      eventType,
      guests,
      customerName,
      phone,
      customerEmail,
      amount,
      venueAmount,
      supportFee,
      subtotalAmount,
      discountAmount,
      couponCode,
      pricingBasis,
    } = req.body;

    console.log("Incoming booking data:", req.body);

    if (
      !hallId ||
      !checkIn ||
      !checkOut ||
      !eventType ||
      !customerName ||
      !phone
    ) {
      return res.status(400).json({
        message: "All required fields must be filled",
      });
    }

    const hall = await Hall.findById(hallId);

    if (!hall) {
      return res.status(404).json({
        message: "Hall not found",
      });
    }

    const matchedUser = await findUserFromRequest(req, phone, customerEmail);
    const resolvedEmail =
      normalizeEmail(customerEmail) || normalizeEmail(matchedUser?.email);

    const booking = new Booking({
      hall: hallId,
      vendor: hall.vendor,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      eventType,
      guests,
      customerName,
      phone: normalizePhone(phone) || phone,
      customerEmail: resolvedEmail,
      status: "pending",
      amount: Number(amount) || 0,
      venueAmount: Number(venueAmount) || 0,
      supportFee: Number(supportFee) || 0,
      subtotalAmount: Number(subtotalAmount) || 0,
      discountAmount: Number(discountAmount) || 0,
      couponCode: couponCode ? String(couponCode).trim().toUpperCase() : "",
      pricingBasis: pricingBasis ? String(pricingBasis).trim() : "",
    });

    await booking.save();

    res.status(201).json({
      message: "Booking created successfully",
      booking,
    });
  } catch (error) {
    console.error("BOOKING CREATE ERROR ❌", error);
    res.status(500).json({
      message: "Server error while creating booking",
    });
  }
});

router.patch("/:bookingId/payment", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { paymentMethod, paymentStatus, amount } = req.body;

    const updates = {};

    if (paymentMethod) {
      updates.paymentMethod = paymentMethod;
    }

    if (paymentStatus) {
      updates.paymentStatus = paymentStatus;
    }

    if (amount !== undefined) {
      updates.amount = Number(amount) || 0;
    }

    const booking = await Booking.findByIdAndUpdate(bookingId, updates, {
      new: true,
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    res.json({
      message: "Payment details updated successfully",
      booking,
    });
  } catch (error) {
    console.error("PAYMENT UPDATE ERROR", error);
    res.status(500).json({
      message: "Failed to update payment details",
    });
  }
});

/* =========================
   UPDATE BOOKING STATUS
========================= */
const updateStatusHandler = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    console.log("STATUS UPDATE HIT:", bookingId, status);

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status value",
      });
    }

    let booking = await Booking.findById(bookingId)
      .populate("hall")
      .populate("vendor", "businessName email phone");

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    if (!booking.customerEmail) {
      const matchedUser = await findUserFromRequest(req, booking.phone, "");
      if (matchedUser?.email) {
        booking.customerEmail = normalizeEmail(matchedUser.email);
      }
    }

    booking.status = status;
    await booking.save();

    let email = {
      sent: false,
      skipped: false,
      error: "",
    };

    if (status === "approved") {
      if (!booking.customerEmail) {
        email = {
          sent: false,
          skipped: true,
          error: "Customer email is not available for this booking.",
        };
      } else {
        try {
          await sendBookingApprovalEmail(booking);
          email.sent = true;
        } catch (mailError) {
          console.error("BOOKING APPROVAL EMAIL ERROR", mailError);
          email.error = getMailErrorMessage(mailError);
        }
      }
    }

    res.json({
      message:
        status === "approved"
          ? email.sent
            ? "Booking approved and confirmation email sent"
            : email.skipped
            ? "Booking approved, but customer email is unavailable"
            : "Booking approved, but confirmation email failed"
          : "Status updated successfully",
      booking,
      email,
    });
  } catch (error) {
    console.error("UPDATE STATUS ERROR ❌", error);
    res.status(500).json({
      message: "Failed to update status",
    });
  }
};

router.patch("/status/:bookingId", updateStatusHandler);
router.put("/status/:bookingId", updateStatusHandler);

/* =========================
   GET BOOKINGS FOR A VENDOR
========================= */
router.get("/vendor/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;

    console.log("Fetching bookings for vendor:", vendorId);

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        message: "Invalid vendor id",
      });
    }

    const bookings = await Booking.find({ vendor: vendorId })
      .populate("hall", "hallName address")
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    console.error("GET VENDOR BOOKINGS ERROR ❌", error);
    res.status(500).json({
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
});

/* =========================
   GET BOOKINGS FOR A HALL
========================= */
router.get("/hall/:hallId", async (req, res) => {
  try {
    const { hallId } = req.params;

    const bookings = await Booking.find({ hall: hallId })
      .select("checkIn checkOut status");

    res.json(bookings);
  } catch (error) {
    console.error("GET HALL BOOKINGS ERROR ❌", error);
    res.status(500).json({
      message: "Failed to fetch hall bookings",
    });
  }
});

/* =========================
   ✅🔥 ADMIN — GET ALL BOOKINGS (FINAL FIX)
========================= */
router.get("/admin/bookings", async (req, res) => {
  try {
    console.log("🔥 ADMIN BOOKINGS FETCHED");

    const bookings = await Booking.find()
      .populate("hall", "hallName")
      .populate("vendor", "businessName")
      .sort({ createdAt: -1 });

    // ⭐ CRITICAL: send calendar-ready data
    const formatted = bookings.map((b) => ({
      _id: b._id,
      customerName: b.customerName,
      customerEmail: b.customerEmail,
      phone: b.phone,
      eventType: b.eventType,
      guests: b.guests,
      status: b.status,
      checkIn: b.checkIn,     // ✅ REQUIRED
      checkOut: b.checkOut,   // ✅ REQUIRED
      hallName: b.hall?.hallName || "N/A",
      vendorName: b.vendor?.businessName || "N/A",
    }));

    console.log("Admin bookings count:", formatted.length);

    const paymentAwareFormatted = formatted.map((item, index) => ({
      ...item,
      paymentMethod: bookings[index]?.paymentMethod,
      paymentStatus: bookings[index]?.paymentStatus,
      amount: bookings[index]?.amount || 0,
      venueAmount: bookings[index]?.venueAmount || 0,
      supportFee: bookings[index]?.supportFee || 0,
      subtotalAmount: bookings[index]?.subtotalAmount || 0,
      discountAmount: bookings[index]?.discountAmount || 0,
      couponCode: bookings[index]?.couponCode || "",
    }));

    res.json(paymentAwareFormatted);
  } catch (error) {
    console.error("ADMIN BOOKINGS ERROR ❌", error);
    res.status(500).json({
      message: "Failed to fetch admin bookings",
    });
  }
});

module.exports = router;
