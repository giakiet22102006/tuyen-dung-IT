// src/models/index.js
const Candidate = require("./candidate.model");
const Employer = require("./employer.model");
const Admin = require("./admin.model");
const Job = require("./job.model");
const Skill = require("./skill.model");
const Application = require("./application.model");
const AuditLog = require("./auditLog.model");
const Otp = require("./otp.model");
const Review = require("./review.model");
const Feedback = require("./feedback.model");
const SavedJob = require("./savedJob.model");
const JobAlert = require("./jobAlert.model");
const CompanyFollow = require("./companyFollow.model");
const Notification = require("./notification.model");
const { Setting } = require("./setting.model");
const {
  Article,
  ARTICLE_CATEGORIES,
  ARTICLE_CATEGORY_LABELS,
  TARGET_AUDIENCES,
  TARGET_AUDIENCE_LABELS,
} = require("./article.model");

module.exports = {
  Candidate,
  Employer,
  Admin,
  Job,
  Skill,
  Application,
  AuditLog,
  Otp,
  Review,
  Feedback,
  SavedJob,
  JobAlert,
  CompanyFollow,
  Notification,
  Setting,
  Article,
  ARTICLE_CATEGORIES,
  ARTICLE_CATEGORY_LABELS,
  TARGET_AUDIENCES,
  TARGET_AUDIENCE_LABELS,
};
