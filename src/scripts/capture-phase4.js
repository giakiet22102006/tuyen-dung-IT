const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const app = require("../app");
const { connectDB, closeDB } = require("../config/db");
const { Employer, Job, Skill } = require("../models");
const { EMPLOYER_STATUS, JOB_MODERATION } = require("../config/constants");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = "C:\\Users\\admin\\.gemini\\antigravity\\brain\\587c674b-6bae-410c-ab63-c8b566f65996\\screenshots\\phase4";
const tempUserDataDir = path.join(process.env.TEMP || "C:\\Temp", "chrome_phase4_profile");

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

  // Đảm bảo có employer active
  let company = await Employer.findOne({ status: EMPLOYER_STATUS.ACTIVE });
  if (!company) {
    company = await Employer.create({
      companyName: "LG CNS Việt Nam",
      slug: "lg-cns-viet-nam",
      email: "lgcns@gmail.com",
      password: "Password123",
      city: "ha-noi",
      address: "Tầng 15, tòa Keangnam Landmark 72, Mễ Trì, Nam Từ Liêm, Hà Nội",
      companyModel: "Sản phẩm & Dịch vụ",
      companySize: "151 - 300 nhân viên",
      workingTime: "Thứ 2 - Thứ 6",
      overtime: "Không có OT",
      phone: "024 3768 9999",
      description: "<p>LG CNS là công ty hàng đầu Hàn Quốc cung cấp dịch vụ công nghệ thông tin và giải pháp số hàng đầu thế giới.</p>",
      logo: { url: "/assets/images/demo/image1.png" },
      status: EMPLOYER_STATUS.ACTIVE,
    });
  }

  // Đảm bảo có việc làm mẫu của employer này
  let job = await Job.findOne({ employerId: company._id, deletedAt: null });
  if (!job) {
    job = await Job.create({
      employerId: company._id,
      title: "Senior Fullstack Engineer (NodeJS & React)",
      slug: "senior-fullstack-engineer-nodejs-react",
      salaryMin: 2000,
      salaryMax: 3500,
      position: "senior",
      workingForm: "office",
      skills: [
        { name: "NodeJS", slug: "nodejs" },
        { name: "ReactJS", slug: "reactjs" },
        { name: "MongoDB", slug: "mongodb" },
      ],
      images: [
        { url: "/assets/images/demo/demo1.png" },
        { url: "/assets/images/demo/demo2.png" },
        { url: "/assets/images/demo/demo3.png" },
      ],
      description: "<p>Tham gia phát triển hệ thống nền tảng tuyển dụng và các dự án lõi quy mô lớn của tập đoàn.</p>",
      city: company.city,
      address: company.address,
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
    });
  }

  const pages = [
    { name: "company-profile", path: "/_dev/login-employer?active=1&to=/employer/company-profile" },
    { name: "manage-jobs", path: "/_dev/login-employer?active=1&to=/employer/jobs" },
    { name: "create-jobs", path: "/_dev/login-employer?active=1&to=/employer/jobs/create" },
    { name: "edit-jobs", path: `/_dev/login-employer?active=1&to=/employer/jobs/${job._id}/edit` },
  ];

  const port = 3001;
  const server = app.listen(port, async () => {
    console.log(`Server chạy tại port ${port} để chụp Phase 4...`);

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

      console.log("\n🎉 Đã chụp toàn bộ screenshots Phase 4 thành công!");
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
