const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Hall = require("../models/Hall");
const Vendor = require("../models/Vendor");
const authMiddleware = require("../middleware/authMiddleware");
const { getBotReply } = require("../utils/chatBot");

const { requireAdmin, requireVendor, getTokenFromRequest } = authMiddleware;
const router = express.Router();

const PUBLIC_VENDOR_FIELDS =
  "businessName ownerName email phone isOnline autoReplyEnabled";
const PUBLIC_HALL_FIELDS =
  "hallName address capacity pricePerEvent pricePerDay pricePerPlate";

const normalizeText = (value) => String(value || "").trim();

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 10) {
    return `91${digits}`;
  }

  return digits;
};

const createAccessToken = () => crypto.randomBytes(18).toString("hex");

const getSafeUserFromRequest = (req) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token || !process.env.JWT_SECRET) {
      return null;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (String(decoded?.role || "").toLowerCase() !== "user") {
      return null;
    }

    return {
      id: String(decoded.id || ""),
      role: "user",
    };
  } catch {
    return null;
  }
};

const createMessage = ({ senderType, senderId = null, senderName, text }) => ({
  senderType,
  senderId:
    senderId && mongoose.Types.ObjectId.isValid(senderId)
      ? new mongoose.Types.ObjectId(senderId)
      : null,
  senderName: normalizeText(senderName),
  text: normalizeText(text),
  createdAt: new Date(),
});

const getFirstResponseMinutes = (conversation) => {
  const firstUserMessageAt = conversation?.firstUserMessageAt
    ? new Date(conversation.firstUserMessageAt)
    : null;
  const firstVendorResponseAt = conversation?.firstVendorResponseAt
    ? new Date(conversation.firstVendorResponseAt)
    : null;

  if (!firstUserMessageAt || !firstVendorResponseAt) {
    return null;
  }

  const diffMs = firstVendorResponseAt.getTime() - firstUserMessageAt.getTime();

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return null;
  }

  return Math.max(Math.round(diffMs / 60000), 0);
};

const applyConversationMessage = (conversation, message) => {
  const now = message.createdAt || new Date();
  const senderType = String(message.senderType || "").toLowerCase();

  conversation.messages.push(message);
  conversation.totalMessages = conversation.messages.length;
  conversation.lastMessageAt = now;
  conversation.lastMessageText = message.text;

  if (senderType === "user") {
    conversation.firstUserMessageAt =
      conversation.firstUserMessageAt || now;
    conversation.unreadByVendor += 1;
    conversation.unreadByAdmin += 1;
    conversation.unreadByUser = 0;

    if (conversation.status === "closed") {
      conversation.status = "new";
    }

    return;
  }

  if (senderType === "vendor") {
    conversation.vendorReplyCount += 1;
    conversation.unreadByVendor = 0;
    conversation.unreadByUser += 1;

    if (conversation.firstUserMessageAt && !conversation.firstVendorResponseAt) {
      conversation.firstVendorResponseAt = now;
    }

    if (conversation.status === "new") {
      conversation.status = "contacted";
    }

    return;
  }

  if (senderType === "admin") {
    conversation.adminReplyCount += 1;
    conversation.unreadByAdmin = 0;
    conversation.unreadByUser += 1;

    if (conversation.status === "new") {
      conversation.status = "contacted";
    }

    return;
  }

  if (senderType === "bot") {
    conversation.botReplyCount += 1;
  }
};

const maybeQueueBotReply = ({ conversation, hall, vendor, userMessageText }) => {
  if (!vendor || vendor.isOnline || !vendor.autoReplyEnabled) {
    return;
  }

  const botMessage = createMessage({
    senderType: "bot",
    senderName: "UTSAVAS Assistant",
    text: getBotReply({
      hall,
      messageText: userMessageText,
    }),
  });

  applyConversationMessage(conversation, botMessage);
};

