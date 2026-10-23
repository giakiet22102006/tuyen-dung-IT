// src/models/article.model.js
const mongoose = require("mongoose");

const ARTICLE_CATEGORIES = {
  CAREER_ROADMAP: "career_roadmap",
  INTERVIEW_TIPS: "interview_tips",
  SALARY_INSIGHTS: "salary_insights",
  TECH_TRENDS: "tech_trends",
};

const ARTICLE_CATEGORY_LABELS = {
  career_roadmap: "Lộ Trình Nghề Nghiệp",
  interview_tips: "Kinh Nghiệm Phỏng Vấn",
  salary_insights: "Báo Cáo Lương IT",
  tech_trends: "Xu Hướng Công Nghệ",
};

const articleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    category: {
      type: String,
      enum: Object.values(ARTICLE_CATEGORIES),
      default: ARTICLE_CATEGORIES.CAREER_ROADMAP,
      index: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    thumbnail: {
      type: String,
      default: "/assets/images/demo/demo1.png",
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    author: {
      name: { type: String, default: "Ban Biên Tập VN.ITJobs" },
      role: { type: String, default: "Senior IT Technical Recruiter" },
      avatar: { type: String, default: "/assets/images/demo/demo4.png" },
    },
    readingTime: {
      type: Number,
      default: 5,
    },
    views: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

articleSchema.index({ isPublished: 1, category: 1, publishedAt: -1 });

const Article = mongoose.model("Article", articleSchema);

module.exports = {
  Article,
  ARTICLE_CATEGORIES,
  ARTICLE_CATEGORY_LABELS,
};
