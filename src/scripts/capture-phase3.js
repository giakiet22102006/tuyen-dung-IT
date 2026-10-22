const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const app = require("../app");
const { connectDB, closeDB } = require("../config/db");
const { Employer, Job, Skill } = require("../models");
const { EMPLOYER_STATUS, JOB_MODERATION } = require("../config/constants");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = "C:\\Users\\admin\\.gemini\\antigravity\\brain\\587c674b-6bae-410c-ab63-c8b566f65996\\screenshots\\phase3";
const tempUserDataDir = path.join(process.env.TEMP || "C:\\Temp", "chrome_phase3_profile");

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

  // Đảm bảo có dữ liệu mẫu
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
      description: "<p>LG CNS là công ty hàng đầu Hàn Quốc cung cấp dịch vụ công nghệ thông tin và giải pháp số.</p>",
      logo: { url: "/assets/images/demo/image1.png" },
      status: EMPLOYER_STATUS.ACTIVE,
    });
  }

  let job = await Job.findOne({ employerId: company._id });
  if (!job) {
    job = await Job.create({
      employerId: company._id,
      title: "Frontend Engineer (ReactJS, NextJS)",
      slug: "frontend-engineer-reactjs-nextjs",
      salaryMin: 1000,
      salaryMax: 1500,
      position: "fresher",
      workingForm: "office",
      skills: [
        { name: "ReactJS", slug: "reactjs" },
        { name: "NextJS", slug: "nextjs" },
        { name: "Javascript", slug: "javascript" },
      ],
      images: [
        { url: "/assets/images/demo/demo1.png" },
        { url: "/assets/images/demo/demo2.png" },
        { url: "/assets/images/demo/demo3.png" },
      ],
      description: "<p>Tuyển dụng Frontend Engineer làm việc trực tiếp tại Keangnam Landmark 72.</p>",
      city: "ha-noi",
      address: "Tầng 15, tòa Keangnam Landmark 72, Mễ Trì, Nam Từ Liêm, Hà Nội",
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
    });
  }

  const pages = [
    { name: "home", path: "/" },
    { name: "search", path: "/search" },
    { name: "company-list", path: "/companies" },
    { name: "company-details", path: `/companies/${company.slug}` },
    { name: "job-details", path: `/jobs/${job.slug}` },
  ];

  const port = 3000;
  const server = app.listen(port, async () => {
    console.log(`Server chạy tại port ${port} để chụp Phase 3...`);

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

      console.log("\n🎉 Đã chụp toàn bộ screenshots Phase 3 thành công!");
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
