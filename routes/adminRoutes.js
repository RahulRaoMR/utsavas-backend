const express = require("express");
const Admin = require("../models/Admin");
const Vendor = require("../models/Vendor");
const Hall = require("../models/Hall");
const Booking = require("../models/Booking");
const generateToken = require("../utils/generateToken");
const { normalizeVenueCategory } = require("../utils/venueCategory");
const authMiddleware = require("../middleware/authMiddleware");

const { requireAdmin } = authMiddleware;
const router = express.Router();

const normalizeAnalyticsDay = (value = new Date()) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

const getAnalyticsDateKey = (value = new Date()) => {
  const date = normalizeAnalyticsDay(value);
  return date ? date.toISOString().split("T")[0] : "";
};

const parseAnalyticsMonth = (value) => {
  const normalizedValue =
    typeof value === "string" && /^\d{4}-\d{2}$/.test(value)
      ? value
      : new Date().toISOString().slice(0, 7);

  const [year, month] = normalizedValue.split("-").map(Number);
  const monthStart = new Date(year, (month || 1) - 1, 1);

  if (Number.isNaN(monthStart.getTime())) {
    const fallbackDate = new Date();
    return {
      value: fallbackDate.toISOString().slice(0, 7),
      monthStart: new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1),
    };
  }

  return {
    value: normalizedValue,
    monthStart,
  };
};

const summarizeHallAnalytics = (
  hall,
  monthStart,
  monthEnd,
  chartLookup = null
) => {
  const monthlyStats = (hall.analyticsDaily || []).filter((entry) => {
    const entryDate = new Date(entry.date || entry.dateKey);
    return entryDate >= monthStart && entryDate <= monthEnd;
  });

  const hallViews = monthlyStats.reduce(
    (sum, entry) => sum + (Number(entry.hallViews) || 0),
    0
  );
  const phoneViews = monthlyStats.reduce(
    (sum, entry) => sum + (Number(entry.phoneViews) || 0),
    0
  );

  if (chartLookup) {
    monthlyStats.forEach((entry) => {
      const key = getAnalyticsDateKey(entry.date || entry.dateKey);
      const chartEntry = chartLookup[key];

      if (!chartEntry) {
        return;
      }

      chartEntry.hallViews += Number(entry.hallViews) || 0;
      chartEntry.phoneViews += Number(entry.phoneViews) || 0;
    });
  }

  return {
    hallId: String(hall._id),
    hallName: hall.hallName || "Untitled hall",
    vendorName: hall.vendor?.businessName || "Vendor unavailable",
    hallViews,
    phoneViews,
  };
};

const buildAdminAnalyticsPayload = (halls, monthValue, selectedHallId) => {
  const { value, monthStart } = parseAnalyticsMonth(monthValue);
  const monthEnd = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
  const daysInMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0
  ).getDate();

  const chartData = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      index + 1
    );

    return {
      dateKey: getAnalyticsDateKey(date),
      label: date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      hallViews: 0,
      phoneViews: 0,
    };
  });

  const chartLookup = chartData.reduce((lookup, entry) => {
    lookup[entry.dateKey] = entry;
    return lookup;
  }, {});

  const availableHalls = halls
    .map((hall) => ({
      hallId: String(hall._id),
      hallName: hall.hallName || "Untitled hall",
      vendorName: hall.vendor?.businessName || "Vendor unavailable",
      hallStatus: hall.status || "pending",
    }))
    .sort((left, right) =>
      left.hallName.localeCompare(right.hallName, "en", {
        sensitivity: "base",
      })
    );

  const selectedHall =
    halls.find((hall) => String(hall._id) === String(selectedHallId || "")) || null;

  const hallBreakdown = halls
    .map((hall) => summarizeHallAnalytics(hall, monthStart, monthEnd))
    .sort(
      (left, right) =>
        right.hallViews - left.hallViews || right.phoneViews - left.phoneViews
    );

  const scopedHalls = selectedHall ? [selectedHall] : halls;
  const scopedBreakdown = scopedHalls
    .map((hall) =>
      summarizeHallAnalytics(hall, monthStart, monthEnd, chartLookup)
    )
    .sort(
      (left, right) =>
        right.hallViews - left.hallViews || right.phoneViews - left.phoneViews
    );

  const totals = scopedBreakdown.reduce(
    (summary, hall) => {
      summary.hallViews += hall.hallViews;
      summary.phoneViews += hall.phoneViews;
      return summary;
    },
    {
      hallViews: 0,
      phoneViews: 0,
    }
  );

  const selectedHallSummary = selectedHall ? scopedBreakdown[0] || null : null;

  return {
    month: value,
    scope: selectedHallSummary ? "hall" : "all",
    availableHalls,
    selectedHallId: selectedHallSummary?.hallId || "",
    selectedHall: selectedHallSummary,
    chartData,
    hallBreakdown,
    totals: {
      hallViews: totals.hallViews,
      phoneViews: totals.phoneViews,
      trackedHalls: scopedBreakdown.filter(
        (hall) => hall.hallViews > 0 || hall.phoneViews > 0
      ).length,
      totalHalls: halls.length,
    },
  };
};

