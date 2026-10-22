// src/models/employer.model.js
const mongoose = require("mongoose");
const { EMPLOYER_STATUS, CITIES } = require("../config/constants");
const normalizeVi = require("../utils/normalizeVi");

const employerSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: [true, "Tên công ty không được để trống"],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
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
    logo: {
      url: { type: String, default: "" },
      key: { type: String, default: "" },
    },
    city: {
      type: String,
      enum: CITIES.map((c) => c.value),
      default: "ha-noi",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    companyModel: {
      type: String,
      trim: true,
      default: "", // Sản phẩm / Dịch vụ
    },
    companySize: {
      type: String,
      trim: true,
      default: "", // ví dụ: 50-100 nhân viên
    },
    workingTime: {
      type: String,
      trim: true,
      default: "", // Thứ 2 - Thứ 6
    },
    overtime: {
      type: String,
      trim: true,
      default: "", // Không có OT / Có OT
    },
    description: {
      type: String,
      default: "", // HTML đã sanitize
    },
    status: {
      type: String,
      enum: Object.values(EMPLOYER_STATUS),
      default: EMPLOYER_STATUS.PENDING,
    },
    banReason: {
      type: String,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
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
employerSchema.pre("save", function (next) {
  this.searchText = normalizeVi(`${this.companyName} ${this.email} ${this.phone || ""} ${this.address || ""}`);
  next();
});

// Indexes bắt buộc
employerSchema.index({ status: 1, deletedAt: 1, createdAt: -1 });
employerSchema.index({ status: 1, city: 1 });
employerSchema.index({ searchText: "text" });

const Employer = mongoose.model("Employer", employerSchema);

module.exports = Employer;