const serializeMessage = (message) => ({
  id: String(message?._id || ""),
  senderType: message?.senderType || "user",
  senderName: message?.senderName || "",
  text: message?.text || "",
  createdAt: message?.createdAt || null,
});

const serializeConversationSummary = (conversation) => ({
  _id: String(conversation?._id || ""),
  hallId: String(conversation?.hall?._id || conversation?.hall || ""),
  hallName: conversation?.hall?.hallName || "Hall",
  vendorId: String(conversation?.vendor?._id || conversation?.vendor || ""),
  vendorName:
    conversation?.vendor?.businessName ||
    conversation?.vendor?.ownerName ||
    "Vendor",
  customerName: conversation?.customer?.name || "",
  customerPhone: conversation?.customer?.phone || "",
  customerEmail: conversation?.customer?.email || "",
  status: conversation?.status || "new",
  lastMessageText: conversation?.lastMessageText || "",
  lastMessageAt: conversation?.lastMessageAt || conversation?.updatedAt || null,
  totalMessages: Number(conversation?.totalMessages) || 0,
  unreadByVendor: Number(conversation?.unreadByVendor) || 0,
  unreadByAdmin: Number(conversation?.unreadByAdmin) || 0,
  unreadByUser: Number(conversation?.unreadByUser) || 0,
  firstResponseMinutes: getFirstResponseMinutes(conversation),
  createdAt: conversation?.createdAt || null,
});

const serializeConversationDetail = (conversation) => ({
  ...serializeConversationSummary(conversation),
  hall: {
    id: String(conversation?.hall?._id || conversation?.hall || ""),
    hallName: conversation?.hall?.hallName || "Hall",
    address: conversation?.hall?.address || null,
    capacity: Number(conversation?.hall?.capacity) || 0,
    pricePerEvent: Number(conversation?.hall?.pricePerEvent) || 0,
    pricePerDay: Number(conversation?.hall?.pricePerDay) || 0,
    pricePerPlate: Number(conversation?.hall?.pricePerPlate) || 0,
  },
  vendor: {
    id: String(conversation?.vendor?._id || conversation?.vendor || ""),
    businessName:
      conversation?.vendor?.businessName ||
      conversation?.vendor?.ownerName ||
      "Vendor",
    ownerName: conversation?.vendor?.ownerName || "",
    phone: conversation?.vendor?.phone || "",
    email: conversation?.vendor?.email || "",
    isOnline: Boolean(conversation?.vendor?.isOnline),
    autoReplyEnabled:
      typeof conversation?.vendor?.autoReplyEnabled === "boolean"
        ? conversation.vendor.autoReplyEnabled
        : true,
  },
  customer: {
    name: conversation?.customer?.name || "",
    phone: conversation?.customer?.phone || "",
    email: conversation?.customer?.email || "",
  },
  messages: Array.isArray(conversation?.messages)
    ? conversation.messages.map(serializeMessage)
    : [],
});

