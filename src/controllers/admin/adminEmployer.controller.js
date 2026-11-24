// src/controllers/admin/adminEmployer.controller.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const {
  Employer,
  Job,
  Application,
  AuditLog,
  SavedJob,
  CompanyFollow,
  Review,
  JobAlert,
  Notification,
  Otp,
} = require("../../models");
const { EMPLOYER_STATUS, CITIES, ADMIN_ROLES, JOB_MODERATION } = require("../../config/constants");
const { logAdminAction } = require("../../services/audit.service");
const storageService = require("../../services/storage.service");
const { clearStatsCache } = require("../../services/job.service");
const { clearMenuCache } = require("../../services/menu.service");
const slugify = require("../../utils/slugify");
const paginate = require("../../utils/pagination");
const env = require("../../config/env");
const { escapeRegex, isValidObjectId, getSafeBackRedirect } = require("../../utils/securityHelpers");

const ALLOWED_CITY_VALUES = new Set(CITIES.map((c) => c.value));

const renderList = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
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

  // Lọc theo thành phố (allowlist chặt chẽ)
  if (typeof city === "string" && ALLOWED_CITY_VALUES.has(city)) {
    filter.city = city;
  }

  // Lọc theo từ khóa (escapeRegex chống ReDoS)
  if (typeof keyword === "string" && keyword.trim()) {
    const reg = new RegExp(escapeRegex(keyword), "i");
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

  const cleanEmail = email.toLowerCase().trim();
  const existing = await Employer.exists({
    $or: [{ email: cleanEmail }, { "teamMembers.email": cleanEmail }],
  });
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

  const finalStatus =
    status && Object.values(EMPLOYER_STATUS).includes(status) ? status : EMPLOYER_STATUS.ACTIVE;
  const isApprovedNow = finalStatus === EMPLOYER_STATUS.ACTIVE;

  const newEmp = await Employer.create({
    companyName: companyName.trim(),
    slug,
    email: cleanEmail,
    password: passwordHash,
    city: city || "ha-noi",
    address: (address || "").trim(),
    phone: (phone || "").trim(),
    companyModel: (companyModel || "").trim(),
    status: finalStatus,
    isEmailVerified: true,
    approvedAt: isApprovedNow ? new Date() : null,
    approvedBy: isApprovedNow ? req.admin._id : null,
  });

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.create",
    targetType: "Employer",
    targetId: newEmp._id,
    meta: {
      companyName: newEmp.companyName,
      email: newEmp.email,
      status: newEmp.status,
      isEmailVerified: true,
    },
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
  const employer = await Employer.findOne({ _id: req.params.id, deletedAt: null }).select(
    "+teamMembers.password"
  );
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng hoặc tài khoản đã bị xóa mềm.");
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
  res.redirect(getSafeBackRedirect(req, `/${adminPath}/employers/${employer._id}`));
};

const postBan = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    req.flash("error", "Vui lòng nhập lý do khóa tài khoản bắt buộc.");
    return res.redirect(getSafeBackRedirect(req, `/${adminPath}/employers`));
  }

  const employer = await Employer.findById(req.params.id);
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  const cleanReason = reason.trim();
  await Employer.updateOne(
    { _id: employer._id },
    {
      $set: { status: EMPLOYER_STATUS.BANNED, banReason: cleanReason },
      $inc: { tokenVersion: 1, "teamMembers.$[].tokenVersion": 1 },
    }
  );

  // Ẩn toàn bộ job của NTD này
  await Job.updateMany({ employerId: employer._id }, { employerActive: false });

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.ban",
    targetType: "Employer",
    targetId: employer._id,
    meta: { companyName: employer.companyName, reason: cleanReason },
    ip: req.ip,
  });

  clearStatsCache();
  clearMenuCache();

  req.flash("success", `Đã khóa tài khoản công ty ${employer.companyName}.`);
  res.redirect(getSafeBackRedirect(req, `/${adminPath}/employers/${employer._id}`));
};

const postUnban = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const employer = await Employer.findOne({ _id: req.params.id, deletedAt: null }).select(
    "+teamMembers.password"
  );
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng hoặc tài khoản đã bị xóa mềm.");
    return res.redirect(`/${adminPath}/employers`);
  }

  const shouldRestoreActive = employer.approvedAt != null || !env.EMPLOYER_REQUIRE_APPROVAL;
  employer.status = shouldRestoreActive ? EMPLOYER_STATUS.ACTIVE : EMPLOYER_STATUS.PENDING;
  employer.banReason = "";
  await employer.save();

  if (shouldRestoreActive) {
    await Job.updateMany({ employerId: employer._id, deletedAt: null }, { employerActive: true });
  } else {
    await Job.updateMany({ employerId: employer._id }, { employerActive: false });
  }

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.unban",
    targetType: "Employer",
    targetId: employer._id,
    meta: { companyName: employer.companyName, restoredStatus: employer.status },
    ip: req.ip,
  });

  clearStatsCache();
  clearMenuCache();

  req.flash(
    "success",
    shouldRestoreActive
      ? `Đã mở khóa tài khoản công ty ${employer.companyName}.`
      : `Đã mở khóa tài khoản công ty ${employer.companyName} (chuyển về trạng thái Chờ phê duyệt).`
  );
  res.redirect(getSafeBackRedirect(req, `/${adminPath}/employers/${employer._id}`));
};

const postResetPassword = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const employer = await Employer.findById(req.params.id);
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  const tempPassword = `Itj@${crypto.randomBytes(4).toString("hex")}`;
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await Employer.updateOne(
    { _id: employer._id },
    {
      $set: { password: passwordHash },
      $inc: { tokenVersion: 1, "teamMembers.$[].tokenVersion": 1 },
    }
  );

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
  res.redirect(getSafeBackRedirect(req, `/${adminPath}/employers/${employer._id}`));
};

