// src/scripts/create-admin.js
const bcrypt = require("bcryptjs");
const readline = require("readline");
const { connectDB, closeDB } = require("../config/db");
const { Admin } = require("../models");
const { ADMIN_ROLES, ADMIN_STATUS } = require("../config/constants");

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function createSuperAdmin() {
  await connectDB();

  let email = process.env.ADMIN_EMAIL || process.argv[2];
  let password = process.env.ADMIN_PASSWORD || process.argv[3];
  let fullName = process.env.ADMIN_NAME || process.argv[4] || "Super Administrator";

  if (!email) {
    email = await askQuestion("Nhập Email cho Superadmin: ");
  }
  if (!password) {
    password = await askQuestion("Nhập Mật khẩu cho Superadmin (ít nhất 8 ký tự): ");
  }

  if (!email || !password || password.length < 8) {
    console.error("❌ Email hoặc Mật khẩu không hợp lệ (mật khẩu phải từ 8 ký tự trở lên).");
    await closeDB();
    process.exit(1);
  }

  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.warn(`⚠️ Tài khoản admin với email ${email} đã tồn tại!`);
    await closeDB();
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const admin = await Admin.create({
    fullName,
    email: email.toLowerCase(),
    password: hashedPassword,
    role: ADMIN_ROLES.SUPERADMIN,
    status: ADMIN_STATUS.ACTIVE,
  });

  console.log(`✅ Tạo Superadmin thành công: ${admin.fullName} (${admin.email})`);
  await closeDB();
  process.exit(0);
}

createSuperAdmin().catch(async (err) => {
  console.error("❌ Lỗi tạo admin:", err);
  await closeDB();
  process.exit(1);
});
