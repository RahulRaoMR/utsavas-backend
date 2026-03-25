const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Booking = require("../models/Booking");
const Hall = require("../models/Hall");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getMailErrorMessage,
  sendBookingApprovalEmail,
} = require("../utils/bookingConfirmationEmail");

const { requireAdmin, requireVendor } = authMiddleware;
const router = express.Router();

console.log("🔥 BOOKING ROUTES LOADED");
const GST_RATE = 0.02;

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

const buildUserBookingQuery = (user) => {
  const email = normalizeEmail(user?.email);
  const phone = normalizePhone(user?.phone);
  const last10 = phone.slice(-10);
  const conditions = [];

  if (user?._id) {
    conditions.push({ customer: user._id });
  }

  if (email) {
    conditions.push({ customerEmail: email });
  }

  if (phone) {
    conditions.push({ phone });
  }

  if (last10) {
    conditions.push({ phone: new RegExp(`${last10}$`) });
  }

  return conditions.length ? { $or: conditions } : null;
};

const serializeBooking = (booking) => {
  const hall = booking?.hall || {};
  const vendor = booking?.vendor || {};

  return {
    _id: booking?._id,
    bookingReference: String(booking?._id || ""),
    customerName: booking?.customerName || "",
    customerEmail: booking?.customerEmail || "",
    phone: booking?.phone || "",
    eventType: booking?.eventType || "",
    guests: booking?.guests || 0,
    status: booking?.status || "pending",
    checkIn: booking?.checkIn || null,
    checkOut: booking?.checkOut || null,
    createdAt: booking?.createdAt || null,
    updatedAt: booking?.updatedAt || null,
    hallId: hall?._id || booking?.hall || null,
    hallName: hall?.hallName || "N/A",
    hallImages: Array.isArray(hall?.images) ? hall.images : [],
    hallAddress: hall?.address || {},
    hallCategory: hall?.category || "",
    hallCapacity: hall?.capacity || 0,
    vendorId: vendor?._id || booking?.vendor || null,
    vendorName: vendor?.businessName || "N/A",
    vendorOwnerName: vendor?.ownerName || "",
    vendorEmail: vendor?.email || "",
    vendorPhone: vendor?.phone || "",
    vendorCity: vendor?.city || "",
    paymentMethod: booking?.paymentMethod || "pay_at_venue",
    paymentStatus: booking?.paymentStatus || "pending",
    amount: Number(booking?.amount) || 0,
    venueAmount: Number(booking?.venueAmount) || 0,
    supportFee: Number(booking?.supportFee) || 0,
    subtotalAmount: Number(booking?.subtotalAmount) || 0,
    discountAmount: Number(booking?.discountAmount) || 0,
    couponCode: booking?.couponCode || "",
    pricingBasis: booking?.pricingBasis || "",
  };
};

const ensureVendorBookingAccess = (req, booking) => {
  const vendorId = String(booking?.vendor?._id || booking?.vendor || "");

  return vendorId && vendorId === String(req.user?.id || "");
};

/* =========================
   CREATE BOOKING
========================= */
router.post("/create", authMiddleware, async (req, res) => {
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
      venueAmount,
      discountAmount,
      couponCode,
      pricingBasis,
    } = req.body;

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
    const normalizedVenueAmount = Math.max(Number(venueAmount) || 0, 0);
    const normalizedSupportFee =
      normalizedVenueAmount > 0 ? Math.round(normalizedVenueAmount * GST_RATE) : 0;
    const normalizedSubtotalAmount = normalizedVenueAmount + normalizedSupportFee;
    const normalizedDiscountAmount = Math.max(Number(discountAmount) || 0, 0);
    const normalizedAmount = Math.max(
      normalizedSubtotalAmount - normalizedDiscountAmount,
      0
    );
    const customerId =
      matchedUser?._id ||
      (mongoose.Types.ObjectId.isValid(req.user?.id) ? req.user.id : null);

    const booking = new Booking({
      customer: customerId,
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
      amount: normalizedAmount,
      venueAmount: normalizedVenueAmount,
      supportFee: normalizedSupportFee,
      subtotalAmount: normalizedSubtotalAmount,
      discountAmount: normalizedDiscountAmount,
      couponCode: couponCode ? String(couponCode).trim().toUpperCase() : "",
      pricingBasis: pricingBasis ? String(pricingBasis).trim() : "",
    });

    await booking.save();

    res.status(201).json({
      message: "Booking created successfully",
      booking,
    });
  } catch (error) {
    console.error("BOOKING CREATE ERROR", error);
    res.status(500).json({
      message: "Server error while creating booking",
    });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "email firstName lastName name phone"
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const query = buildUserBookingQuery(user);

    if (!query) {
      return res.json([]);
    }

    const bookings = await Booking.find(query)
      .populate("hall", "hallName images address category capacity")
      .populate("vendor", "businessName ownerName email phone city")
      .sort({ createdAt: -1 });

    res.json(bookings.map(serializeBooking));
  } catch (error) {
    console.error("GET MY BOOKINGS ERROR", error);
    res.status(500).json({
      message: "Failed to fetch your bookings",
    });
  }
});

