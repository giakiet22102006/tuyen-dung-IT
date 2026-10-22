// src/controllers/admin/adminCandidate.controller.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Candidate, Application, AuditLog } = require("../../models");
const { CANDIDATE_STATUS, ADMIN_ROLES } = require("../../config/constants");
const { logAdminAction } = require("../../services/audit.service");
const { deleteFile } = require("../../services/storage.service");
const paginate = require("../../utils/pagination");
const env = require("../../config/env");

const renderList = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const { keyword, status, sort } = req.query;

  const filter = {};

  if (status === "deleted") {
    filter.deletedAt = { $ne: null };
  } else {
    filter.deletedAt = null;
    if (status && Object.values(CANDIDATE_STATUS).includes(status)) {
      filter.status = status;
    }
  }

  if (keyword && keyword.trim()) {
    const reg = new RegExp(keyword.trim(), "i");
    filter.$or = [{ fullName: reg }, { email: reg }, { phone: reg }];
  }

  let sortOption = { createdAt: -1 };
  if (sort === "oldest") sortOption = { createdAt: 1 };
  if (sort === "name-asc") sortOption = { fullName: 1 };
  if (sort === "name-desc") sortOption = { fullName: -1 };

  const total = await Candidate.countDocuments(filter);
  const pagination = paginate(total, page, 10);

  const candidates = await Candidate.find(filter)
    .sort(sortOption)
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  // Batch query số lượng CV đã nộp cho từng ứng viên (Zero N+1)
  const candIds = candidates.map((c) => c._id);
  const appCounts = await Application.aggregate([
    { $match: { candidateId: { $in: candIds } } },
    { $group: { _id: "$candidateId", count: { $sum: 1 } } },
  ]);
  const appCountMap = new Map(appCounts.map((a) => [String(a._id), a.count]));

  candidates.forEach((cand) => {
    cand.applicationCount = appCountMap.get(String(cand._id)) || 0;
  });

  res.render("admin/candidates/index", {
    title: "Quản lý Ứng viên - VN.ITJobs Admin",
    candidates,
    pagination,
    filter: {
      keyword: keyword || "",
      status: status || "",
      sort: sort || "",
    },
  });
};

const renderDetail = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const candidate = await Candidate.findById(req.params.id).lean();
  if (!candidate) {
    req.flash("error", "Không tìm thấy Ứng viên yêu cầu.");
    return res.redirect(`/${adminPath}/candidates`);
  }

  const [applications, auditLogs] = await Promise.all([
    Application.find({ candidateId: candidate._id })
      .populate("jobId", "title slug salaryMin salaryMax position workingForm")
      .populate("employerId", "companyName slug")
      .sort({ createdAt: -1 })
      .lean(),
    AuditLog.find({ targetType: "Candidate", targetId: String(candidate._id) })
      .populate("adminId", "fullName email")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  res.render("admin/candidates/detail", {
    title: `Chi tiết Ứng viên: ${candidate.fullName}`,
    candidate,
    applications,
    auditLogs,
  });
};

const renderCreate = (req, res) => {
  res.render("admin/candidates/create", {
    title: "Thêm mới Ứng viên - VN.ITJobs Admin",
    errors: {},
    old: {},
  });
};

const postCreate = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const { fullName, email, phone, status } = req.body;

  const errors = {};
  if (!fullName || !fullName.trim()) errors.fullName = "Họ tên không được để trống";
  if (!email || !email.trim()) errors.email = "Email không được để trống";

  if (Object.keys(errors).length > 0) {
    return res.status(400).render("admin/candidates/create", {
      title: "Thêm mới Ứng viên - VN.ITJobs Admin",
      errors,
      old: req.body,
    });
  }

  const existing = await Candidate.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    return res.status(400).render("admin/candidates/create", {
      title: "Thêm mới Ứng viên - VN.ITJobs Admin",
      errors: { email: "Email này đã được đăng ký" },
      old: req.body,
    });
  }

  const tempPassword = `Itj@${crypto.randomBytes(4).toString("hex")}`;
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const newCand = await Candidate.create({
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    password: passwordHash,
    phone: (phone || "").trim(),
    status: status || CANDIDATE_STATUS.ACTIVE,
  });

  await logAdminAction({
    adminId: req.admin._id,
    action: "candidate.create",
    targetType: "Candidate",
    targetId: newCand._id,
    meta: { fullName: newCand.fullName, email: newCand.email },
    ip: req.ip,
  });

  req.flash(
    "success",
    `Tạo tài khoản Ứng viên thành công! Mật khẩu tạm (chỉ hiển thị một lần): ${tempPassword}`
  );
  res.redirect(`/${adminPath}/candidates/${newCand._id}`);
};

