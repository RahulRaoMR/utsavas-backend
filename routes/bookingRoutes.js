const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const Hall = require("../models/Hall");

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

    // Validate required fields
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

    // Find hall
    const hall = await Hall.findById(hallId);

    if (!hall) {
      return res.status(404).json({
        message: "Hall not found",
      });
    }

    // Create booking
    const booking = new Booking({
      hall: hallId,
      vendor: hall.vendor, // 🔥 VERY IMPORTANT
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      eventType,
      guests,
      customerName,
      phone,
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
   GET BOOKINGS FOR A VENDOR
========================= */
router.get("/vendor/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;

    // Find halls belonging to this vendor
    const halls = await Hall.find({ vendor: vendorId });

    const hallIds = halls.map((hall) => hall._id);

    // Find bookings for those halls
    const bookings = await Booking.find({
      hall: { $in: hallIds },
    }).populate("hall", "hallName");

    res.json(bookings);
  } catch (error) {
    console.error("GET VENDOR BOOKINGS ERROR ❌", error);
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
});

module.exports = router;
