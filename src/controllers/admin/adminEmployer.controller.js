// src/controllers/admin/adminEmployer.controller.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Employer, Job, Application, AuditLog } = require("../../models");
const { EMPLOYER_STATUS, CITIES, ADMIN_ROLES, JOB_MODERATION } = require("../../config/constants");
const { logAdminAction } = require("../../services/audit.service");
const { deleteFile } = require("../../services/storage.service");
const { clearStatsCache } = require("../../services/job.service");
const { clearMenuCache } = require("../../services/menu.service");
const slugify = require("../../utils/slugify");
const paginate = require("../../utils/pagination");
const env = require("../../config/env");

const renderList = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const { keyword, status, city, sort } = req.query;

  const filter = {};

  // Lọc theo trạng thái
  if (status === "deleted") {
    filter.deletedAt = { $ne: null };
  } else {
    filter.deletedAt = null;
    if (status && Object.values(EMPLOYER_STATUS).includes(status)) {
      filter.status = status;
    }
  }

  // Lọc theo thành phố
  if (city) {
    filter.city = city;
  }

  // Lọc theo từ khóa
  if (keyword && keyword.trim()) {
    const reg = new RegExp(keyword.trim(), "i");
    filter.$or = [{ companyName: reg }, { email: reg }, { phone: reg }];
  }

  // Sắp xếp
  let sortOption = { createdAt: -1 };
  if (sort === "oldest") sortOption = { createdAt: 1 };
  if (sort === "name-asc") sortOption = { companyName: 1 };
  if (sort === "name-desc") sortOption = { companyName: -1 };

  const total = await Employer.countDocuments(filter);
  const pagination = paginate(total, page, 10);

  const employers = await Employer.find(filter)
    .sort(sortOption)
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  // Batch query số lượng job cho từng công ty (Zero N+1)
  const empIds = employers.map((e) => e._id);
  const jobCounts = await Job.aggregate([
    { $match: { employerId: { $in: empIds }, deletedAt: null } },
    { $group: { _id: "$employerId", count: { $sum: 1 } } },
  ]);
  const jobCountMap = new Map(jobCounts.map((j) => [String(j._id), j.count]));

  employers.forEach((emp) => {
    emp.jobCount = jobCountMap.get(String(emp._id)) || 0;
  });

  res.render("admin/employers/index", {
    title: "Quản lý Nhà tuyển dụng - VN.ITJobs Admin",
    employers,
    pagination,
    cities: CITIES,
    filter: {
      keyword: keyword || "",
      status: status || "",
      city: city || "",
      sort: sort || "",
    },
  });
};

const renderDetail = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const employer = await Employer.findById(req.params.id).lean();
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng yêu cầu.");
    return res.redirect(`/${adminPath}/employers`);
  }

  const [jobs, appCount, auditLogs] = await Promise.all([
    Job.find({ employerId: employer._id }).sort({ createdAt: -1 }).lean(),
    Application.countDocuments({ employerId: employer._id }),
    AuditLog.find({ targetType: "Employer", targetId: String(employer._id) })
      .populate("adminId", "fullName email")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  res.render("admin/employers/detail", {
    title: `Chi tiết NTD: ${employer.companyName}`,
    employer,
    jobs,
    applicationCount: appCount,
    auditLogs,
  });
};

const renderCreate = (req, res) => {
  res.render("admin/employers/create", {
    title: "Thêm mới Nhà tuyển dụng - VN.ITJobs Admin",
    cities: CITIES,
    errors: {},
    old: {},
  });
};

const postCreate = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const { companyName, email, city, address, phone, companyModel, status } = req.body;

  const errors = {};
  if (!companyName || !companyName.trim()) errors.companyName = "Tên công ty không được để trống";
  if (!email || !email.trim()) errors.email = "Email không được để trống";

  if (Object.keys(errors).length > 0) {
    return res.status(400).render("admin/employers/create", {
      title: "Thêm mới Nhà tuyển dụng - VN.ITJobs Admin",
      cities: CITIES,
      errors,
      old: req.body,
    });
  }

  const existing = await Employer.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    return res.status(400).render("admin/employers/create", {
      title: "Thêm mới Nhà tuyển dụng - VN.ITJobs Admin",
      cities: CITIES,
      errors: { email: "Email này đã được sử dụng bởi công ty khác" },
      old: req.body,
    });
  }

  // Sinh mật khẩu tạm ngẫu nhiên
  const tempPassword = `Itj@${crypto.randomBytes(4).toString("hex")}`;
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const slug = slugify(companyName, true);

  const newEmp = await Employer.create({
    companyName: companyName.trim(),
    slug,
    email: email.toLowerCase().trim(),
    password: passwordHash,
    city: city || "ha-noi",
    address: (address || "").trim(),
    phone: (phone || "").trim(),
    companyModel: (companyModel || "").trim(),
    status: status || EMPLOYER_STATUS.ACTIVE,
  });

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.create",
    targetType: "Employer",
    targetId: newEmp._id,
    meta: { companyName: newEmp.companyName, email: newEmp.email },
    ip: req.ip,
  });

  clearStatsCache();
  clearMenuCache();

  req.flash(
    "success",
    `Tạo tài khoản Nhà tuyển dụng thành công! Mật khẩu tạm (chỉ hiển thị một lần): ${tempPassword}`
  );
  res.redirect(`/${adminPath}/employers/${newEmp._id}`);
};

