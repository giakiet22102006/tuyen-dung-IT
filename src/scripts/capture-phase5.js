const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const app = require("../app");
const { connectDB, closeDB } = require("../config/db");
const { Candidate, Employer, Job, Application } = require("../models");
const { EMPLOYER_STATUS, CANDIDATE_STATUS, JOB_MODERATION, APPLICATION_STATUS } = require("../config/constants");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = "C:\\Users\\admin\\.gemini\\antigravity\\brain\\587c674b-6bae-410c-ab63-c8b566f65996\\screenshots\\phase5";
const tempUserDataDir = path.join(process.env.TEMP || "C:\\Temp", "chrome_phase5_profile");

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

  // Đảm bảo có candidate
  let candidate = await Candidate.findOne({});
  if (!candidate) {
    candidate = await Candidate.create({
      fullName: "Lê Văn A",
      email: "levana@gmail.com",
      password: "Password123",
      phone: "0912345678",
      status: CANDIDATE_STATUS.ACTIVE,
    });
  }

  // Đảm bảo có employer
  let company = await Employer.findOne({ status: EMPLOYER_STATUS.ACTIVE });
  if (!company) {
    company = await Employer.create({
      companyName: "LG CNS Việt Nam",
      slug: "lg-cns-viet-nam",
      email: "lgcns@gmail.com",
      password: "Password123",
      city: "ha-noi",
      address: "Tầng 15, tòa Keangnam Landmark 72, Mễ Trì, Nam Từ Liêm, Hà Nội",
      status: EMPLOYER_STATUS.ACTIVE,
    });
  }

  // Đảm bảo có job
  let job = await Job.findOne({ employerId: company._id, deletedAt: null });
  if (!job) {
    job = await Job.create({
      employerId: company._id,
      title: "Frontend Engineer (ReactJS)",
      slug: "frontend-engineer-reactjs-123",
      salaryMin: 1000,
      salaryMax: 1500,
      position: "fresher",
      workingForm: "office",
      skills: [{ name: "ReactJS", slug: "reactjs" }, { name: "HTML5", slug: "html5" }],
      city: company.city,
      address: company.address,
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
    });
  }

  // Tạo file PDF thật trong storage
  const cvKey = "sample-cv.pdf";
  const cvStoragePath = path.join(__dirname, "../../storage/private/cv", cvKey);
  if (!fs.existsSync(cvStoragePath)) {
    const validPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
    fs.writeFileSync(cvStoragePath, validPdf);
  }

  // Đảm bảo có Application
  let application = await Application.findOne({ jobId: job._id, candidateId: candidate._id });
  if (!application) {
    application = await Application.create({
      jobId: job._id,
      employerId: company._id,
      candidateId: candidate._id,
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      cv: {
        key: cvKey,
        originalName: "CV_LeVanA_Frontend.pdf",
        size: 10240,
      },
      viewed: false,
      status: APPLICATION_STATUS.PENDING,
    });
  }

  const pages = [
    { name: "candidate-profile", path: "/_dev/login-candidate?to=/candidate/profile" },
    { name: "applied-jobs", path: "/_dev/login-candidate?to=/candidate/applied-jobs" },
    { name: "manage-CV", path: "/_dev/login-employer?active=1&to=/employer/cvs" },
    { name: "CV-details", path: `/_dev/login-employer?active=1&to=/employer/cvs/${application._id}` },
  ];

  const port = 3002;
  const server = app.listen(port, async () => {
    console.log(`Server chạy tại port ${port} để chụp Phase 5...`);

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

      console.log("\n🎉 Đã chụp toàn bộ screenshots Phase 5 thành công!");
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
