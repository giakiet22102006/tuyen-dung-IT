// src/models/jobAlert.model.js
const mongoose = require("mongoose");
const crypto = require("crypto");

const jobAlertSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      default: null,
    },
    keyword: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    position: {
      type: String,
      trim: true,
      default: "",
    },
    frequency: {
      type: String,
      enum: ["instant", "daily"],
      default: "instant",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    unsubscribeToken: {
      type: String,
      unique: true,
      default: () => crypto.randomBytes(24).toString("hex"),
    },
    lastSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

jobAlertSchema.index({ email: 1, keyword: 1, city: 1, position: 1 });

const JobAlert = mongoose.model("JobAlert", jobAlertSchema);
module.exports = JobAlert;
