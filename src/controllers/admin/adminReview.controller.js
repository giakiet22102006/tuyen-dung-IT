// src/controllers/admin/adminReview.controller.js
const { Review } = require("../../models");
const { logAdminAction } = require("../../services/audit.service");
const paginate = require("../../utils/pagination");
const env = require("../../config/env");
const { escapeRegex, getSafeBackRedirect } = require("../../utils/securityHelpers");

const renderReviews = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const rawStatus = typeof req.query.status === "string" ? req.query.status.trim() : "all";
  const status = ["all", "hidden", "approved"].includes(rawStatus) ? rawStatus : "all";
  const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim().slice(0, 100) : "";

  const filter = {};
  if (status === "hidden") {
    filter.isApproved = false;
  } else if (status === "approved") {
    filter.isApproved = true;
  }

  if (keyword) {
    const reg = new RegExp(escapeRegex(keyword), "i");
    filter.$or = [{ title: reg }, { authorName: reg }, { pros: reg }, { cons: reg }];
  }

  const [total, totalAll, countApproved, countHidden] = await Promise.all([
    Review.countDocuments(filter),
    Review.countDocuments({}),
    Review.countDocuments({ isApproved: true }),
    Review.countDocuments({ isApproved: false }),
  ]);

  const pagination = paginate(total, page, 15);

  const reviews = await Review.find(filter)
    .populate("employerId", "companyName slug")
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  res.render("admin/reviews/index", {
    title: "Kiểm duyệt Đánh giá công ty - VN.ITJobs Admin",
    currentPath: `/${adminPath}/reviews`,
    reviews,
    pagination,
    filter: {
      status,
      keyword,
    },
    counts: {
      total: totalAll,
      filtered: total,
      countApproved,
      countHidden,
    },
  });
};

const postToggleReview = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const review = await Review.findById(req.params.id);
  if (!review) {
    req.flash("error", "Không tìm thấy đánh giá công ty yêu cầu.");
    return res.redirect(`/${adminPath}/reviews`);
  }

  review.isApproved = !review.isApproved;
  await review.save();

  await logAdminAction({
    adminId: req.admin._id,
    action: review.isApproved ? "review.approve" : "review.hide",
    targetType: "Review",
    targetId: review._id,
    meta: {
      title: review.title,
      authorName: review.authorName,
      employerId: String(review.employerId),
      isApproved: review.isApproved,
    },
    ip: req.ip,
  });

  req.flash(
    "success",
    review.isApproved
      ? "Đã phê duyệt hiển thị đánh giá công ty."
      : "Đã ẩn đánh giá khỏi trang công khai."
  );
  res.redirect(getSafeBackRedirect(req, `/${adminPath}/reviews`));
};

const postDeleteReview = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const review = await Review.findById(req.params.id);
  if (!review) {
    req.flash("error", "Không tìm thấy đánh giá công ty yêu cầu.");
    return res.redirect(`/${adminPath}/reviews`);
  }

  await Review.findByIdAndDelete(review._id);

  await logAdminAction({
    adminId: req.admin._id,
    action: "review.delete",
    targetType: "Review",
    targetId: review._id,
    meta: {
      title: review.title,
      authorName: review.authorName,
      employerId: String(review.employerId),
      rating: review.rating,
    },
    ip: req.ip,
  });

  req.flash("success", "Đã xóa đánh giá công ty thành công.");
  res.redirect(getSafeBackRedirect(req, `/${adminPath}/reviews`));
};

module.exports = {
  renderReviews,
  postToggleReview,
  postDeleteReview,
};
