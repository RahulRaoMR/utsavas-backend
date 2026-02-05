const express = require("express");
const Booking = require("../models/Booking");
const Hall = require("../models/Hall");

const router = express.Router();

/* =========================
   CREATE BOOKING (PUBLIC)
========================= */
router.post("/create", async (req, res) => {
  try {
    const {
      hallId,
      checkIn,
      checkOut,
      eventType,
      guests,
      name,
      phone,
    } = req.body;

    // Basic validation
    if (!hallId || !checkIn || !checkOut || !name || !phone) {
      return res.status(400).json({
        message: "Hall, check-in, check-out, name and phone are required",
      });
    }

    // Find hall & vendor
    const hall = await Hall.findById(hallId).populate("vendor");
    if (!hall) {
      return res.status(404).json({ message: "Hall not found" });
    }

    // Create booking
    const booking = await Booking.create({
      hall: hall._id,
      vendor: hall.vendor._id,
      checkIn,
      checkOut,
      eventType,
      guests,
      customerName: name,
      phone,
    });

    res.status(201).json({
      message: "Booking created successfully",
      booking,
    });
  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).json({ message: error.message });
  }
});

/* =========================
   VENDOR BOOKINGS
========================= */
router.get("/vendor/:vendorId", async (req, res) => {
  try {
    const bookings = await Booking.find({
      vendor: req.params.vendorId,
    })
      .populate("hall")
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* =========================
   ADMIN – ALL BOOKINGS
========================= */
router.get("/all", async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("hall vendor")
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* =========================
   UPDATE BOOKING STATUS (VENDOR)
========================= */
router.patch("/status/:id", async (req, res) => {
  try {
    const { status } = req.body; // approved | rejected

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* =========================
   GET BOOKED DATES BY HALL
========================= */
router.get("/hall/:hallId", async (req, res) => {
  try {
    const bookings = await Booking.find({
      hall: req.params.hallId,
      status: { $in: ["pending", "approved"] },
    }).select("checkIn checkOut");

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


module.exports = router;
