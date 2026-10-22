// src/models/skill.model.js
const mongoose = require("mongoose");

const skillSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tên kỹ năng không được để trống"],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
  },
  { timestamps: true }
);

const Skill = mongoose.model("Skill", skillSchema);

module.exports = Skill;