const renderEdit = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const employer = await Employer.findById(req.params.id).lean();
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng yêu cầu.");
    return res.redirect(`/${adminPath}/employers`);
  }

  res.render("admin/employers/edit", {
    title: `Sửa thông tin: ${employer.companyName}`,
    employer,
    cities: CITIES,
    errors: {},
  });
};

const postEdit = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const employer = await Employer.findById(req.params.id);
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng yêu cầu.");
    return res.redirect(`/${adminPath}/employers`);
  }

  const { companyName, city, address, phone, companyModel, companySize, workingTime, overtime } = req.body;
  if (!companyName || !companyName.trim()) {
    return res.status(400).render("admin/employers/edit", {
      title: `Sửa thông tin: ${employer.companyName}`,
      employer: { ...employer.toObject(), ...req.body },
      cities: CITIES,
      errors: { companyName: "Tên công ty không được để trống" },
    });
  }

  employer.companyName = companyName.trim();
  employer.city = city || employer.city;
  employer.address = (address || "").trim();
  employer.phone = (phone || "").trim();
  employer.companyModel = (companyModel || "").trim();
  employer.companySize = (companySize || "").trim();
  employer.workingTime = (workingTime || "").trim();
  employer.overtime = (overtime || "").trim();

  await employer.save();

  // Đồng bộ city và address cho toàn bộ job
  await Job.updateMany(
    { employerId: employer._id },
    { city: employer.city, address: employer.address }
  );

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.update",
    targetType: "Employer",
    targetId: employer._id,
    meta: { companyName: employer.companyName },
    ip: req.ip,
  });

  clearStatsCache();
  clearMenuCache();

  req.flash("success", "Cập nhật thông tin Nhà tuyển dụng thành công!");
  res.redirect(`/${adminPath}/employers/${employer._id}`);
};

const postApprove = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const employer = await Employer.findById(req.params.id);
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  employer.status = EMPLOYER_STATUS.ACTIVE;
  employer.approvedAt = new Date();
  employer.approvedBy = req.admin._id;
  await employer.save();

  // Kích hoạt hiển thị job công khai
  await Job.updateMany({ employerId: employer._id, deletedAt: null }, { employerActive: true });

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.approve",
    targetType: "Employer",
    targetId: employer._id,
    meta: { companyName: employer.companyName },
    ip: req.ip,
  });

  clearStatsCache();
  clearMenuCache();

  req.flash("success", `Đã phê duyệt tài khoản công ty ${employer.companyName}!`);
  res.redirect(req.headers.referer || `/${adminPath}/employers/${employer._id}`);
};