const buildConversationAnalytics = (conversations) => {
  const groupedByHall = new Map();
  let totalResponseMinutes = 0;
  let respondedConversations = 0;

  const totals = conversations.reduce(
    (summary, conversation) => {
      const status = String(conversation.status || "new").toLowerCase();
      const responseMinutes = getFirstResponseMinutes(conversation);
      const hallId = String(conversation?.hall?._id || conversation?.hall || "");
      const hallName = conversation?.hall?.hallName || "Hall";
      const vendorName =
        conversation?.vendor?.businessName ||
        conversation?.vendor?.ownerName ||
        "Vendor";

      summary.totalLeads += 1;
      summary.totalMessages += Number(conversation.totalMessages) || 0;

      if (status === "new") summary.newLeads += 1;
      if (status === "contacted") summary.contactedLeads += 1;
      if (status === "booked") summary.bookedLeads += 1;
      if (status === "closed") summary.closedLeads += 1;

      if (responseMinutes !== null) {
        totalResponseMinutes += responseMinutes;
        respondedConversations += 1;
      }

      const existingHall =
        groupedByHall.get(hallId) ||
        {
          hallId,
          hallName,
          vendorName,
          totalLeads: 0,
          bookedLeads: 0,
          newLeads: 0,
          totalMessages: 0,
        };

      existingHall.totalLeads += 1;
      existingHall.totalMessages += Number(conversation.totalMessages) || 0;

      if (status === "booked") {
        existingHall.bookedLeads += 1;
      }

      if (status === "new") {
        existingHall.newLeads += 1;
      }

      groupedByHall.set(hallId, existingHall);
      return summary;
    },
    {
      totalLeads: 0,
      newLeads: 0,
      contactedLeads: 0,
      bookedLeads: 0,
      closedLeads: 0,
      totalMessages: 0,
    }
  );

  return {
    ...totals,
    averageFirstResponseMinutes:
      respondedConversations > 0
        ? Math.round(totalResponseMinutes / respondedConversations)
        : null,
    respondedConversations,
    hallBreakdown: Array.from(groupedByHall.values()).sort(
      (left, right) =>
        right.totalLeads - left.totalLeads ||
        right.bookedLeads - left.bookedLeads ||
        right.totalMessages - left.totalMessages
    ),
  };
};

const findConversationForPanel = async (id, role, actorId) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }

  const query = {
    _id: new mongoose.Types.ObjectId(id),
  };

  if (role === "vendor") {
    query.vendor = new mongoose.Types.ObjectId(actorId);
  }

  return Conversation.findOne(query)
    .populate("hall", PUBLIC_HALL_FIELDS)
    .populate("vendor", PUBLIC_VENDOR_FIELDS);
};

const applySearchFilter = (conversations, queryText) => {
  const query = normalizeText(queryText).toLowerCase();

  if (!query) {
    return conversations;
  }

  return conversations.filter((conversation) =>
    [
      conversation?.customer?.name,
      conversation?.customer?.phone,
      conversation?.customer?.email,
      conversation?.hall?.hallName,
      conversation?.vendor?.businessName,
      conversation?.lastMessageText,
    ].some((value) => String(value || "").toLowerCase().includes(query))
  );
};

const applyStatusFilter = (conversations, status) => {
  const normalizedStatus = normalizeText(status).toLowerCase();

  if (!normalizedStatus || normalizedStatus === "all") {
    return conversations;
  }

  return conversations.filter(
    (conversation) => String(conversation.status || "").toLowerCase() === normalizedStatus
  );
};

router.post("/start", async (req, res) => {
  try {
    const hallId = normalizeText(req.body?.hallId);
    const customerName = normalizeText(req.body?.name);
    const customerPhone = normalizePhone(req.body?.phone);
    const customerEmail = normalizeText(req.body?.email).toLowerCase();
    const initialMessage = normalizeText(req.body?.message);

    if (!mongoose.Types.ObjectId.isValid(hallId)) {
      return res.status(400).json({ message: "Valid hall is required" });
    }

    if (!customerName || !customerPhone || !initialMessage) {
      return res.status(400).json({
        message: "Name, phone, and message are required to start the chat",
      });
    }

    const hall = await Hall.findOne({
      _id: new mongoose.Types.ObjectId(hallId),
      status: "approved",
    }).populate("vendor", PUBLIC_VENDOR_FIELDS);

    if (!hall || !hall.vendor) {
      return res.status(404).json({ message: "Hall not found" });
    }

    const safeUser = getSafeUserFromRequest(req);
    const conversation = new Conversation({
      hall: hall._id,
      vendor: hall.vendor._id,
      user:
        safeUser?.id && mongoose.Types.ObjectId.isValid(safeUser.id)
          ? new mongoose.Types.ObjectId(safeUser.id)
          : null,
      accessToken: createAccessToken(),
      customer: {
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
      },
      status: "new",
      source: "venue-chat",
    });

    const userMessage = createMessage({
      senderType: "user",
      senderName: customerName,
      text: initialMessage,
      senderId: safeUser?.id || null,
    });

    applyConversationMessage(conversation, userMessage);
    maybeQueueBotReply({
      conversation,
      hall,
      vendor: hall.vendor,
      userMessageText: initialMessage,
    });

    await conversation.save();

    const hydratedConversation = await Conversation.findById(conversation._id)
      .populate("hall", PUBLIC_HALL_FIELDS)
      .populate("vendor", PUBLIC_VENDOR_FIELDS);

    return res.status(201).json({
      success: true,
      conversation: serializeConversationDetail(hydratedConversation),
      accessToken: conversation.accessToken,
    });
  } catch (error) {
    console.error("START CHAT ERROR", error);
    return res.status(500).json({ message: "Failed to start chat" });
  }
});

