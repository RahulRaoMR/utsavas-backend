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
      vendor: hall.vendor, // ⭐ VERY IMPORTANT
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

// ⭐ support BOTH
router.patch("/status/:bookingId", updateStatusHandler);
router.put("/status/:bookingId", updateStatusHandler);

/* =========================
   ✅ GET BOOKINGS FOR A VENDOR — FIXED
========================= */
router.get("/vendor/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;

    console.log("Fetching bookings for vendor:", vendorId);

    // ✅ validate id
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        message: "Invalid vendor id",
      });
    }

    // ✅ DIRECT QUERY (FAST + CORRECT)
    const bookings = await Booking.find({
      vendor: vendorId,
    })
      .populate("hall", "hallName")
      .sort({ createdAt: -1 });

    console.log("Bookings found:", bookings.length);

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

    const bookings = await Booking.find({
      hall: hallId,
    }).select("checkIn checkOut status");

    res.json(bookings);
  } catch (error) {
    console.error("GET HALL BOOKINGS ERROR ❌", error);
    res.status(500).json({
      message: "Failed to fetch hall bookings",
    });
  }
});

module.exports = router;
