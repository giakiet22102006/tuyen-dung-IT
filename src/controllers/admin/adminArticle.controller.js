// src/controllers/admin/adminArticle.controller.js
const blogService = require("../../services/blog.service");
const aiService = require("../../services/ai.service");
const { logAdminAction } = require("../../services/audit.service");

/**
 * Hiển thị danh sách cẩm nang IT trong trang Quản trị
 */
async function renderList(req, res) {
  const { search = "", category = "", audience = "", isPublished = "", page = 1 } = req.query;

  const { articles, pagination, total } = await blogService.getAdminArticles({
    search,
    category,
    audience,
    isPublished,
    page: parseInt(page, 10) || 1,
    limit: 10,
  });

  res.render("admin/articles/index", {
    title: "Quản lý Cẩm Nang IT | Admin VN.ITJobs",
    currentPath: `/${res.locals.adminPath}/articles`,
    articles,
    pagination,
    total,
    categories: blogService.ARTICLE_CATEGORIES,
    categoryLabels: blogService.ARTICLE_CATEGORY_LABELS,
    audiences: blogService.TARGET_AUDIENCES,
    audienceLabels: blogService.TARGET_AUDIENCE_LABELS,
    filters: { search, category, audience, isPublished },
  });
}

/**
 * Hiển thị form tạo bài viết mới
 */
function renderCreate(req, res) {
  res.render("admin/articles/create", {
    title: "Thêm Cẩm Nang IT Mới | Admin VN.ITJobs",
    currentPath: `/${res.locals.adminPath}/articles`,
    categories: blogService.ARTICLE_CATEGORIES,
    categoryLabels: blogService.ARTICLE_CATEGORY_LABELS,
    audiences: blogService.TARGET_AUDIENCES,
    audienceLabels: blogService.TARGET_AUDIENCE_LABELS,
  });
}

/**
 * Xử lý lưu bài viết mới
 */
async function postCreate(req, res) {
  const {
    title,
    slug,
    category,
    targetAudience,
    summary,
    content,
    thumbnail,
    tags,
    readingTime,
    isGated,
    isOriginal,
    sourceName,
    sourceUrl,
    originalAuthor,
    isPublished,
  } = req.body;

  if (!title || !title.trim() || !summary || !summary.trim() || !content || !content.trim()) {
    req.flash("error", "Vui lòng nhập đầy đủ tiêu đề, đoạn tóm tắt và nội dung bài viết.");
    return res.redirect(`/${res.locals.adminPath}/articles/create`);
  }

  try {
    const article = await blogService.createArticle({
      title,
      slug,
      category,
      targetAudience,
      summary,
      content,
      thumbnail,
      tags,
      readingTime,
      isGated: isGated === "true" || isGated === true || isGated === "on",
      isOriginal: isOriginal === "false" || isOriginal === false ? false : true,
      sourceName,
      sourceUrl,
      originalAuthor,
      isPublished: isPublished === "true" || isPublished === true || isPublished === "on",
    });

    await logAdminAction({
      adminId: req.admin._id,
      action: "article.create",
      targetType: "Article",
      targetId: article._id,
      meta: { title: article.title, category: article.category, isOriginal: article.isOriginal },
      ip: req.ip,
    });

    req.flash("success", "Đã thêm cẩm nang IT mới thành công.");
    return res.redirect(`/${res.locals.adminPath}/articles`);
  } catch (err) {
    console.error("Lỗi tạo article:", err);
    req.flash("error", `Không thể tạo bài viết: ${err.message}`);
    return res.redirect(`/${res.locals.adminPath}/articles/create`);
  }
}

/**
 * Hiển thị form chỉnh sửa bài viết
 */
async function renderEdit(req, res) {
  const { id } = req.params;
  const article = await blogService.getArticleById(id);

  if (!article) {
    req.flash("error", "Bài viết không tồn tại hoặc đã bị xóa.");
    return res.redirect(`/${res.locals.adminPath}/articles`);
  }

  res.render("admin/articles/edit", {
    title: `Sửa: ${article.title} | Admin VN.ITJobs`,
    currentPath: `/${res.locals.adminPath}/articles`,
    article,
    categories: blogService.ARTICLE_CATEGORIES,
    categoryLabels: blogService.ARTICLE_CATEGORY_LABELS,
    audiences: blogService.TARGET_AUDIENCES,
    audienceLabels: blogService.TARGET_AUDIENCE_LABELS,
  });
}

/**
 * Xử lý cập nhật bài viết
 */
