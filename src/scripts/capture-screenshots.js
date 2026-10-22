const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const app = require("../app");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = "C:\\Users\\admin\\.gemini\\antigravity\\brain\\587c674b-6bae-410c-ab63-c8b566f65996\\screenshots\\phase0";
const tempUserDataDir = path.join(process.env.TEMP || "C:\\Temp", "chrome_capture_profile");

const pages = [
  { name: "home", path: "/" },
  { name: "search", path: "/search" },
  { name: "company-list", path: "/companies" },
  { name: "job-details", path: "/jobs/frontend-engineer" },
  { name: "candidate-login", path: "/candidate/login" },
  { name: "employer-create-job", path: "/employer/jobs/create" },
];

function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout, stderr });
    });
  });
}

async function capture() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const port = 3000;
  const server = app.listen(port, async () => {
    console.log(`Server Express đã khởi chạy tại port ${port} để chụp ảnh.`);

    try {
      for (const page of pages) {
        const url = `http://localhost:${port}${page.path}`;

        // Desktop (1280px)
        const desktopFile = path.join(outputDir, `${page.name}-desktop-1280.png`);
        const desktopCmd = `"${chromePath}" --headless --disable-gpu --user-data-dir="${tempUserDataDir}" --window-size=1280,900 --screenshot="${desktopFile}" "${url}"`;
        await runCmd(desktopCmd);
        console.log(`✅ Chụp Desktop 1280px: ${page.name}`);

        // Mobile (375px)
        const mobileFile = path.join(outputDir, `${page.name}-mobile-375.png`);
        const mobileCmd = `"${chromePath}" --headless --disable-gpu --user-data-dir="${tempUserDataDir}" --window-size=375,812 --screenshot="${mobileFile}" "${url}"`;
        await runCmd(mobileCmd);
        console.log(`✅ Chụp Mobile 375px: ${page.name}`);
      }

      console.log("\n🎉 Đã chụp toàn bộ screenshots nghiệm thu Phase 0 thành công!");
    } catch (err) {
      console.error("Lỗi khi chụp:", err);
    } finally {
      server.close(() => {
        process.exit(0);
      });
    }
  });
}

capture();
