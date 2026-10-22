// src/models/job.model.js
const mongoose = require("mongoose");
const { POSITIONS, WORKING_FORMS, CITIES, JOB_MODERATION } = require("../config/constants");
const normalizeVi = require("../utils/normalizeVi");

const jobSchema = new mongoose.Schema(
  {
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
    },
    title: {
      type: String,
      required: [true, "Tiêu đề công việc không được để trống"],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    salaryMin: {
      type: Number,
      default: null,
    },
    salaryMax: {
      type: Number,
      default: null,
    },
    position: {
      type: String,
      enum: POSITIONS.map((p) => p.value),
      required: [true, "Cấp bậc không được để trống"],
    },
    workingForm: {
      type: String,
      enum: WORKING_FORMS.map((w) => w.value),
      required: [true, "Hình thức làm việc không được để trống"],
    },
    skills: [
      {
        name: { type: String, required: true },
        slug: { type: String, required: true, lowercase: true },
      },
    ],
    images: [
      {
        url: { type: String, required: true },
        key: { type: String, default: "" },
      },
    ],
    description: {
      type: String,
      default: "", // HTML đã sanitize
    },
    city: {
      type: String,
      enum: CITIES.map((c) => c.value),
      required: true,
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    employerActive: {
      type: Boolean,
      default: true,
    },
    moderation: {
      type: String,
      enum: Object.values(JOB_MODERATION),
      default: JOB_MODERATION.VISIBLE,
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
jobSchema.pre("save", function (next) {
  const skillNames = (this.skills || []).map((s) => s.name).join(" ");
  this.searchText = normalizeVi(`${this.title} ${skillNames}`);
  next();
});

// Indexes bắt buộc
jobSchema.index({
  employerActive: 1,
  moderation: 1,
  deletedAt: 1,
  city: 1,
  position: 1,
  workingForm: 1,
  createdAt: -1,
});
jobSchema.index({ employerId: 1, deletedAt: 1, createdAt: -1 });
jobSchema.index({ "skills.slug": 1, employerActive: 1, moderation: 1, deletedAt: 1, createdAt: -1 });
jobSchema.index({ employerActive: 1, moderation: 1, deletedAt: 1, employerId: 1 });
jobSchema.index({ searchText: "text" });

const Job = mongoose.model("Job", jobSchema);

module.exports = Job;
