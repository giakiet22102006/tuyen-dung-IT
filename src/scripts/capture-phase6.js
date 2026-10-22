const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const app = require("../app");
const { connectDB, closeDB } = require("../config/db");
const { Admin, Employer, Candidate, Job, Application, AuditLog } = require("../models");
const { ADMIN_ROLES, ADMIN_STATUS, EMPLOYER_STATUS, CANDIDATE_STATUS, JOB_MODERATION } = require("../config/constants");
const env = require("../config/env");

const adminPath = env.ADMIN_PATH || "admin";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = "C:\\Users\\admin\\.gemini\\antigravity\\brain\\587c674b-6bae-410c-ab63-c8b566f65996\\screenshots\\phase6";
const tempUserDataDir = path.join(process.env.TEMP || "C:\\Temp", "chrome_phase6_profile");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout, stderr });
    });
  });
}

async function capture() {
  await connectDB();

  // Đảm bảo có Superadmin
  let admin = await Admin.findOne({});
  if (!admin) {
    const hash = await bcrypt.hash("AdminPass123", 10);
    admin = await Admin.create({
      fullName: "Super Administrator",
      email: "superadmin@admin.vn",
      password: hash,
      role: ADMIN_ROLES.SUPERADMIN,
      status: ADMIN_STATUS.ACTIVE,
    });
  }

  // Đảm bảo có NTD và NTD chờ duyệt
  let emp = await Employer.findOne({ status: EMPLOYER_STATUS.ACTIVE });
  if (!emp) {
    emp = await Employer.create({
      companyName: "LG CNS Việt Nam",
      slug: "lg-cns-viet-nam",
      email: "lgcns@gmail.com",
      password: "Password123",
      city: "ha-noi",
      address: "Tầng 15, tòa Keangnam Landmark 72, Mễ Trì, Nam Từ Liêm, Hà Nội",
      status: EMPLOYER_STATUS.ACTIVE,
    });
  }

  let pendingEmp = await Employer.findOne({ status: EMPLOYER_STATUS.PENDING });
  if (!pendingEmp) {
    pendingEmp = await Employer.create({
      companyName: "Công ty Khởi nghiệp NextTech",
      slug: "cong-ty-khoi-nghiep-nexttech",
      email: "contact@nexttech.vn",
      password: "Password123",
      city: "ho-chi-minh",
      status: EMPLOYER_STATUS.PENDING,
    });
  }

  // Đảm bảo có Candidate
  let cand = await Candidate.findOne({});
  if (!cand) {
    cand = await Candidate.create({
      fullName: "Nguyễn Văn An",
      email: "nguyenvanan@gmail.com",
      password: "Password123",
      phone: "0988776655",
      status: CANDIDATE_STATUS.ACTIVE,
    });
  }

  // Đảm bảo có AuditLog mẫu
  let log = await AuditLog.findOne({});
  if (!log) {
    await AuditLog.create({
      adminId: admin._id,
      action: "employer.approve",
      targetType: "Employer",
      targetId: String(emp._id),
      meta: { companyName: emp.companyName },
    });
    await AuditLog.create({
      adminId: admin._id,
      action: "candidate.update",
      targetType: "Candidate",
      targetId: String(cand._id),
      meta: { fullName: cand.fullName },
    });
  }

  const pages = [
    { name: "admin-login", path: `/${adminPath}/login` },
    { name: "admin-dashboard", path: `/_dev/login-admin?to=/${adminPath}` },
    { name: "admin-employers", path: `/_dev/login-admin?to=/${adminPath}/employers` },
    { name: "admin-employer-detail", path: `/_dev/login-admin?to=/${adminPath}/employers/${emp._id}` },
    { name: "admin-candidates", path: `/_dev/login-admin?to=/${adminPath}/candidates` },
    { name: "admin-logs", path: `/_dev/login-admin?to=/${adminPath}/logs` },
  ];

  const port = 3003;
  const server = app.listen(port, async () => {
    console.log(`Server chạy tại port ${port} để chụp Phase 6 (Admin)...`);

    try {
      for (const page of pages) {
        const url = `http://localhost:${port}${page.path}`;

        // Desktop (1280px)
        const desktopFile = path.join(outputDir, `${page.name}-desktop-1280.png`);
        const desktopCmd = `"${chromePath}" --headless --disable-gpu --user-data-dir="${tempUserDataDir}" --window-size=1280,900 --screenshot="${desktopFile}" "${url}"`;
        await runCmd(desktopCmd);
        console.log(`✅ Desktop (1280px): ${page.name}`);

        // Mobile (375px)
        const mobileFile = path.join(outputDir, `${page.name}-mobile-375.png`);
        const mobileCmd = `"${chromePath}" --headless --disable-gpu --user-data-dir="${tempUserDataDir}" --window-size=375,812 --screenshot="${mobileFile}" "${url}"`;
        await runCmd(mobileCmd);
        console.log(`✅ Mobile (375px): ${page.name}`);
      }

      console.log("\n🎉 Đã chụp toàn bộ screenshots Phase 6 thành công!");
    } catch (err) {
      console.error("Lỗi khi chụp:", err);
    } finally {
      server.close(async () => {
        await closeDB();
        process.exit(0);
      });
    }
  });
}

capture();
