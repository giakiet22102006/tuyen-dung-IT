// src/config/constants.js
// Nguồn duy nhất cho các enum và nhãn tiếng Việt trong toàn bộ ứng dụng

const CITIES = [
  { value: "ha-noi", label: "Hà Nội" },
  { value: "da-nang", label: "Đà Nẵng" },
  { value: "ho-chi-minh", label: "TP. Hồ Chí Minh" },
  { value: "khac", label: "Khác" },
];

const POSITIONS = [
  { value: "intern", label: "Intern" },
  { value: "fresher", label: "Fresher" },
  { value: "junior", label: "Junior" },
  { value: "middle", label: "Middle" },
  { value: "senior", label: "Senior" },
  { value: "manager", label: "Manager" },
];

const WORKING_FORMS = [
  { value: "office", label: "Tại văn phòng" },
  { value: "remote", label: "Từ xa" },
  { value: "flexible", label: "Linh hoạt" },
];

const CANDIDATE_STATUS = {
  ACTIVE: "active",
  BANNED: "banned",
};

const CANDIDATE_STATUS_LABELS = {
  active: "Hoạt động",
  banned: "Đã bị khóa",
};

const EMPLOYER_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  BANNED: "banned",
};

const EMPLOYER_STATUS_LABELS = {
  pending: "Chờ duyệt",
  active: "Hoạt động",
  banned: "Đã bị khóa",
};

const ADMIN_ROLES = {
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
};

const ADMIN_ROLE_LABELS = {
  superadmin: "Super Admin",
  admin: "Admin",
};

const ADMIN_STATUS = {
  ACTIVE: "active",
  BANNED: "banned",
};

const JOB_MODERATION = {
  VISIBLE: "visible",
  HIDDEN: "hidden",
};

const JOB_MODERATION_LABELS = {
  visible: "Hiển thị",
  hidden: "Đã ẩn",
};

const APPLICATION_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

const APPLICATION_STATUS_LABELS = {
  pending: "Chưa duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

// Đãi ngộ đặc thù IT chuẩn ITviec
const BENEFITS = [
  { value: "macbook", label: "Cấp MacBook Pro / Laptop xịn", shortLabel: "MacBook", icon: "fa-solid fa-laptop-code" },
  { value: "salary13", label: "Lương tháng 13 & Thưởng dự án", shortLabel: "Lương T13", icon: "fa-solid fa-sack-dollar" },
  { value: "hybrid", label: "Làm việc Hybrid / Remote linh hoạt", shortLabel: "Hybrid/Remote", icon: "fa-solid fa-house-laptop" },
  { value: "insurance", label: "Bảo hiểm sức khỏe cao cấp", shortLabel: "BH Cao Cấp", icon: "fa-solid fa-shield-heart" },
  { value: "paid_ot", label: "OT có trả lương đầy đủ", shortLabel: "OT có lương", icon: "fa-solid fa-business-time" },
  { value: "training", label: "Tài trợ học & thi chứng chỉ quốc tế", shortLabel: "Đào tạo", icon: "fa-solid fa-graduation-cap" },
  { value: "annual_leave", label: "15+ ngày phép hàng năm", shortLabel: "15+ phép", icon: "fa-solid fa-umbrella-beach" },
];

module.exports = {
  CITIES,
  POSITIONS,
  WORKING_FORMS,
  BENEFITS,
  CANDIDATE_STATUS,
  CANDIDATE_STATUS_LABELS,
  EMPLOYER_STATUS,
  EMPLOYER_STATUS_LABELS,
  ADMIN_ROLES,
  ADMIN_ROLE_LABELS,
  ADMIN_STATUS,
  JOB_MODERATION,
  JOB_MODERATION_LABELS,
  APPLICATION_STATUS,
  APPLICATION_STATUS_LABELS,
};
