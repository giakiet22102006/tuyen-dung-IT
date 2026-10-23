// src/controllers/admin/adminFeedback.controller.js
const { Feedback } = require("../../models");
const paginate = require("../../utils/pagination");

const renderFeedbacks = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const { type, status } = req.query;

  const filter = {};
  if (type && ["bug", "rating", "suggestion"].includes(type)) {
    filter.type = type;
  }
  if (status && ["new", "in_progress", "resolved", "closed"].includes(status)) {
    filter.status = status;
  }

  const [total, countNew, countInProgress, countResolved, countBugs, countRatings] =
    await Promise.all([
      Feedback.countDocuments(filter),
      Feedback.countDocuments({ status: "new" }),
      Feedback.countDocuments({ status: "in_progress" }),
      Feedback.countDocuments({ status: "resolved" }),
      Feedback.countDocuments({ type: "bug" }),
      Feedback.countDocuments({ type: "rating" }),
    ]);

  const pagination = paginate(total, page, 15);

  const feedbacks = await Feedback.find(filter)
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  res.render("admin/feedbacks/index", {
    title: "Quản lý Báo cáo sự cố & Đánh giá web - Admin VN.ITJobs",
    feedbacks,
    pagination,
    filter: {
      type: type || "",
      status: status || "",
    },
    counts: {
      total,
      countNew,
      countInProgress,
      countResolved,
      countBugs,
      countRatings,
    },
  });
};

const postUpdateStatus = async (req, res) => {
  const { id } = req.params;
  const { status, adminNote } = req.body;

  const feedback = await Feedback.findById(id);
  if (!feedback) {
    req.flash("error", "Không tìm thấy phản hồi.");
    return res.redirect("/admin/feedbacks");
  }

  if (status && ["new", "in_progress", "resolved", "closed"].includes(status)) {
    feedback.status = status;
    if (status === "resolved") {
      feedback.resolvedAt = new Date();
    }
  }

  if (adminNote !== undefined) {
    feedback.adminNote = adminNote.trim();
  }

  await feedback.save();
  req.flash("success", "Cập nhật trạng thái phản hồi thành công!");
  res.redirect(req.headers.referer || "/admin/feedbacks");
};

const postDeleteFeedback = async (req, res) => {
  const { id } = req.params;
  await Feedback.findByIdAndDelete(id);
  req.flash("success", "Đã xóa phản hồi / báo cáo sự cố thành công.");
  res.redirect("/admin/feedbacks");
};

module.exports = {
  renderFeedbacks,
  postUpdateStatus,
  postDeleteFeedback,
};
