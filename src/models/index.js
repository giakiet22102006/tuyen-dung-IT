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
};