const renderEdit = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const candidate = await Candidate.findById(req.params.id).lean();
  if (!candidate) {
    req.flash("error", "Không tìm thấy Ứng viên yêu cầu.");
    return res.redirect(`/${adminPath}/candidates`);
  }

  res.render("admin/candidates/edit", {
    title: `Sửa thông tin: ${candidate.fullName}`,
    candidate,
    errors: {},
  });
};

const postEdit = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const candidate = await Candidate.findById(req.params.id);
  if (!candidate) {
    req.flash("error", "Không tìm thấy Ứng viên yêu cầu.");
    return res.redirect(`/${adminPath}/candidates`);
  }

  const { fullName, phone } = req.body;
  if (!fullName || !fullName.trim()) {
    return res.status(400).render("admin/candidates/edit", {
      title: `Sửa thông tin: ${candidate.fullName}`,
      candidate: { ...candidate.toObject(), ...req.body },
      errors: { fullName: "Họ tên không được để trống" },
    });
  }

  candidate.fullName = fullName.trim();
  candidate.phone = (phone || "").trim();
  await candidate.save();

  await logAdminAction({
    adminId: req.admin._id,
    action: "candidate.update",
    targetType: "Candidate",
    targetId: candidate._id,
    meta: { fullName: candidate.fullName },
    ip: req.ip,
  });

  req.flash("success", "Cập nhật thông tin Ứng viên thành công!");
  res.redirect(`/${adminPath}/candidates/${candidate._id}`);
};

const postBan = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    req.flash("error", "Vui lòng nhập lý do khóa tài khoản bắt buộc.");
    return res.redirect(req.headers.referer || `/${adminPath}/candidates`);
  }

  const candidate = await Candidate.findById(req.params.id);
  if (!candidate) {
    req.flash("error", "Không tìm thấy Ứng viên.");
    return res.redirect(`/${adminPath}/candidates`);
  }

  candidate.status = CANDIDATE_STATUS.BANNED;
  candidate.banReason = reason.trim();
  candidate.tokenVersion += 1; // Hủy phiên lập tức
  await candidate.save();

  await logAdminAction({
    adminId: req.admin._id,
    action: "candidate.ban",
    targetType: "Candidate",
    targetId: candidate._id,
    meta: { fullName: candidate.fullName, reason: candidate.banReason },
    ip: req.ip,
  });

  req.flash("success", `Đã khóa tài khoản ứng viên ${candidate.fullName}.`);
  res.redirect(req.headers.referer || `/${adminPath}/candidates/${candidate._id}`);
};

const postUnban = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const candidate = await Candidate.findById(req.params.id);
  if (!candidate) {
    req.flash("error", "Không tìm thấy Ứng viên.");
    return res.redirect(`/${adminPath}/candidates`);
  }

  candidate.status = CANDIDATE_STATUS.ACTIVE;
  candidate.banReason = "";
  await candidate.save();

  await logAdminAction({
    adminId: req.admin._id,
    action: "candidate.unban",
    targetType: "Candidate",
    targetId: candidate._id,
    meta: { fullName: candidate.fullName },
    ip: req.ip,
  });

  req.flash("success", `Đã mở khóa tài khoản ứng viên ${candidate.fullName}.`);
  res.redirect(req.headers.referer || `/${adminPath}/candidates/${candidate._id}`);
};

const postResetPassword = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const candidate = await Candidate.findById(req.params.id);
  if (!candidate) {
    req.flash("error", "Không tìm thấy Ứng viên.");
    return res.redirect(`/${adminPath}/candidates`);
  }

  const tempPassword = `Itj@${crypto.randomBytes(4).toString("hex")}`;
  candidate.password = await bcrypt.hash(tempPassword, 12);
  candidate.tokenVersion += 1;
  await candidate.save();

  await logAdminAction({
    adminId: req.admin._id,
    action: "candidate.resetPassword",
    targetType: "Candidate",
    targetId: candidate._id,
    meta: { email: candidate.email },
    ip: req.ip,
  });

  req.flash(
    "success",
    `Đặt lại mật khẩu thành công! Mật khẩu tạm mới (chỉ hiển thị một lần): ${tempPassword}`
  );
  res.redirect(req.headers.referer || `/${adminPath}/candidates/${candidate._id}`);
};