async function postEdit(req, res) {
  const { id } = req.params;
  const {
    title,
    slug,
    category,
    targetAudience,
    summary,
    content,
    thumbnail,
    tags,
    readingTime,
    isGated,
    isOriginal,
    sourceName,
    sourceUrl,
    originalAuthor,
    isPublished,
  } = req.body;

  if (!title || !title.trim() || !summary || !summary.trim() || !content || !content.trim()) {
    req.flash("error", "Vui lòng nhập đầy đủ tiêu đề, đoạn tóm tắt và nội dung bài viết.");
    return res.redirect(`/${res.locals.adminPath}/articles/${id}/edit`);
  }

  try {
    const updated = await blogService.updateArticle(id, {
      title,
      slug,
      category,
      targetAudience,
      summary,
      content,
      thumbnail,
      tags,
      readingTime,
      isGated: isGated === "true" || isGated === true || isGated === "on",
      isOriginal: isOriginal === "false" || isOriginal === false ? false : true,
      sourceName,
      sourceUrl,
      originalAuthor,
      isPublished: isPublished === "true" || isPublished === true || isPublished === "on",
    });

    await logAdminAction({
      adminId: req.admin._id,
      action: "article.update",
      targetType: "Article",
      targetId: updated._id,
      meta: { title: updated.title, category: updated.category },
      ip: req.ip,
    });

    req.flash("success", "Cập nhật cẩm nang IT thành công.");
    return res.redirect(`/${res.locals.adminPath}/articles`);
  } catch (err) {
    console.error("Lỗi cập nhật article:", err);
    req.flash("error", `Không thể cập nhật bài viết: ${err.message}`);
    return res.redirect(`/${res.locals.adminPath}/articles/${id}/edit`);
  }
}

/**
 * Bật/Tắt trạng thái xuất bản
 */
async function postTogglePublish(req, res) {
  const { id } = req.params;
  try {
    const article = await blogService.toggleArticlePublish(id);

    await logAdminAction({
      adminId: req.admin._id,
      action: article.isPublished ? "article.publish" : "article.unpublish",
      targetType: "Article",
      targetId: article._id,
      meta: { isPublished: article.isPublished },
      ip: req.ip,
    });

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, isPublished: article.isPublished });
    }

    req.flash("success", `Đã ${article.isPublished ? "xuất bản" : "ẩn"} bài viết thành công.`);
    return res.redirect(`/${res.locals.adminPath}/articles`);
  } catch (err) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ success: false, message: err.message });
    }
    req.flash("error", err.message);
    return res.redirect(`/${res.locals.adminPath}/articles`);
  }
}

/**
 * Xóa bài viết
 */
async function postDelete(req, res) {
  const { id } = req.params;
  try {
    const article = await blogService.getArticleById(id);
    if (article) {
      await blogService.deleteArticle(id);
      await logAdminAction({
        adminId: req.admin._id,
        action: "article.delete",
        targetType: "Article",
        targetId: id,
        meta: { title: article.title },
        ip: req.ip,
      });
    }

    req.flash("success", "Đã xóa bài viết thành công.");
  } catch (err) {
    req.flash("error", `Lỗi xóa bài viết: ${err.message}`);
  }
  return res.redirect(`/${res.locals.adminPath}/articles`);
}

/**
 * API: AI Tự Động Viết Bài Cẩm Nang IT Theo Chủ Đề
 */
async function postAiGenerate(req, res) {
  const { topic, targetAudience = "all", category = "tech_trends" } = req.body;

  if (!topic || !topic.trim()) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập chủ đề hoặc ý tưởng bài viết để AI soạn thảo.",
    });
  }

  try {
    const generated = await aiService.generateArticleWithAi({
      topic: topic.trim(),
      targetAudience,
      category,
    });

    return res.json({
      success: true,
      data: generated,
    });
  } catch (err) {
    console.error("Lỗi API postAiGenerate:", err);
    return res.status(500).json({
      success: false,
      message: `Lỗi AI sinh nội dung: ${err.message}`,
    });
  }
}

/**
 * API: AI Biên Tập & Trích Xuất Cẩm Nang Từ Nguồn Ngoài (Link hoặc Text)
 */
async function postAiCurate(req, res) {
  const { sourceUrl = "", rawContent = "", targetAudience = "all" } = req.body;

  if ((!sourceUrl || !sourceUrl.trim()) && (!rawContent || !rawContent.trim())) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng dán link bài viết gốc hoặc văn bản thô cần biên tập.",
    });
  }

  try {
    const curated = await aiService.curateArticleFromSourceWithAi({
      sourceUrl: sourceUrl.trim(),
      rawContent: rawContent.trim(),
      targetAudience,
    });

    return res.json({
      success: true,
      data: curated,
    });
  } catch (err) {
    console.error("Lỗi API postAiCurate:", err);
    return res.status(500).json({
      success: false,
      message: `Lỗi AI biên tập nguồn ngoài: ${err.message}`,
    });
  }
}

module.exports = {
  renderList,
  renderCreate,
  postCreate,
  renderEdit,
  postEdit,
  postTogglePublish,
  postDelete,
  postAiGenerate,
  postAiCurate,
};
