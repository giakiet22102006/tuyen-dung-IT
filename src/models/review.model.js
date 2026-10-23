// src/models/review.model.js
const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
    authorRole: {
      type: String,
      enum: ["candidate", "employer"],
      default: "candidate",
    },
    authorCandidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      default: null,
    },
    authorEmployerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      default: null,
    },
    authorName: {
      type: String,
      required: [true, "Tên người đánh giá không được để trống"],
      trim: true,
    },
    rating: {
      type: Number,
      required: [true, "Điểm đánh giá (1-5 sao) là bắt buộc"],
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      required: [true, "Tiêu đề đánh giá không được để trống"],
      trim: true,
      maxlength: 120,
    },
    pros: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    cons: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    isApproved: {
      type: Boolean,
      default: true,
      index: true,
    },
    toxicityScore: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ employerId: 1, isApproved: 1, createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;
