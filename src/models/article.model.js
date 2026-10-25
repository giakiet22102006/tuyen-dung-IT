// src/models/article.model.js
const mongoose = require("mongoose");

const ARTICLE_CATEGORIES = {
  CAREER_ROADMAP: "career_roadmap",
  INTERVIEW_TIPS: "interview_tips",
  SALARY_INSIGHTS: "salary_insights",
  TECH_TRENDS: "tech_trends",
  RECRUITMENT_TIPS: "recruitment_tips",
};

const ARTICLE_CATEGORY_LABELS = {
  career_roadmap: "Lộ Trình Nghề Nghiệp",
  interview_tips: "Kinh Nghiệm Phỏng Vấn",
  salary_insights: "Báo Cáo Lương IT",
  tech_trends: "Xu Hướng Công Nghệ",
  recruitment_tips: "Bí Quyết Tuyển Dụng IT",
};

const TARGET_AUDIENCES = {
  ALL: "all",
  CANDIDATE: "candidate",
  EMPLOYER: "employer",
};

const TARGET_AUDIENCE_LABELS = {
  all: "Tất cả",
  candidate: "Dành cho Ứng viên",
  employer: "Dành cho Nhà tuyển dụng",
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
      required: true,
      trim: true,
      default: ARTICLE_CATEGORIES.CAREER_ROADMAP,
      index: true,
    },
    targetAudience: {
      type: String,
      enum: Object.values(TARGET_AUDIENCES),
      default: TARGET_AUDIENCES.ALL,
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
    // Khóa nội dung riêng tư (chỉ đúng vai trò tài khoản mới được đọc chi tiết)
    isGated: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Hỗ trợ trích xuất nguồn từ internet
    isOriginal: {
      type: Boolean,
      default: true,
    },
    sourceName: {
      type: String,
      trim: true,
      default: "",
    },
    sourceUrl: {
      type: String,
      trim: true,
      default: "",
    },
    originalAuthor: {
      type: String,
      trim: true,
      default: "",
    },
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

articleSchema.index({ isPublished: 1, targetAudience: 1, category: 1, publishedAt: -1 });

const Article = mongoose.model("Article", articleSchema);

module.exports = {
  Article,
  ARTICLE_CATEGORIES,
  ARTICLE_CATEGORY_LABELS,
  TARGET_AUDIENCES,
  TARGET_AUDIENCE_LABELS,
};
