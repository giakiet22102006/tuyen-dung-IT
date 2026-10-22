// src/utils/labels.js
const {
  CITIES,
  POSITIONS,
  WORKING_FORMS,
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

const getCandidateStatusLabel = (val) => CANDIDATE_STATUS_LABELS[val] || val || "";
const getEmployerStatusLabel = (val) => EMPLOYER_STATUS_LABELS[val] || val || "";
const getAdminRoleLabel = (val) => ADMIN_ROLE_LABELS[val] || val || "";
const getJobModerationLabel = (val) => JOB_MODERATION_LABELS[val] || val || "";
const getApplicationStatusLabel = (val) => APPLICATION_STATUS_LABELS[val] || val || "";

module.exports = {
  getCityLabel,
  getPositionLabel,
  getWorkingFormLabel,
  getCandidateStatusLabel,
  getEmployerStatusLabel,
  getAdminRoleLabel,
  getJobModerationLabel,
  getApplicationStatusLabel,
};