router.get("/me/:bookingId", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        message: "Invalid booking id",
      });
    }

    const user = await User.findById(req.user.id).select(
      "email firstName lastName name phone"
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const query = buildUserBookingQuery(user);

    if (!query) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      ...query,
    })
      .populate("hall", "hallName images address category capacity")
      .populate("vendor", "businessName ownerName email phone city");

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    res.json(serializeBooking(booking));
  } catch (error) {
    console.error("GET MY BOOKING DETAIL ERROR", error);
    res.status(500).json({
      message: "Failed to fetch booking details",
    });
  }
});

router.patch("/:bookingId/payment", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { paymentMethod, paymentStatus } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        message: "Invalid booking id",
      });
    }

    const user = await User.findById(req.user.id).select(
      "email firstName lastName name phone"
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const query = buildUserBookingQuery(user);

    if (!query) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      ...query,
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    if (paymentMethod && ["online", "pay_at_venue"].includes(paymentMethod)) {
      booking.paymentMethod = paymentMethod;
    }

    if (paymentStatus && ["pending", "paid", "failed"].includes(paymentStatus)) {
      booking.paymentStatus = paymentStatus;
    }

    await booking.save();

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

    if (!ensureVendorBookingAccess(req, booking)) {
      return res.status(403).json({
        message: "You can manage only your own bookings",
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

    console.log(`Vendor ${req.user.id} updated booking ${bookingId} to ${status}`);

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
    console.error("UPDATE STATUS ERROR", error);
    res.status(500).json({
      message: "Failed to update status",
    });
  }
};

router.patch("/status/:bookingId", requireVendor, updateStatusHandler);
router.put("/status/:bookingId", requireVendor, updateStatusHandler);

/* =========================
   GET BOOKINGS FOR A VENDOR
========================= */
router.get("/vendor/:vendorId", requireVendor, async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        message: "Invalid vendor id",
      });
    }

    if (String(vendorId) !== String(req.user.id)) {
      return res.status(403).json({
        message: "You can view only your own bookings",
      });
    }

    const bookings = await Booking.find({ vendor: vendorId })
      .populate("hall", "hallName address")
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    console.error("GET VENDOR BOOKINGS ERROR", error);
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

    const bookings = await Booking.find({ hall: hallId }).select(
      "checkIn checkOut status"
    );

    res.json(bookings);
  } catch (error) {
    console.error("GET HALL BOOKINGS ERROR", error);
    res.status(500).json({
      message: "Failed to fetch hall bookings",
    });
  }
});

/* =========================
   ADMIN GET ALL BOOKINGS
========================= */
router.get("/admin/bookings", requireAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("hall", "hallName")
      .populate("vendor", "businessName")
      .sort({ createdAt: -1 });

    const formatted = bookings.map((booking) => ({
      _id: booking._id,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      phone: booking.phone,
      eventType: booking.eventType,
      guests: booking.guests,
      status: booking.status,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      hallName: booking.hall?.hallName || "N/A",
      vendorName: booking.vendor?.businessName || "N/A",
      paymentMethod: booking.paymentMethod,
      paymentStatus: booking.paymentStatus,
      amount: booking.amount || 0,
      venueAmount: booking.venueAmount || 0,
      supportFee: booking.supportFee || 0,
      subtotalAmount: booking.subtotalAmount || 0,
      discountAmount: booking.discountAmount || 0,
      couponCode: booking.couponCode || "",
    }));

    res.json(formatted);
  } catch (error) {
    console.error("ADMIN BOOKINGS ERROR", error);
    res.status(500).json({
      message: "Failed to fetch admin bookings",
    });
  }
});

module.exports = router;
