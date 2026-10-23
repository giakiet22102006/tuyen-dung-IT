// src/scripts/export-sql.js
const fs = require("fs");
const path = require("path");
const { connectDB, closeDB } = require("../config/db");
const {
  Admin,
  Candidate,
  Employer,
  Skill,
  Job,
  Application,
  Otp,
  AuditLog,
  SavedJob,
} = require("../models");

function escapeSql(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return val;
  if (val instanceof Date) {
    return `'${val.toISOString().slice(0, 19).replace("T", " ")}'`;
  }
  const str = String(val).replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, (char) => {
    switch (char) {
      case "\0":
        return "\\0";
      case "\x08":
        return "\\b";
      case "\x09":
        return "\\t";
      case "\x1a":
        return "\\z";
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case '"':
      case "'":
      case "\\":
      case "%":
        return "\\" + char;
      default:
        return char;
    }
  });
  return `'${str}'`;
}

async function exportToSql() {
  await connectDB();
  console.log("🚀 Bắt đầu đọc dữ liệu từ MongoDB và chuyển đổi sang định dạng SQL...\n");

  let sql = "";
  sql += `-- ==================================================================\n`;
  sql += `-- HỆ THỐNG TUYỂN DỤNG IT - VN.ITJOBS\n`;
  sql += `-- Script Cơ Sở Dữ Liệu SQL (Exported from MongoDB Atlas)\n`;
  sql += `-- Ngày tạo: ${new Date().toLocaleString("vi-VN")}\n`;
  sql += `-- Tương thích: MySQL 8.x / MariaDB / PostgreSQL / SQLite\n`;
  sql += `-- ==================================================================\n\n`;

  sql += `CREATE DATABASE IF NOT EXISTS \`vn_itjobs\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`;
  sql += `USE \`vn_itjobs\`;\n\n`;

  sql += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

  // 1. Table Admins
  console.log("👉 Đang xuất bảng 'admins'...");
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `-- Table: admins (Quản trị viên hệ thống)\n`;
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `DROP TABLE IF EXISTS \`admins\`;\n`;
  sql += `CREATE TABLE \`admins\` (\n`;
  sql += `  \`id\` VARCHAR(50) NOT NULL PRIMARY KEY,\n`;
  sql += `  \`full_name\` VARCHAR(255) NOT NULL,\n`;
  sql += `  \`email\` VARCHAR(255) NOT NULL UNIQUE,\n`;
  sql += `  \`password\` VARCHAR(255) NOT NULL,\n`;
  sql += `  \`role\` ENUM('admin', 'superadmin') DEFAULT 'admin',\n`;
  sql += `  \`status\` ENUM('active', 'inactive') DEFAULT 'active',\n`;
  sql += `  \`token_version\` INT DEFAULT 0,\n`;
  sql += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP\n`;
  sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n`;

  const admins = await Admin.find({}).lean();
  if (admins.length > 0) {
    sql += `INSERT INTO \`admins\` (\`id\`, \`full_name\`, \`email\`, \`password\`, \`role\`, \`status\`, \`token_version\`, \`created_at\`, \`updated_at\`) VALUES\n`;
    const adminValues = admins.map(
      (a) =>
        `(${escapeSql(a._id.toString())}, ${escapeSql(a.fullName)}, ${escapeSql(a.email)}, ${escapeSql(a.password)}, ${escapeSql(a.role)}, ${escapeSql(a.status)}, ${escapeSql(a.tokenVersion || 0)}, ${escapeSql(a.createdAt)}, ${escapeSql(a.updatedAt)})`
    );
    sql += adminValues.join(",\n") + ";\n\n";
  }

  // 2. Table Skills
  console.log("👉 Đang xuất bảng 'skills'...");
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `-- Table: skills (Danh mục Kỹ năng IT)\n`;
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `DROP TABLE IF EXISTS \`skills\`;\n`;
  sql += `CREATE TABLE \`skills\` (\n`;
  sql += `  \`id\` VARCHAR(50) NOT NULL PRIMARY KEY,\n`;
  sql += `  \`name\` VARCHAR(100) NOT NULL,\n`;
  sql += `  \`slug\` VARCHAR(100) NOT NULL UNIQUE,\n`;
  sql += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP\n`;
  sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n`;

  const skills = await Skill.find({}).lean();
  if (skills.length > 0) {
    sql += `INSERT INTO \`skills\` (\`id\`, \`name\`, \`slug\`, \`created_at\`, \`updated_at\`) VALUES\n`;
    const skillValues = skills.map(
      (s) =>
        `(${escapeSql(s._id.toString())}, ${escapeSql(s.name)}, ${escapeSql(s.slug)}, ${escapeSql(s.createdAt)}, ${escapeSql(s.updatedAt)})`
    );
    sql += skillValues.join(",\n") + ";\n\n";
  }

  // 3. Table Candidates
  console.log("👉 Đang xuất bảng 'candidates'...");
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `-- Table: candidates (Ứng viên)\n`;
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `DROP TABLE IF EXISTS \`candidates\`;\n`;
  sql += `CREATE TABLE \`candidates\` (\n`;
  sql += `  \`id\` VARCHAR(50) NOT NULL PRIMARY KEY,\n`;
  sql += `  \`full_name\` VARCHAR(255) NOT NULL,\n`;
  sql += `  \`email\` VARCHAR(255) NOT NULL UNIQUE,\n`;
  sql += `  \`password\` VARCHAR(255) NOT NULL,\n`;
  sql += `  \`phone\` VARCHAR(30) DEFAULT NULL,\n`;
  sql += `  \`status\` ENUM('active', 'inactive') DEFAULT 'active',\n`;
  sql += `  \`is_email_verified\` BOOLEAN DEFAULT FALSE,\n`;
  sql += `  \`token_version\` INT DEFAULT 0,\n`;
  sql += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP\n`;
  sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n`;

  const candidates = await Candidate.find({}).lean();
  if (candidates.length > 0) {
    sql += `INSERT INTO \`candidates\` (\`id\`, \`full_name\`, \`email\`, \`password\`, \`phone\`, \`status\`, \`is_email_verified\`, \`token_version\`, \`created_at\`, \`updated_at\`) VALUES\n`;
    const candValues = candidates.map(
      (c) =>
        `(${escapeSql(c._id.toString())}, ${escapeSql(c.fullName)}, ${escapeSql(c.email)}, ${escapeSql(c.password)}, ${escapeSql(c.phone)}, ${escapeSql(c.status)}, ${escapeSql(c.isEmailVerified)}, ${escapeSql(c.tokenVersion || 0)}, ${escapeSql(c.createdAt)}, ${escapeSql(c.updatedAt)})`
    );
    sql += candValues.join(",\n") + ";\n\n";
  }

  // 4. Table Employers
  console.log("👉 Đang xuất bảng 'employers'...");
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `-- Table: employers (Nhà tuyển dụng / Doanh nghiệp)\n`;
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `DROP TABLE IF EXISTS \`employers\`;\n`;
  sql += `CREATE TABLE \`employers\` (\n`;
  sql += `  \`id\` VARCHAR(50) NOT NULL PRIMARY KEY,\n`;
  sql += `  \`company_name\` VARCHAR(255) NOT NULL,\n`;
  sql += `  \`slug\` VARCHAR(255) NOT NULL UNIQUE,\n`;
  sql += `  \`email\` VARCHAR(255) NOT NULL UNIQUE,\n`;
  sql += `  \`password\` VARCHAR(255) NOT NULL,\n`;
  sql += `  \`city\` VARCHAR(100) DEFAULT NULL,\n`;
  sql += `  \`address\` VARCHAR(500) DEFAULT NULL,\n`;
  sql += `  \`logo_url\` VARCHAR(500) DEFAULT NULL,\n`;
  sql += `  \`description\` LONGTEXT DEFAULT NULL,\n`;
  sql += `  \`status\` ENUM('active', 'pending', 'inactive') DEFAULT 'pending',\n`;
  sql += `  \`is_email_verified\` BOOLEAN DEFAULT FALSE,\n`;
  sql += `  \`token_version\` INT DEFAULT 0,\n`;
  sql += `  \`approved_at\` TIMESTAMP NULL DEFAULT NULL,\n`;
  sql += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP\n`;
  sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n`;

  const employers = await Employer.find({}).lean();
  if (employers.length > 0) {
    sql += `INSERT INTO \`employers\` (\`id\`, \`company_name\`, \`slug\`, \`email\`, \`password\`, \`city\`, \`address\`, \`logo_url\`, \`description\`, \`status\`, \`is_email_verified\`, \`token_version\`, \`approved_at\`, \`created_at\`, \`updated_at\`) VALUES\n`;
    const empValues = employers.map((e) => {
      const logoUrl = e.logo ? (typeof e.logo === "string" ? e.logo : e.logo.url) : null;
      return `(${escapeSql(e._id.toString())}, ${escapeSql(e.companyName)}, ${escapeSql(e.slug)}, ${escapeSql(e.email)}, ${escapeSql(e.password)}, ${escapeSql(e.city)}, ${escapeSql(e.address)}, ${escapeSql(logoUrl)}, ${escapeSql(e.description)}, ${escapeSql(e.status)}, ${escapeSql(e.isEmailVerified)}, ${escapeSql(e.tokenVersion || 0)}, ${escapeSql(e.approvedAt)}, ${escapeSql(e.createdAt)}, ${escapeSql(e.updatedAt)})`;
    });
    sql += empValues.join(",\n") + ";\n\n";
  }

  // 5. Table Jobs
  console.log("👉 Đang xuất bảng 'jobs'...");
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `-- Table: jobs (Tin tuyển dụng việc làm IT)\n`;
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `DROP TABLE IF EXISTS \`jobs\`;\n`;
  sql += `CREATE TABLE \`jobs\` (\n`;
  sql += `  \`id\` VARCHAR(50) NOT NULL PRIMARY KEY,\n`;
  sql += `  \`employer_id\` VARCHAR(50) NOT NULL,\n`;
  sql += `  \`title\` VARCHAR(255) NOT NULL,\n`;
  sql += `  \`slug\` VARCHAR(255) NOT NULL UNIQUE,\n`;
  sql += `  \`salary_min\` INT DEFAULT NULL,\n`;
  sql += `  \`salary_max\` INT DEFAULT NULL,\n`;
  sql += `  \`position\` VARCHAR(50) NOT NULL,\n`;
  sql += `  \`working_form\` VARCHAR(50) NOT NULL,\n`;
  sql += `  \`city\` VARCHAR(100) NOT NULL,\n`;
  sql += `  \`address\` VARCHAR(500) DEFAULT NULL,\n`;
  sql += `  \`description\` LONGTEXT DEFAULT NULL,\n`;
  sql += `  \`employer_active\` BOOLEAN DEFAULT TRUE,\n`;
  sql += `  \`moderation\` ENUM('visible', 'hidden') DEFAULT 'visible',\n`;
  sql += `  \`deleted_at\` TIMESTAMP NULL DEFAULT NULL,\n`;
  sql += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n`;
  sql += `  FOREIGN KEY (\`employer_id\`) REFERENCES \`employers\` (\`id\`) ON DELETE CASCADE\n`;
  sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n`;

  // 6. Table Job_Skills (Quan hệ N-N giữa Jobs và Skills)
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `-- Table: job_skills (Bảng trung gian N-N giữa Jobs và Skills)\n`;
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `DROP TABLE IF EXISTS \`job_skills\`;\n`;
  sql += `CREATE TABLE \`job_skills\` (\n`;
  sql += `  \`job_id\` VARCHAR(50) NOT NULL,\n`;
  sql += `  \`skill_name\` VARCHAR(100) NOT NULL,\n`;
  sql += `  \`skill_slug\` VARCHAR(100) NOT NULL,\n`;
  sql += `  PRIMARY KEY (\`job_id\`, \`skill_slug\`),\n`;
  sql += `  FOREIGN KEY (\`job_id\`) REFERENCES \`jobs\` (\`id\`) ON DELETE CASCADE\n`;
  sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n`;

  const jobs = await Job.find({}).lean();
  const jobSkillRows = [];

  if (jobs.length > 0) {
    sql += `INSERT INTO \`jobs\` (\`id\`, \`employer_id\`, \`title\`, \`slug\`, \`salary_min\`, \`salary_max\`, \`position\`, \`working_form\`, \`city\`, \`address\`, \`description\`, \`employer_active\`, \`moderation\`, \`deleted_at\`, \`created_at\`, \`updated_at\`) VALUES\n`;
    const jobValues = jobs.map((j) => {
      if (Array.isArray(j.skills)) {
        j.skills.forEach((sk) => {
          jobSkillRows.push(`(${escapeSql(j._id.toString())}, ${escapeSql(sk.name)}, ${escapeSql(sk.slug)})`);
        });
      }
      return `(${escapeSql(j._id.toString())}, ${escapeSql(j.employerId.toString())}, ${escapeSql(j.title)}, ${escapeSql(j.slug)}, ${escapeSql(j.salaryMin)}, ${escapeSql(j.salaryMax)}, ${escapeSql(j.position)}, ${escapeSql(j.workingForm)}, ${escapeSql(j.city)}, ${escapeSql(j.address)}, ${escapeSql(j.description)}, ${escapeSql(j.employerActive)}, ${escapeSql(j.moderation)}, ${escapeSql(j.deletedAt)}, ${escapeSql(j.createdAt)}, ${escapeSql(j.updatedAt)})`;
    });
    sql += jobValues.join(",\n") + ";\n\n";

    if (jobSkillRows.length > 0) {
      sql += `INSERT INTO \`job_skills\` (\`job_id\`, \`skill_name\`, \`skill_slug\`) VALUES\n`;
      sql += jobSkillRows.join(",\n") + ";\n\n";
    }
  }

  // 7. Table Applications
  console.log("👉 Đang xuất bảng 'applications'...");
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `-- Table: applications (Hồ sơ đơn nộp CV ứng tuyển)\n`;
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `DROP TABLE IF EXISTS \`applications\`;\n`;
  sql += `CREATE TABLE \`applications\` (\n`;
  sql += `  \`id\` VARCHAR(50) NOT NULL PRIMARY KEY,\n`;
  sql += `  \`job_id\` VARCHAR(50) NOT NULL,\n`;
  sql += `  \`employer_id\` VARCHAR(50) NOT NULL,\n`;
  sql += `  \`candidate_id\` VARCHAR(50) NOT NULL,\n`;
  sql += `  \`full_name\` VARCHAR(255) NOT NULL,\n`;
  sql += `  \`email\` VARCHAR(255) NOT NULL,\n`;
  sql += `  \`phone\` VARCHAR(30) NOT NULL,\n`;
  sql += `  \`cv_file_key\` VARCHAR(255) DEFAULT NULL,\n`;
  sql += `  \`cv_original_name\` VARCHAR(255) DEFAULT NULL,\n`;
  sql += `  \`status\` ENUM('pending', 'reviewed', 'interviewed', 'accepted', 'rejected') DEFAULT 'pending',\n`;
  sql += `  \`rejection_reason\` VARCHAR(255) DEFAULT NULL,\n`;
  sql += `  \`rejection_note\` TEXT DEFAULT NULL,\n`;
  sql += `  \`viewed\` BOOLEAN DEFAULT FALSE,\n`;
  sql += `  \`hidden_by_candidate\` BOOLEAN DEFAULT FALSE,\n`;
  sql += `  \`hidden_by_employer\` BOOLEAN DEFAULT FALSE,\n`;
  sql += `  \`reviewed_at\` TIMESTAMP NULL DEFAULT NULL,\n`;
  sql += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n`;
  sql += `  UNIQUE KEY \`uniq_job_candidate\` (\`job_id\`, \`candidate_id\`),\n`;
  sql += `  FOREIGN KEY (\`job_id\`) REFERENCES \`jobs\` (\`id\`) ON DELETE CASCADE,\n`;
  sql += `  FOREIGN KEY (\`employer_id\`) REFERENCES \`employers\` (\`id\`) ON DELETE CASCADE,\n`;
  sql += `  FOREIGN KEY (\`candidate_id\`) REFERENCES \`candidates\` (\`id\`) ON DELETE CASCADE\n`;
  sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n`;

  const applications = await Application.find({}).lean();
  if (applications.length > 0) {
    sql += `INSERT INTO \`applications\` (\`id\`, \`job_id\`, \`employer_id\`, \`candidate_id\`, \`full_name\`, \`email\`, \`phone\`, \`cv_file_key\`, \`cv_original_name\`, \`status\`, \`rejection_reason\`, \`rejection_note\`, \`viewed\`, \`hidden_by_candidate\`, \`hidden_by_employer\`, \`reviewed_at\`, \`created_at\`, \`updated_at\`) VALUES\n`;
    const appValues = applications.map((a) => {
      const fileKey = a.cv ? a.cv.key : null;
      const originalName = a.cv ? a.cv.originalName : null;
      return `(${escapeSql(a._id.toString())}, ${escapeSql(a.jobId.toString())}, ${escapeSql(a.employerId.toString())}, ${escapeSql(a.candidateId.toString())}, ${escapeSql(a.fullName)}, ${escapeSql(a.email)}, ${escapeSql(a.phone)}, ${escapeSql(fileKey)}, ${escapeSql(originalName)}, ${escapeSql(a.status)}, ${escapeSql(a.rejectionReason || null)}, ${escapeSql(a.rejectionNote || null)}, ${escapeSql(a.viewed)}, ${escapeSql(a.hiddenByCandidate)}, ${escapeSql(a.hiddenByEmployer)}, ${escapeSql(a.reviewedAt)}, ${escapeSql(a.createdAt)}, ${escapeSql(a.updatedAt)})`;
    });
    sql += appValues.join(",\n") + ";\n\n";
  }

  // 7b. Table Saved_Jobs (Việc làm đã lưu của ứng viên)
  console.log("👉 Đang xuất bảng 'saved_jobs'...");
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `-- Table: saved_jobs (Việc làm đã lưu của ứng viên)\n`;
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `DROP TABLE IF EXISTS \`saved_jobs\`;\n`;
  sql += `CREATE TABLE \`saved_jobs\` (\n`;
  sql += `  \`id\` VARCHAR(50) NOT NULL PRIMARY KEY,\n`;
  sql += `  \`candidate_id\` VARCHAR(50) NOT NULL,\n`;
  sql += `  \`job_id\` VARCHAR(50) NOT NULL,\n`;
  sql += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n`;
  sql += `  UNIQUE KEY \`uniq_saved_candidate_job\` (\`candidate_id\`, \`job_id\`),\n`;
  sql += `  FOREIGN KEY (\`candidate_id\`) REFERENCES \`candidates\` (\`id\`) ON DELETE CASCADE,\n`;
  sql += `  FOREIGN KEY (\`job_id\`) REFERENCES \`jobs\` (\`id\`) ON DELETE CASCADE\n`;
  sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n`;

  const savedJobs = await SavedJob.find({}).lean();
  if (savedJobs.length > 0) {
    sql += `INSERT INTO \`saved_jobs\` (\`id\`, \`candidate_id\`, \`job_id\`, \`created_at\`, \`updated_at\`) VALUES\n`;
    const savedValues = savedJobs.map((s) => `(${escapeSql(s._id.toString())}, ${escapeSql(s.candidateId.toString())}, ${escapeSql(s.jobId.toString())}, ${escapeSql(s.createdAt)}, ${escapeSql(s.updatedAt)})`);
    sql += savedValues.join(",\n") + ";\n\n";
  }

  // 8. Table Audit Logs
  console.log("👉 Đang xuất bảng 'audit_logs'...");
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `-- Table: audit_logs (Nhật ký kiểm toán hệ thống)\n`;
  sql += `-- ------------------------------------------------------------------\n`;
  sql += `DROP TABLE IF EXISTS \`audit_logs\`;\n`;
  sql += `CREATE TABLE \`audit_logs\` (\n`;
  sql += `  \`id\` VARCHAR(50) NOT NULL PRIMARY KEY,\n`;
  sql += `  \`admin_id\` VARCHAR(50) DEFAULT NULL,\n`;
  sql += `  \`action\` VARCHAR(100) NOT NULL,\n`;
  sql += `  \`target_type\` VARCHAR(100) DEFAULT NULL,\n`;
  sql += `  \`target_id\` VARCHAR(50) DEFAULT NULL,\n`;
  sql += `  \`ip\` VARCHAR(50) DEFAULT NULL,\n`;
  sql += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n`;
  sql += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n`;

  const logs = await AuditLog.find({}).lean();
  if (logs.length > 0) {
    sql += `INSERT INTO \`audit_logs\` (\`id\`, \`admin_id\`, \`action\`, \`target_type\`, \`target_id\`, \`ip\`, \`created_at\`) VALUES\n`;
    const logValues = logs.map(
      (l) =>
        `(${escapeSql(l._id.toString())}, ${escapeSql(l.adminId ? l.adminId.toString() : null)}, ${escapeSql(l.action)}, ${escapeSql(l.targetType)}, ${escapeSql(l.targetId ? l.targetId.toString() : null)}, ${escapeSql(l.ip)}, ${escapeSql(l.createdAt)})`
    );
    sql += logValues.join(",\n") + ";\n\n";
  }

  sql += `SET FOREIGN_KEY_CHECKS = 1;\n`;
  sql += `-- ==================================================================\n`;
  sql += `-- KẾT THÚC FILE SQL\n`;
  sql += `-- ==================================================================\n`;

  const outPath = path.join(__dirname, "../../tuyen_dung_it.sql");
  fs.writeFileSync(outPath, sql, "utf8");

  console.log("\n==================================================");
  console.log(`✅ ĐÃ XUẤT THÀNH CÔNG FILE SQL HOÀN CHỈNH:`);
  console.log(`   📂 File: ${outPath}`);
  console.log(`   📊 Kích thước: ${(fs.statSync(outPath).size / 1024).toFixed(2)} KB`);
  console.log(`   📋 Số bảng: 7 bảng (admins, skills, candidates, employers, jobs, job_skills, applications, audit_logs)`);
  console.log("==================================================\n");

  await closeDB();
  process.exit(0);
}

exportToSql().catch(async (err) => {
  console.error("❌ Lỗi khi xuất SQL:", err);
  await closeDB();
  process.exit(1);
});