router.get("/public/:accessToken", async (req, res) => {
  try {
    const accessToken = normalizeText(req.params.accessToken);

    if (!accessToken) {
      return res.status(400).json({ message: "Chat token is required" });
    }

    const conversation = await Conversation.findOne({ accessToken })
      .populate("hall", PUBLIC_HALL_FIELDS)
      .populate("vendor", PUBLIC_VENDOR_FIELDS);

    if (!conversation) {
      return res.status(404).json({ message: "Chat not found" });
    }

    if (conversation.unreadByUser > 0) {
      conversation.unreadByUser = 0;
      await conversation.save();
    }

    return res.json({
      success: true,
      conversation: serializeConversationDetail(conversation),
    });
  } catch (error) {
    console.error("GET PUBLIC CHAT ERROR", error);
    return res.status(500).json({ message: "Failed to load chat" });
  }
});

router.post("/public/:accessToken/messages", async (req, res) => {
  try {
    const accessToken = normalizeText(req.params.accessToken);
    const text = normalizeText(req.body?.text);

    if (!accessToken || !text) {
      return res.status(400).json({ message: "Message text is required" });
    }

    const conversation = await Conversation.findOne({ accessToken })
      .populate("hall", PUBLIC_HALL_FIELDS)
      .populate("vendor", PUBLIC_VENDOR_FIELDS);

    if (!conversation) {
      return res.status(404).json({ message: "Chat not found" });
    }

    const userMessage = createMessage({
      senderType: "user",
      senderName: conversation.customer?.name || "Customer",
      text,
      senderId: conversation.user?._id || conversation.user || null,
    });

    applyConversationMessage(conversation, userMessage);
    maybeQueueBotReply({
      conversation,
      hall: conversation.hall,
      vendor: conversation.vendor,
      userMessageText: text,
    });

    await conversation.save();

    return res.json({
      success: true,
      conversation: serializeConversationDetail(conversation),
    });
  } catch (error) {
    console.error("PUBLIC CHAT MESSAGE ERROR", error);
    return res.status(500).json({ message: "Failed to send message" });
  }
});

router.get("/vendor/settings", requireVendor, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id).select(
      "businessName ownerName isOnline autoReplyEnabled"
    );

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    return res.json({
      success: true,
      vendor: {
        id: String(vendor._id),
        businessName: vendor.businessName || "",
        ownerName: vendor.ownerName || "",
        isOnline: Boolean(vendor.isOnline),
        autoReplyEnabled:
          typeof vendor.autoReplyEnabled === "boolean"
            ? vendor.autoReplyEnabled
            : true,
      },
    });
  } catch (error) {
    console.error("VENDOR CHAT SETTINGS ERROR", error);
    return res.status(500).json({ message: "Failed to load vendor settings" });
  }
});