const postSoftDelete = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const candidate = await Candidate.findById(req.params.id);
  if (!candidate) {
    req.flash("error", "Không tìm thấy Ứng viên.");
    return res.redirect(`/${adminPath}/candidates`);
  }

  candidate.deletedAt = new Date();
  candidate.tokenVersion += 1;
  await candidate.save();

  await logAdminAction({
    adminId: req.admin._id,
    action: "candidate.softDelete",
    targetType: "Candidate",
    targetId: candidate._id,
    meta: { fullName: candidate.fullName },
    ip: req.ip,
  });

  req.flash("success", `Đã xóa mềm tài khoản ứng viên ${candidate.fullName}.`);
  res.redirect(`/${adminPath}/candidates`);
};

const postRestore = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const candidate = await Candidate.findById(req.params.id);
  if (!candidate) {
    req.flash("error", "Không tìm thấy Ứng viên.");
    return res.redirect(`/${adminPath}/candidates`);
  }

  candidate.deletedAt = null;
  if (candidate.status === CANDIDATE_STATUS.BANNED) {
    candidate.status = CANDIDATE_STATUS.ACTIVE;
  }
  await candidate.save();

  await logAdminAction({
    adminId: req.admin._id,
    action: "candidate.restore",
    targetType: "Candidate",
    targetId: candidate._id,
    meta: { fullName: candidate.fullName },
    ip: req.ip,
  });

  req.flash("success", `Đã khôi phục tài khoản ứng viên ${candidate.fullName}.`);
  res.redirect(`/${adminPath}/candidates/${candidate._id}`);
};

const postHardDelete = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  if (req.admin.role !== ADMIN_ROLES.SUPERADMIN) {
    req.flash("error", "Chỉ Superadmin mới có quyền thực hiện xóa vĩnh viễn.");
    return res.redirect(`/${adminPath}/candidates`);
  }

  const candidate = await Candidate.findById(req.params.id);
  if (!candidate) {
    req.flash("error", "Không tìm thấy Ứng viên.");
    return res.redirect(`/${adminPath}/candidates`);
  }

  if (candidate.avatar && candidate.avatar.key) {
    deleteFile(candidate.avatar.key, "avatars");
  }

  await Application.deleteMany({ candidateId: candidate._id });
  await Candidate.findByIdAndDelete(candidate._id);

  await logAdminAction({
    adminId: req.admin._id,
    action: "candidate.hardDelete",
    targetType: "Candidate",
    targetId: candidate._id,
    meta: { fullName: candidate.fullName },
    ip: req.ip,
  });

  req.flash("success", `Đã xóa vĩnh viễn ứng viên ${candidate.fullName} cùng dữ liệu hồ sơ liên quan.`);
  res.redirect(`/${adminPath}/candidates`);
};

const postBulkAction = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const { action, ids } = req.body;
  const targetIds = Array.isArray(ids) ? ids : [ids].filter(Boolean);

  if (!targetIds.length) {
    req.flash("error", "Vui lòng chọn ít nhất một Ứng viên.");
    return res.redirect(`/${adminPath}/candidates`);
  }

  if (action === "ban") {
    const reason = req.body.reason || "Khóa hàng loạt bởi Quản trị viên";
    await Candidate.updateMany(
      { _id: { $in: targetIds } },
      { status: CANDIDATE_STATUS.BANNED, banReason: reason, $inc: { tokenVersion: 1 } }
    );

    await logAdminAction({
      adminId: req.admin._id,
      action: "candidate.bulkBan",
      targetType: "Candidate",
      targetId: "bulk",
      meta: { count: targetIds.length, ids: targetIds, reason },
      ip: req.ip,
    });
    req.flash("success", `Đã khóa hàng loạt ${targetIds.length} Ứng viên.`);
  }

  res.redirect(`/${adminPath}/candidates`);
};

module.exports = {
  renderList,
  renderDetail,
  renderCreate,
  postCreate,
  renderEdit,
  postEdit,
  postBan,
  postUnban,
  postResetPassword,
  postSoftDelete,
  postRestore,
  postHardDelete,
  postBulkAction,
};