const postSoftDelete = async (req, res) => {
  const adminPath = env.ADMIN_PATH || "admin";
  const employer = await Employer.findById(req.params.id);
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  await Employer.updateOne(
    { _id: employer._id },
    {
      $set: { deletedAt: new Date() },
      $inc: { tokenVersion: 1, "teamMembers.$[].tokenVersion": 1 },
    }
  );

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
  const employer = await Employer.findById(req.params.id).select("+teamMembers.password");
  if (!employer) {
    req.flash("error", "Không tìm thấy Nhà tuyển dụng.");
    return res.redirect(`/${adminPath}/employers`);
  }

  employer.deletedAt = null;
  if (employer.status === EMPLOYER_STATUS.BANNED) {
    const shouldRestoreActive = employer.approvedAt != null || !env.EMPLOYER_REQUIRE_APPROVAL;
    employer.status = shouldRestoreActive ? EMPLOYER_STATUS.ACTIVE : EMPLOYER_STATUS.PENDING;
  }
  await employer.save();

  if (employer.status === EMPLOYER_STATUS.ACTIVE) {
    await Job.updateMany({ employerId: employer._id, deletedAt: null }, { employerActive: true });
  } else {
    await Job.updateMany({ employerId: employer._id }, { employerActive: false });
  }

  await logAdminAction({
    adminId: req.admin._id,
    action: "employer.restore",
    targetType: "Employer",
    targetId: employer._id,
    meta: { companyName: employer.companyName, status: employer.status },
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

  // Dọn dẹp logo công ty
  if (employer.logo && employer.logo.key) {
    storageService.deleteFile(employer.logo.key, "logos");
  }

  // Dọn dẹp ảnh job & file CV vật lý trong các đơn ứng tuyển
  const employerJobs = await Job.find({ employerId: employer._id }).select("_id images").lean();
  const jobIds = employerJobs.map((j) => j._id);
  employerJobs.forEach((j) => {
    (j.images || []).forEach((img) => {
      if (img && img.key) {
        storageService.deleteFile(img.key, "jobs");
      }
    });
  });

  const appFilter = jobIds.length
    ? { $or: [{ employerId: employer._id }, { jobId: { $in: jobIds } }] }
    : { employerId: employer._id };
  const applications = await Application.find(appFilter).select("cv").lean();
  applications.forEach((appItem) => {
    if (appItem.cv && appItem.cv.key) {
      storageService.deleteCV(appItem.cv.key);
    }
  });

  const employerEmails = [
    employer.email,
    ...(employer.teamMembers || []).map((m) => m.email),
  ]
    .filter(Boolean)
    .map((e) => e.toLowerCase().trim());

  // Xóa cascade toàn bộ dữ liệu phụ liên quan
  await Promise.all([
    Application.deleteMany(appFilter),
    jobIds.length ? SavedJob.deleteMany({ jobId: { $in: jobIds } }) : Promise.resolve(),
    CompanyFollow.deleteMany({ employerId: employer._id }),
    Review.deleteMany({ $or: [{ employerId: employer._id }, { authorEmployerId: employer._id }] }),
    employerEmails.length ? JobAlert.deleteMany({ email: { $in: employerEmails } }) : Promise.resolve(),
    Notification.deleteMany({ recipientId: employer._id, recipientType: "employer" }),
    employerEmails.length
      ? Otp.deleteMany({ email: { $in: employerEmails }, userType: "employer" })
      : Promise.resolve(),
    Job.deleteMany({ employerId: employer._id }),
  ]);

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
  const rawIds = Array.isArray(ids) ? ids : [ids].filter(Boolean);
  const targetIds = rawIds.filter(isValidObjectId);

  if (!targetIds.length) {
    req.flash("error", "Vui lòng chọn ít nhất một Nhà tuyển dụng hợp lệ.");
    return res.redirect(`/${adminPath}/employers`);
  }

  if (action === "approve") {
    const pendingEmployers = await Employer.find({
      _id: { $in: targetIds },
      status: EMPLOYER_STATUS.PENDING,
      deletedAt: null,
    })
      .select("_id")
      .lean();
    const pendingIds = pendingEmployers.map((e) => e._id);

    if (pendingIds.length > 0) {
      await Employer.updateMany(
        { _id: { $in: pendingIds }, status: EMPLOYER_STATUS.PENDING, deletedAt: null },
        {
          $set: {
            status: EMPLOYER_STATUS.ACTIVE,
            approvedAt: new Date(),
            approvedBy: req.admin._id,
          },
        }
      );
      await Job.updateMany(
        { employerId: { $in: pendingIds }, deletedAt: null },
        { $set: { employerActive: true } }
      );
    }

    await logAdminAction({
      adminId: req.admin._id,
      action: "employer.bulkApprove",
      targetType: "Employer",
      targetId: "bulk",
      meta: { count: pendingIds.length, ids: pendingIds, requestedIds: targetIds },
      ip: req.ip,
    });
    req.flash("success", `Đã phê duyệt hàng loạt ${pendingIds.length} Nhà tuyển dụng chờ duyệt.`);
  } else if (action === "ban") {
    const reason = req.body.reason || "Khóa hàng loạt bởi Quản trị viên";
    await Employer.updateMany(
      { _id: { $in: targetIds } },
      {
        $set: { status: EMPLOYER_STATUS.BANNED, banReason: reason },
        $inc: { tokenVersion: 1, "teamMembers.$[].tokenVersion": 1 },
      }
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
    return res.redirect(getSafeBackRedirect(req, `/${adminPath}/employers`));
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
  res.redirect(getSafeBackRedirect(req, `/${adminPath}/employers/${job.employerId}`));
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
