// src/models/companyFollow.model.js
const mongoose = require("mongoose");

const companyFollowSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
      index: true,
    },
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

companyFollowSchema.index({ candidateId: 1, employerId: 1 }, { unique: true });

const CompanyFollow = mongoose.model("CompanyFollow", companyFollowSchema);
module.exports = CompanyFollow;