const postBan = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    req.flash("error", "Vui lòng nhập lý do khóa tài khoản bắt buộc.");
    return res.redirect(req.headers.referer || `/${adminPath}/employers`);
  }

  const employer = await Employer.findById(req.params.id);
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  employer.status = EMPLOYER_STATUS.BANNED;
  employer.banReason = reason.trim();
  employer.tokenVersion += 1; // Đá người dùng ra khỏi phiên ngay lập tức
  await employer.save();

  // Ẩn toàn bộ job của NTD này
  await Job.updateMany({ employerId: employer._id }, { employerActive: false });

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.ban",
    targetType: "Employer",
    targetId: employer._id,
    meta: { companyName: employer.companyName, reason: employer.banReason },
    ip: req.ip,
  });

  clearStatsCache();
  clearMenuCache();

  req.flash("success", `Đã khóa tài khoản công ty ${employer.companyName}.`);
  res.redirect(req.headers.referer || `/${adminPath}/employers/${employer._id}`);
};

const postUnban = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const employer = await Employer.findById(req.params.id);
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  employer.status = EMPLOYER_STATUS.ACTIVE;
  employer.banReason = "";
  await employer.save();

  // Mở lại hiển thị job công khai
  await Job.updateMany({ employerId: employer._id, deletedAt: null }, { employerActive: true });

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.unban",
    targetType: "Employer",
    targetId: employer._id,
    meta: { companyName: employer.companyName },
    ip: req.ip,
  });

  clearStatsCache();
  clearMenuCache();

  req.flash("success", `Đã mở khóa tài khoản công ty ${employer.companyName}.`);
  res.redirect(req.headers.referer || `/${adminPath}/employers/${employer._id}`);
};

const postResetPassword = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const employer = await Employer.findById(req.params.id);
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  const tempPassword = `Itj@${crypto.randomBytes(4).toString("hex")}`;
  employer.password = await bcrypt.hash(tempPassword, 12);
  employer.tokenVersion += 1;
  await employer.save();

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.resetPassword",
    targetType: "Employer",
    targetId: employer._id,
    meta: { email: employer.email },
    ip: req.ip,
  });

  req.flash(
    "success",
    `Đặt lại mật khẩu thành công! Mật khẩu tạm mới (chỉ hiển thị một lần): ${tempPassword}`
  );
  res.redirect(req.headers.referer || `/${adminPath}/employers/${employer._id}`);
};

const postSoftDelete = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const employer = await Employer.findById(req.params.id);
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  employer.deletedAt = new Date();
  employer.tokenVersion += 1;
  await employer.save();

  // Ẩn job công khai
  await Job.updateMany({ employerId: employer._id }, { employerActive: false });

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.softDelete",
    targetType: "Employer",
    targetId: employer._id,
    meta: { companyName: employer.companyName },
    ip: req.ip,
  });

  clearStatsCache();
  clearMenuCache();

  req.flash("success", `Đã xóa mềm tài khoản công ty ${employer.companyName}.`);
  res.redirect(`/${adminPath}/employers`);
};

const postRestore = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const employer = await Employer.findById(req.params.id);
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  employer.deletedAt = null;
  if (employer.status === EMPLOYER_STATUS.BANNED) {
    employer.status = EMPLOYER_STATUS.ACTIVE;
  }
  await employer.save();

  if (employer.status === EMPLOYER_STATUS.ACTIVE) {
    await Job.updateMany({ employerId: employer._id, deletedAt: null }, { employerActive: true });
  }

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.restore",
    targetType: "Employer",
    targetId: employer._id,
    meta: { companyName: employer.companyName },
    ip: req.ip,
  });

  clearStatsCache();
  clearMenuCache();

  req.flash("success", `Đã khôi phục tài khoản công ty ${employer.companyName}.`);
  res.redirect(`/${adminPath}/employers/${employer._id}`);
};

