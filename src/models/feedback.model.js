// src/models/feedback.model.js
const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["bug", "rating", "suggestion"],
      default: "bug",
      index: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    title: {
      type: String,
      trim: true,
      default: "",
      maxlength: 150,
    },
    content: {
      type: String,
      required: [true, "Nội dung phản hồi không được để trống"],
      trim: true,
      maxlength: 3000,
    },
    url: {
      type: String,
      trim: true,
      default: "",
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    contactName: {
      type: String,
      trim: true,
      default: "",
    },
    userRole: {
      type: String,
      enum: ["guest", "candidate", "employer", "admin"],
      default: "guest",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    status: {
      type: String,
      enum: ["new", "in_progress", "resolved", "closed"],
      default: "new",
      index: true,
    },
    adminNote: {
      type: String,
      trim: true,
      default: "",
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

feedbackSchema.index({ status: 1, createdAt: -1 });

const Feedback = mongoose.model("Feedback", feedbackSchema);

module.exports = Feedback;
