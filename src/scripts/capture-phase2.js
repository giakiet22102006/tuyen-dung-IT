const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const app = require("../app");
const { connectDB, closeDB } = require("../config/db");
const { Candidate, Employer, Skill } = require("../models");
const { hashPassword } = require("../services/auth.service");
const { EMPLOYER_STATUS, CANDIDATE_STATUS } = require("../config/constants");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = "C:\\Users\\admin\\.gemini\\antigravity\\brain\\587c674b-6bae-410c-ab63-c8b566f65996\\screenshots\\phase2";
const tempUserDataDir = path.join(process.env.TEMP || "C:\\Temp", "chrome_phase2_profile");

function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout, stderr });
    });
  });
}

async function captureAll() {
  await connectDB();

  const defaultPass = await hashPassword("Password123");
  let candidate = await Candidate.findOne({});
  if (!candidate) {
    candidate = await Candidate.create({
      fullName: "Lê Văn A",
      email: "le.vana@gmail.com",
      password: defaultPass,
      status: CANDIDATE_STATUS.ACTIVE,
    });
  }

  let employerPending = await Employer.findOne({ status: EMPLOYER_STATUS.PENDING });
  if (!employerPending) {
    employerPending = await Employer.create({
      companyName: "Công ty Khởi nghiệp ABC",
      slug: "cong-ty-khoi-nghiep-abc",
      email: "pending@company.vn",
      password: defaultPass,
      status: EMPLOYER_STATUS.PENDING,
    });
  }

  const pages = [
    { name: "candidate-login", path: "/candidate/login" },
    { name: "candidate-signup", path: "/candidate/signup" },
    { name: "employer-login", path: "/employer/login" },
    { name: "employer-signup", path: "/employer/signup" },
    { name: "candidate-change-password", path: "/_dev/login-candidate?to=/candidate/change-password" },
    { name: "home-authenticated", path: "/_dev/login-candidate?to=/" },
    { name: "employer-pending-banner", path: "/_dev/login-employer?to=/employer/company-profile" },
  ];

  const port = 3000;
  const server = app.listen(port, async () => {
    console.log(`Express server chạy tại port ${port} để chụp Phase 2...`);

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

      console.log("\n🎉 Đã chụp toàn bộ screenshots Phase 2 thành công!");
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

captureAll();