const postHardDelete = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  if (req.admin.role !== ADMIN_ROLES.SUPERADMIN) {
    req.flash("error", "Chỉ Superadmin mới có quyền thực hiện xóa vĩnh viễn.");
    return res.redirect(`/${adminPath}/employers`);
  }

  const employer = await Employer.findById(req.params.id);
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  // Dọn dẹp logo
  if (employer.logo && employer.logo.key) {
    deleteFile(employer.logo.key, "logos");
  }

  // Xóa cascade jobs và applications
  await Job.deleteMany({ employerId: employer._id });
  await Application.deleteMany({ employerId: employer._id });
  await Employer.findByIdAndDelete(employer._id);

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.hardDelete",
    targetType: "Employer",
    targetId: employer._id,
    meta: { companyName: employer.companyName },
    ip: req.ip,
  });

  clearStatsCache();
  clearMenuCache();

  req.flash("success", `Đã xóa vĩnh viễn tài khoản công ty ${employer.companyName} cùng toàn bộ dữ liệu liên quan.`);
  res.redirect(`/${adminPath}/employers`);
};

const postBulkAction = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const { action, ids } = req.body;
  const targetIds = Array.isArray(ids) ? ids : [ids].filter(Boolean);

  if (!targetIds.length) {
    req.flash("error", "Vui lòng chọn ít nhất một Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  if (action === "approve") {
    await Employer.updateMany(
      { _id: { $in: targetIds }, status: EMPLOYER_STATUS.PENDING },
      { status: EMPLOYER_STATUS.ACTIVE, approvedAt: new Date(), approvedBy: req.admin._id }
    );
    await Job.updateMany({ employerId: { $in: targetIds }, deletedAt: null }, { employerActive: true });

    await logAdminAction({
      adminId: req.admin._id,
      action: "employer.bulkApprove",
      targetType: "Employer",
      targetId: "bulk",
      meta: { count: targetIds.length, ids: targetIds },
      ip: req.ip,
    });
    req.flash("success", `Đã phê duyệt hàng loạt ${targetIds.length} Nhà tuyển dụng.`);
  } else if (action === "ban") {
    const reason = req.body.reason || "Khóa hàng loạt bởi Quản trị viên";
    await Employer.updateMany(
      { _id: { $in: targetIds } },
      { status: EMPLOYER_STATUS.BANNED, banReason: reason, $inc: { tokenVersion: 1 } }
    );
    await Job.updateMany({ employerId: { $in: targetIds } }, { employerActive: false });

    await logAdminAction({
      adminId: req.admin._id,
      action: "employer.bulkBan",
      targetType: "Employer",
      targetId: "bulk",
      meta: { count: targetIds.length, ids: targetIds, reason },
      ip: req.ip,
    });
    req.flash("success", `Đã khóa hàng loạt ${targetIds.length} Nhà tuyển dụng.`);
  }

  clearStatsCache();
  clearMenuCache();
  res.redirect(`/${adminPath}/employers`);
};

const postToggleJobModeration = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const job = await Job.findById(req.params.id);
  if (!job) {
    req.flash("error", "Không tìm thấy việc làm.");
    return res.redirect(req.headers.referer || `/${adminPath}/employers`);
  }

  job.moderation = job.moderation === JOB_MODERATION.VISIBLE ? JOB_MODERATION.HIDDEN : JOB_MODERATION.VISIBLE;
  await job.save();

  await logAdminAction({
    adminId: req.admin._id,
    action: "job.toggleModeration",
    targetType: "Job",
    targetId: job._id,
    meta: { title: job.title, moderation: job.moderation },
    ip: req.ip,
  });

  clearStatsCache();
  clearMenuCache();

  req.flash("success", `Đã chuyển trạng thái việc làm sang: ${job.moderation === JOB_MODERATION.VISIBLE ? "Hiển thị" : "Đã ẩn"}.`);
  res.redirect(req.headers.referer || `/${adminPath}/employers/${job.employerId}`);
};

module.exports = {
  renderList,
  renderDetail,
  renderCreate,
  postCreate,
  renderEdit,
  postEdit,
  postApprove,
  postBan,
  postUnban,
  postResetPassword,
  postSoftDelete,
  postRestore,
  postHardDelete,
  postBulkAction,
  postToggleJobModeration,
};
