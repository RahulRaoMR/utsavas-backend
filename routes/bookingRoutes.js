const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Hall = require("../models/Hall");

console.log("🔥 BOOKING ROUTES LOADED");

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

    const booking = new Booking({
      hall: hallId,
      vendor: hall.vendor,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      eventType,
      guests,
      customerName,
      phone,
      status: "pending",
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

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    res.json({
      message: "Status updated successfully",
      booking,
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
      .populate("hall", "hallName")
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
