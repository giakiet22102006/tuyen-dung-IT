// src/controllers/client/blog.controller.js
const blogService = require("../../services/blog.service");
const { Job } = require("../../models");
const { JOB_MODERATION } = require("../../config/constants");

/**
 * Hiển thị danh sách bài viết / Cẩm nang IT
 */
async function renderBlogList(req, res) {
  const { category = "", audience = "", search = "", page = 1 } = req.query;

  const { articles, pagination, total } = await blogService.getArticles({
    category,
    audience,
    search,
    page: parseInt(page, 10) || 1,
    limit: 6,
  });

  res.render("pages/blog-list", {
    title: "Cẩm Nang IT, Tuyển Dụng & Phát Triển Nghề Nghiệp | VN.ITJobs",
    articles,
    pagination,
    total,
    selectedCategory: category,
    selectedAudience: audience,
    searchKeyword: search,
    categories: blogService.ARTICLE_CATEGORIES,
    categoryLabels: blogService.ARTICLE_CATEGORY_LABELS,
    audiences: blogService.TARGET_AUDIENCES,
    audienceLabels: blogService.TARGET_AUDIENCE_LABELS,
  });
}

/**
 * Hiển thị chi tiết bài viết
 */
async function renderBlogDetails(req, res) {
  const { slug } = req.params;
  const article = await blogService.getArticleBySlug(slug);

  if (!article) {
    req.flash("error", "Bài viết không tồn tại hoặc đã ngừng xuất bản.");
    return res.redirect("/blog");
  }

  // Lấy các bài viết liên quan
  const relatedArticles = await blogService.getRelatedArticles(article.category, article._id, 3);

  // Lấy 3 việc làm nổi bật để gợi ý ở sidebar
  const featuredJobs = await Job.find({
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .limit(3)
    .populate("employerId", "companyName logo")
    .lean();

  res.render("pages/blog-details", {
    title: `${article.title} | VN.ITJobs Blog`,
    article,
    relatedArticles,
    featuredJobs,
    categoryLabel: blogService.ARTICLE_CATEGORY_LABELS[article.category] || "Cẩm Nang IT",
  });
}

module.exports = {
  renderBlogList,
  renderBlogDetails,
};
