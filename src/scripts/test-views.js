const app = require("../app");
const request = require("supertest");

const routes = [
  "/",
  "/search",
  "/companies",
  "/companies/test-company",
  "/jobs/test-job",
  "/candidate/signup",
  "/candidate/login",
  "/candidate/profile",
  "/candidate/applied-jobs",
  "/employer/signup",
  "/employer/login",
  "/employer/company-profile",
  "/employer/jobs",
  "/employer/jobs/create",
  "/employer/cvs",
  "/employer/cvs/test-id",
];

async function verifyAllViews() {
  console.log("=== ĐANG KIỂM TRA RENDER TOÀN BỘ 16 TRANG TĨNH QUA EXPRESS + PUG ===");
  let passed = 0;
  for (const route of routes) {
    try {
      const res = await request(app).get(route);
      if (res.status === 200 && res.text.includes("<!DOCTYPE html>")) {
        console.log(`✅ [OK 200] ${route}`);
        passed++;
      } else {
        console.error(`❌ [FAILED ${res.status}] ${route}`);
      }
    } catch (err) {
      console.error(`❌ [ERROR] ${route}:`, err.message);
    }
  }
  console.log(`\nKết quả: ${passed}/${routes.length} trang render thành công 200 OK.`);
  if (passed === routes.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

verifyAllViews();
