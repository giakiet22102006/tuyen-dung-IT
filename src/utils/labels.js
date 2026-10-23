// src/utils/labels.js
const {
  CITIES,
  POSITIONS,
  WORKING_FORMS,
  BENEFITS,
  CANDIDATE_STATUS_LABELS,
  EMPLOYER_STATUS_LABELS,
  ADMIN_ROLE_LABELS,
  JOB_MODERATION_LABELS,
  APPLICATION_STATUS_LABELS,
} = require("../config/constants");

const getCityLabel = (val) => {
  const found = CITIES.find((c) => c.value === val);
  return found ? found.label : val || "Khác";
};

const getPositionLabel = (val) => {
  const found = POSITIONS.find((p) => p.value === val);
  return found ? found.label : val || "";
};

const getWorkingFormLabel = (val) => {
  const found = WORKING_FORMS.find((w) => w.value === val);
  return found ? found.label : val || "";
};

const getBenefitLabel = (val) => {
  const found = BENEFITS.find((b) => b.value === val);
  return found ? found.label : val || "";
};

const getBenefitShortLabel = (val) => {
  const found = BENEFITS.find((b) => b.value === val);
  return found ? (found.shortLabel || found.label) : val || "";
};

const getBenefitIcon = (val) => {
  const found = BENEFITS.find((b) => b.value === val);
  return found ? found.icon : "fa-solid fa-gift";
};

const getCandidateStatusLabel = (val) => CANDIDATE_STATUS_LABELS[val] || val || "";
const getEmployerStatusLabel = (val) => EMPLOYER_STATUS_LABELS[val] || val || "";
const getAdminRoleLabel = (val) => ADMIN_ROLE_LABELS[val] || val || "";
const getJobModerationLabel = (val) => JOB_MODERATION_LABELS[val] || val || "";
const getApplicationStatusLabel = (val) => APPLICATION_STATUS_LABELS[val] || val || "";

module.exports = {
  CITIES,
  POSITIONS,
  WORKING_FORMS,
  BENEFITS,
  getCityLabel,
  getPositionLabel,
  getWorkingFormLabel,
  getBenefitLabel,
  getBenefitShortLabel,
  getBenefitIcon,
  getCandidateStatusLabel,
  getEmployerStatusLabel,
  getAdminRoleLabel,
  getJobModerationLabel,
  getApplicationStatusLabel,
};
