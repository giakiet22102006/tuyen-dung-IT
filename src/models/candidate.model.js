// src/models/candidate.model.js
const mongoose = require("mongoose");
const { CANDIDATE_STATUS } = require("../config/constants");
const normalizeVi = require("../utils/normalizeVi");

const candidateSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Họ tên không được để trống"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email không được để trống"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Mật khẩu không được để trống"],
      select: false,
    },
    googleId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    avatar: {
      url: { type: String, default: "" },
      key: { type: String, default: "" },
    },
    itProfile: {
      title: { type: String, default: "", trim: true },
      level: { type: String, default: "junior" },
      yearsOfExperience: { type: Number, default: 0 },
      bio: { type: String, default: "", trim: true },
      githubUrl: { type: String, default: "", trim: true },
      linkedinUrl: { type: String, default: "", trim: true },
      portfolioUrl: { type: String, default: "", trim: true },
      skills: [{ type: String, trim: true }],
      workExperience: [
        {
          company: { type: String, default: "", trim: true },
          position: { type: String, default: "", trim: true },
          startDate: { type: String, default: "" },
          endDate: { type: String, default: "" },
          isCurrent: { type: Boolean, default: false },
          description: { type: String, default: "", trim: true },
        },
      ],
      education: [
        {
          school: { type: String, default: "", trim: true },
          major: { type: String, default: "", trim: true },
          gradYear: { type: String, default: "" },
        },
      ],
      projects: [
        {
          name: { type: String, default: "", trim: true },
          role: { type: String, default: "", trim: true },
          techStack: { type: String, default: "", trim: true },
          description: { type: String, default: "", trim: true },
          link: { type: String, default: "", trim: true },
        },
      ],
      certificates: [
        {
          name: { type: String, default: "", trim: true },
          organization: { type: String, default: "", trim: true },
          year: { type: String, default: "" },
        },
      ],
      updatedAt: { type: Date, default: null },
    },
    status: {
      type: String,
      enum: Object.values(CANDIDATE_STATUS),
      default: CANDIDATE_STATUS.ACTIVE,
    },
    banReason: {
      type: String,
      default: null,
    },
    bannedAt: {
      type: Date,
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    searchText: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Tự động cập nhật searchText trước khi lưu
candidateSchema.pre("save", function (next) {
  this.searchText = normalizeVi(`${this.fullName} ${this.email} ${this.phone || ""}`);
  next();
});

// Indexes bắt buộc
candidateSchema.index({ status: 1, deletedAt: 1, createdAt: -1 });
candidateSchema.index({ searchText: "text" });

const Candidate = mongoose.model("Candidate", candidateSchema);

module.exports = Candidate;