/* =========================
   ADMIN LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;
    email = email?.toString().toLowerCase().trim();
    password = password?.toString();

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
      });
    }

    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid password",
      });
    }

    const token = generateToken({
      id: admin._id,
      role: "admin",
    });

    res.json({
      message: "Admin login successful ✅",
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("ADMIN LOGIN ERROR ❌", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.use(requireAdmin);

/* =========================
   ADMIN DASHBOARD STATS
========================= */
router.get("/dashboard-stats", async (req, res) => {
  try {
    const [
      totalVendors,
      pendingVendors,
      totalHalls,
      pendingHalls,
      analyticsHalls,
    ] = await Promise.all([
      Vendor.countDocuments(),
      Vendor.countDocuments({ status: "pending" }),
      Hall.countDocuments(),
      Hall.countDocuments({ status: "pending" }),
      Hall.find()
        .select("hallName analyticsDaily vendor status")
        .populate("vendor", "businessName")
        .lean(),
    ]);

    res.json({
      totalVendors,
      pendingVendors,
      totalHalls,
      pendingHalls,
      analytics: buildAdminAnalyticsPayload(
        analyticsHalls,
        req.query.month,
        req.query.hallId
      ),
    });
  } catch (error) {
    console.error("ADMIN DASHBOARD STATS ERROR ❌", error);
    res.status(500).json({
      message: "Failed to load dashboard stats",
    });
  }
});

/* =========================
   GET PENDING HALLS
========================= */
router.get("/halls", async (req, res) => {
  try {
    const rawStatus = (req.query.status || "pending").toString().toLowerCase();
    const filter =
      rawStatus === "all"
        ? {}
        : ["pending", "approved", "rejected"].includes(rawStatus)
          ? { status: rawStatus }
          : { status: "pending" };

    const halls = await Hall.find(filter)
      .populate("vendor", "businessName email phone");

    res.json(halls);
  } catch (error) {
    console.error("GET PENDING HALLS ERROR ❌", error);
    res.status(500).json({
      message: "Failed to fetch pending halls",
    });
  }
});

/* =========================
   APPROVE HALL
========================= */
router.put("/halls/:id/approve", async (req, res) => {
  try {
    const hall = await Hall.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );

    res.json({
      message: "Hall approved ✅",
      hall,
    });
  } catch (error) {
    console.error("APPROVE HALL ERROR ❌", error);
    res.status(500).json({
      message: "Failed to approve hall",
    });
  }
});

/* =========================
   GET SINGLE HALL
========================= */
router.get("/halls/:id", async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id).populate(
      "vendor",
      "businessName email phone"
    );

    if (!hall) {
      return res.status(404).json({
        message: "Hall not found",
      });
    }

    res.json(hall);
  } catch (error) {
    console.error("GET SINGLE HALL ERROR ❌", error);
    res.status(500).json({
      message: "Failed to fetch hall",
    });
  }
});

