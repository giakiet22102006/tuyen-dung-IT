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
    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },
    rejectionNote: {
      type: String,
      default: "",
      trim: true,
    },
    rejectedAt: {
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
    interviewInvitation: {
      sentAt: { type: Date, default: null },
      subject: { type: String, default: "" },
      content: { type: String, default: "" },
      employerEmail: { type: String, default: "" },
      employerPhone: { type: String, default: "" },
      interviewDate: { type: String, default: "" },
      location: { type: String, default: "" },
    },
    // Đánh giá ứng viên (Scorecard 1 - 5 sao)
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    // Ghi chú nội bộ của nhà tuyển dụng (Private Internal Notes)
    internalNotes: [
      {
        author: { type: String, default: "HR Recruiter" },
        content: { type: String, required: true, trim: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // Lập lịch phỏng vấn thông minh & Đồng bộ Calendar
    interviewSchedule: {
      scheduledAt: { type: Date, default: null },
      durationMinutes: { type: Number, default: 60 },
      locationType: {
        type: String,
        enum: ["online", "offline"],
        default: "online",
      },
      meetingLink: { type: String, default: "", trim: true },
      locationAddress: { type: String, default: "", trim: true },
      interviewers: { type: String, default: "", trim: true },
      notes: { type: String, default: "", trim: true },
      status: {
        type: String,
        enum: ["pending", "confirmed", "rescheduled", "cancelled"],
        default: "pending",
      },
      candidateResponse: {
        status: { type: String, default: "" },
        note: { type: String, default: "" },
        respondedAt: { type: Date, default: null },
      },
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
