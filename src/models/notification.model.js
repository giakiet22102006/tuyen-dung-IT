// src/models/notification.model.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    recipientType: {
      type: String,
      enum: ["candidate", "employer", "admin"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      default: "#",
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "application_new",
        "status_change",
        "interview_invite",
        "interview_schedule",
        "interview_response",
        "talent_invite",
        "system",
      ],
      default: "system",
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientId: 1, recipientType: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
