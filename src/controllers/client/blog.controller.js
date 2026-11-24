// src/controllers/client/blog.controller.js
const blogService = require("../../services/blog.service");
const { Job, Article } = require("../../models");
const { JOB_MODERATION } = require("../../config/constants");
const { sanitizeArticleHtml } = require("../../utils/sanitizeHtml");
const { safeUrl } = require("../../utils/securityHelpers");

// Query param lặp (?a=1&a=2) => mảng; luôn lấy chuỗi đầu tiên để tránh crash khi .trim()/regex
const firstString = (v) => {
  const list = Array.isArray(v) ? v : [v];
  const found = list.find((x) => typeof x === "string");
  return found === undefined ? "" : found;
};

/**
 * Hiển thị danh sách bài viết / Cẩm nang IT
 */
async function renderBlogList(req, res) {
  const category = firstString(req.query.category);
  const audience = firstString(req.query.audience);
  const search = firstString(req.query.search);
  const page = firstString(req.query.page) || 1;

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
  let article = await blogService.getArticleBySlug(slug);
  let isDraftPreview = false;

  // Admin được xem trước bản nháp (chưa xuất bản) mà không tăng lượt xem (QA-M08/M15)
  if (!article && req.admin && typeof slug === "string" && slug.trim()) {
    article = await Article.findOne({ slug: slug.trim() }).lean();
    if (article) {
      isDraftPreview = true;
      article.content = sanitizeArticleHtml(article.content);
      article.sourceUrl = safeUrl(article.sourceUrl);
    }
  }

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

  // Kiểm tra quyền mở khóa bài viết độc quyền (Exclusive Gated Content)
  let isLocked = false;
  let requiredRole = null;

  if (article.isGated) {
    if (article.targetAudience === "candidate") {
      requiredRole = "candidate";
      if (req.role !== "candidate" && !req.admin) {
        isLocked = true;
      }
    } else if (article.targetAudience === "employer") {
      requiredRole = "employer";
      if (req.role !== "employer" && !req.admin) {
        isLocked = true;
      }
    }
  }

  res.render("pages/blog-details", {
    title: `${article.title} | VN.ITJobs Blog`,
    article,
    relatedArticles,
    featuredJobs,
    isLocked,
    requiredRole,
    // Đang đăng nhập nhưng sai vai trò => báo rõ thay vì link đăng nhập bị bounce im lặng (QA-M08)
    roleMismatch: Boolean(isLocked && req.role && req.role !== requiredRole),
    currentRole: req.role || null,
    isDraftPreview,
    categoryLabel: blogService.ARTICLE_CATEGORY_LABELS[article.category] || "Cẩm Nang IT",
  });
}

module.exports = {
  renderBlogList,
  renderBlogDetails,
};
