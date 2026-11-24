// src/models/storedFile.model.js
const mongoose = require("mongoose");

const storedFileSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    folder: {
      type: String,
      required: true,
      enum: ["logos", "avatars", "jobs", "articles", "cv"],
      index: true,
    },
    contentType: {
      type: String,
      default: "application/octet-stream",
    },
    size: {
      type: Number,
      default: 0,
    },
    data: {
      type: Buffer,
      required: true,
    },
  },
  { timestamps: true }
);

storedFileSchema.index({ folder: 1, key: 1 });

const StoredFile = mongoose.model("StoredFile", storedFileSchema);

module.exports = StoredFile;
