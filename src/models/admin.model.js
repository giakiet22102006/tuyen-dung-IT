// src/models/admin.model.js
const mongoose = require("mongoose");
const { ADMIN_ROLES, ADMIN_STATUS } = require("../config/constants");

const adminSchema = new mongoose.Schema(
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
    role: {
      type: String,
      enum: Object.values(ADMIN_ROLES),
      default: ADMIN_ROLES.ADMIN,
    },
    status: {
      type: String,
      enum: Object.values(ADMIN_STATUS),
      default: ADMIN_STATUS.ACTIVE,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

adminSchema.index({ status: 1, createdAt: -1 });

const Admin = mongoose.model("Admin", adminSchema);

module.exports = Admin;
