// src/models/application.model.js
const mongoose = require("mongoose");
const { APPLICATION_STATUS } = require("../config/constants");

const applicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
    },
    fullName: {
      type: String,
      required: [true, "Họ tên không được để trống"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email không được để trống"],
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: [true, "Số điện thoại không được để trống"],
      trim: true,
    },
    cv: {
      key: { type: String, required: true },
      originalName: { type: String, default: "CV.pdf" },
      size: { type: Number, default: 0 },
    },
    viewed: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: Object.values(APPLICATION_STATUS),
      default: APPLICATION_STATUS.PENDING,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    hiddenByEmployer: {
      type: Boolean,
      default: false,
    },
    hiddenByCandidate: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Indexes bắt buộc
applicationSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });
applicationSchema.index({ employerId: 1, hiddenByEmployer: 1, createdAt: -1 });
applicationSchema.index({ candidateId: 1, hiddenByCandidate: 1, createdAt: -1 });

const Application = mongoose.model("Application", applicationSchema);

module.exports = Application;