/* =========================
   UPDATE HALL
========================= */
router.put("/halls/:id", async (req, res) => {
  try {
    const {
      hallName,
      category,
      capacity,
      parkingCapacity,
      rooms,
      about,
      pricePerDay,
      pricePerEvent,
      pricePerPlate,
      address,
      location,
      features,
      status,
    } = req.body;

    const hall = await Hall.findById(req.params.id);

    if (!hall) {
      return res.status(404).json({
        message: "Hall not found",
      });
    }

    hall.hallName = hallName?.toString().trim() || hall.hallName;
    hall.category = category
      ? normalizeVenueCategory(category)
      : hall.category;
    hall.capacity = Number(capacity) || 0;
    hall.parkingCapacity = Number(parkingCapacity) || 0;
    hall.rooms = Number(rooms) || 0;
    hall.about = about?.toString() || "";
    hall.pricePerDay = Number(pricePerDay) || 0;
    hall.pricePerEvent = Number(pricePerEvent) || 0;
    hall.pricePerPlate = Number(pricePerPlate) || 0;

    if (address && typeof address === "object") {
      hall.address = {
        ...hall.address,
        ...address,
      };
    }

    if (
      location &&
      typeof location === "object" &&
      Number.isFinite(Number(location.lat)) &&
      Number.isFinite(Number(location.lng))
    ) {
      hall.location = {
        lat: Number(location.lat),
        lng: Number(location.lng),
      };
    }

    if (features && typeof features === "object") {
      hall.features = {
        ...hall.features,
        ...features,
      };
    }

    if (["pending", "approved", "rejected"].includes(status)) {
      hall.status = status;
    }

    await hall.save();

    res.json({
      message: "Hall updated successfully",
      hall,
    });
  } catch (error) {
    console.error("UPDATE HALL ERROR ❌", error);
    res.status(500).json({
      message: "Failed to update hall",
    });
  }
});

/* =========================
   REJECT HALL
========================= */
router.put("/halls/:id/reject", async (req, res) => {
  try {
    const hall = await Hall.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );

    res.json({
      message: "Hall rejected ❌",
      hall,
    });
  } catch (error) {
    console.error("REJECT HALL ERROR ❌", error);
    res.status(500).json({
      message: "Failed to reject hall",
    });
  }
});

/* =========================
   DELETE HALL
========================= */
router.delete("/halls/:id", async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id);

    if (!hall) {
      return res.status(404).json({
        message: "Hall not found",
      });
    }

    await Booking.deleteMany({ hall: hall._id });
    await Hall.deleteOne({ _id: hall._id });

    res.json({
      message: "Hall deleted successfully",
    });
  } catch (error) {
    console.error("DELETE HALL ERROR ❌", error);
    res.status(500).json({
      message: "Failed to delete hall",
    });
  }
});

/* ======================================================
   🗑️ CASCADE DELETE VENDOR — PRODUCTION SAFE
====================================================== */
router.delete("/vendors/:vendorId", async (req, res) => {
  try {
    const { vendorId } = req.params;

    console.log("🗑️ Admin deleting vendor:", vendorId);

    // ✅ check vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        message: "Vendor not found",
      });
    }

    // ✅ find halls of vendor
    const halls = await Hall.find({ vendor: vendorId });
    const hallIds = halls.map((h) => h._id);

    // ✅ delete ALL related bookings (single efficient query)
    await Booking.deleteMany({
      $or: [
        { vendor: vendorId },
        { hall: { $in: hallIds } },
      ],
    });

    // ✅ delete halls
    await Hall.deleteMany({ vendor: vendorId });

    // ✅ delete vendor
    await Vendor.findByIdAndDelete(vendorId);

    console.log("✅ Vendor cascade deleted successfully");

    res.json({
      message: "Vendor and related data deleted successfully ✅",
    });
  } catch (error) {
    console.error("DELETE VENDOR ERROR ❌", error);
    res.status(500).json({
      message: "Failed to delete vendor",
    });
  }
});

/* ======================================================
   ADMIN — GET ALL BOOKINGS (CALENDAR READY)
====================================================== */
router.get("/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("vendor", "businessName")
      .populate("hall", "hallName")
      .sort({ createdAt: -1 });

    const formatted = bookings.map((b) => ({
      _id: b._id,
      customerName: b.customerName,
      vendorName: b.vendor?.businessName || "N/A",
      hallName: b.hall?.hallName || "N/A",

      // ⭐ calendar
      checkIn: b.checkIn,
      checkOut: b.checkOut,

      // ⭐ payment safe defaults
      paymentMethod: b.paymentMethod || "venue",
      paymentStatus: b.paymentStatus || "pending",
      amount: b.amount || 0,

      status: b.status,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("ADMIN BOOKINGS ERROR ❌", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
  
