const mongoose = require("mongoose");

const conversationMessageSchema = new mongoose.Schema(
  {
    senderType: {
      type: String,
      enum: ["user", "vendor", "admin", "bot"],
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    senderName: {
      type: String,
      trim: true,
      default: "",
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
  }
);

const conversationSchema = new mongoose.Schema(
  {
    hall: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hall",
      required: true,
      index: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    accessToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customer: {
      name: {
        type: String,
        required: true,
        trim: true,
      },
      phone: {
        type: String,
        required: true,
        trim: true,
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: "",
      },
    },
    status: {
      type: String,
      enum: ["new", "contacted", "booked", "closed"],
      default: "new",
      index: true,
    },
    source: {
      type: String,
      trim: true,
      default: "venue-chat",
    },
    lastMessageText: {
      type: String,
      trim: true,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
    firstUserMessageAt: {
      type: Date,
      default: null,
    },
    firstVendorResponseAt: {
      type: Date,
      default: null,
    },
    unreadByVendor: {
      type: Number,
      default: 0,
      min: 0,
    },
    unreadByAdmin: {
      type: Number,
      default: 0,
      min: 0,
    },
    unreadByUser: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalMessages: {
      type: Number,
      default: 0,
      min: 0,
    },
    botReplyCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    vendorReplyCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    adminReplyCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    messages: {
      type: [conversationMessageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({ vendor: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ hall: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ "customer.phone": 1, vendor: 1, lastMessageAt: -1 });

module.exports =
  mongoose.models.Conversation ||
  mongoose.model("Conversation", conversationSchema);
