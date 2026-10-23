// src/models/savedJob.model.js
const mongoose = require("mongoose");

const savedJobSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

savedJobSchema.index({ candidateId: 1, jobId: 1 }, { unique: true });
savedJobSchema.index({ candidateId: 1, createdAt: -1 });

const SavedJob = mongoose.model("SavedJob", savedJobSchema);

module.exports = SavedJob;