router.patch("/vendor/settings", requireVendor, async (req, res) => {
  try {
    const update = {};

    if (typeof req.body?.isOnline === "boolean") {
      update.isOnline = req.body.isOnline;
    }

    if (typeof req.body?.autoReplyEnabled === "boolean") {
      update.autoReplyEnabled = req.body.autoReplyEnabled;
    }

    const vendor = await Vendor.findByIdAndUpdate(req.user.id, update, {
      new: true,
    }).select("businessName ownerName isOnline autoReplyEnabled");

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    return res.json({
      success: true,
      vendor: {
        id: String(vendor._id),
        businessName: vendor.businessName || "",
        ownerName: vendor.ownerName || "",
        isOnline: Boolean(vendor.isOnline),
        autoReplyEnabled:
          typeof vendor.autoReplyEnabled === "boolean"
            ? vendor.autoReplyEnabled
            : true,
      },
    });
  } catch (error) {
    console.error("UPDATE VENDOR CHAT SETTINGS ERROR", error);
    return res.status(500).json({ message: "Failed to update chat settings" });
  }
});

router.get("/vendor/conversations", requireVendor, async (req, res) => {
  try {
    const hallId = normalizeText(req.query?.hallId);
    const hallQuery = {
      vendor: new mongoose.Types.ObjectId(req.user.id),
    };

    if (hallId) {
      if (!mongoose.Types.ObjectId.isValid(hallId)) {
        return res.status(400).json({ message: "Invalid hall id" });
      }

      hallQuery._id = new mongoose.Types.ObjectId(hallId);
    }

    const [conversations, vendorHalls, vendor] = await Promise.all([
      Conversation.find({
        vendor: new mongoose.Types.ObjectId(req.user.id),
        ...(hallId
          ? { hall: new mongoose.Types.ObjectId(hallId) }
          : {}),
      })
        .populate("hall", PUBLIC_HALL_FIELDS)
        .populate("vendor", PUBLIC_VENDOR_FIELDS)
        .sort({ lastMessageAt: -1, updatedAt: -1 }),
      Hall.find(hallQuery)
        .select("hallName status")
        .sort({ hallName: 1 })
        .lean(),
      Vendor.findById(req.user.id).select(
        "businessName ownerName isOnline autoReplyEnabled"
      ),
    ]);

    const filteredConversations = applySearchFilter(
      applyStatusFilter(conversations, req.query?.status),
      req.query?.q
    );

    return res.json({
      success: true,
      conversations: filteredConversations.map(serializeConversationSummary),
      analytics: buildConversationAnalytics(filteredConversations),
      availableHalls: vendorHalls.map((hall) => ({
        hallId: String(hall._id),
        hallName: hall.hallName || "Hall",
        hallStatus: hall.status || "pending",
      })),
      vendor: vendor
        ? {
            id: String(vendor._id),
            businessName: vendor.businessName || "",
            ownerName: vendor.ownerName || "",
            isOnline: Boolean(vendor.isOnline),
            autoReplyEnabled:
              typeof vendor.autoReplyEnabled === "boolean"
                ? vendor.autoReplyEnabled
                : true,
          }
        : null,
    });
  } catch (error) {
    console.error("VENDOR CHAT LIST ERROR", error);
    return res.status(500).json({ message: "Failed to load vendor conversations" });
  }
});

router.get("/vendor/conversations/:id", requireVendor, async (req, res) => {
  try {
    const conversation = await findConversationForPanel(
      req.params.id,
      "vendor",
      req.user.id
    );

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.unreadByVendor > 0) {
      conversation.unreadByVendor = 0;
      await conversation.save();
    }

    return res.json({
      success: true,
      conversation: serializeConversationDetail(conversation),
    });
  } catch (error) {
    console.error("VENDOR CHAT DETAIL ERROR", error);
    return res.status(500).json({ message: "Failed to load conversation" });
  }
});

router.post("/vendor/conversations/:id/messages", requireVendor, async (req, res) => {
  try {
    const text = normalizeText(req.body?.text);

    if (!text) {
      return res.status(400).json({ message: "Reply message is required" });
    }

    const conversation = await findConversationForPanel(
      req.params.id,
      "vendor",
      req.user.id
    );

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const vendorReply = createMessage({
      senderType: "vendor",
      senderId: req.user.id,
      senderName:
        conversation.vendor?.businessName ||
        conversation.vendor?.ownerName ||
        "Venue Owner",
      text,
    });

    applyConversationMessage(conversation, vendorReply);
    await conversation.save();

    return res.json({
      success: true,
      conversation: serializeConversationDetail(conversation),
    });
  } catch (error) {
    console.error("VENDOR CHAT REPLY ERROR", error);
    return res.status(500).json({ message: "Failed to send reply" });
  }
});

router.patch("/vendor/conversations/:id/status", requireVendor, async (req, res) => {
  try {
    const nextStatus = normalizeText(req.body?.status).toLowerCase();

    if (!["new", "contacted", "booked", "closed"].includes(nextStatus)) {
      return res.status(400).json({ message: "Invalid lead status" });
    }

    const conversation = await findConversationForPanel(
      req.params.id,
      "vendor",
      req.user.id
    );

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    conversation.status = nextStatus;
    await conversation.save();

    return res.json({
      success: true,
      conversation: serializeConversationDetail(conversation),
    });
  } catch (error) {
    console.error("UPDATE VENDOR CHAT STATUS ERROR", error);
    return res.status(500).json({ message: "Failed to update lead status" });
  }
});

router.get("/admin/conversations", requireAdmin, async (req, res) => {
  try {
    const conversations = await Conversation.find()
      .populate("hall", PUBLIC_HALL_FIELDS)
      .populate("vendor", PUBLIC_VENDOR_FIELDS)
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    const filteredConversations = applySearchFilter(
      applyStatusFilter(conversations, req.query?.status),
      req.query?.q
    );

    return res.json({
      success: true,
      conversations: filteredConversations.map(serializeConversationSummary),
      analytics: buildConversationAnalytics(filteredConversations),
    });
  } catch (error) {
    console.error("ADMIN CHAT LIST ERROR", error);
    return res.status(500).json({ message: "Failed to load admin conversations" });
  }
});

router.get("/admin/conversations/:id", requireAdmin, async (req, res) => {
  try {
    const conversation = await findConversationForPanel(req.params.id, "admin");

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.unreadByAdmin > 0) {
      conversation.unreadByAdmin = 0;
      await conversation.save();
    }

    return res.json({
      success: true,
      conversation: serializeConversationDetail(conversation),
    });
  } catch (error) {
    console.error("ADMIN CHAT DETAIL ERROR", error);
    return res.status(500).json({ message: "Failed to load conversation" });
  }
});

router.post("/admin/conversations/:id/messages", requireAdmin, async (req, res) => {
  try {
    const text = normalizeText(req.body?.text);

    if (!text) {
      return res.status(400).json({ message: "Reply message is required" });
    }

    const conversation = await findConversationForPanel(req.params.id, "admin");

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const adminReply = createMessage({
      senderType: "admin",
      senderId: req.user.id,
      senderName: "UTSAVAS Admin",
      text,
    });

    applyConversationMessage(conversation, adminReply);
    await conversation.save();

    return res.json({
      success: true,
      conversation: serializeConversationDetail(conversation),
    });
  } catch (error) {
    console.error("ADMIN CHAT REPLY ERROR", error);
    return res.status(500).json({ message: "Failed to send reply" });
  }
});

router.patch("/admin/conversations/:id/status", requireAdmin, async (req, res) => {
  try {
    const nextStatus = normalizeText(req.body?.status).toLowerCase();

    if (!["new", "contacted", "booked", "closed"].includes(nextStatus)) {
      return res.status(400).json({ message: "Invalid lead status" });
    }

    const conversation = await findConversationForPanel(req.params.id, "admin");

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    conversation.status = nextStatus;
    await conversation.save();

    return res.json({
      success: true,
      conversation: serializeConversationDetail(conversation),
    });
  } catch (error) {
    console.error("UPDATE ADMIN CHAT STATUS ERROR", error);
    return res.status(500).json({ message: "Failed to update lead status" });
  }
});

module.exports = router;
