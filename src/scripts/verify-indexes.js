const { connectDB, closeDB } = require("../config/db");
const { Candidate, Employer, Admin, Job, Application, AuditLog, Skill } = require("../models");

async function checkIndexes() {
  await connectDB();
  console.log("=== KIỂM TRA INDEXES TOÀN BỘ COLLECTIONS ===");

  const models = [
    { name: "Candidate", model: Candidate },
    { name: "Employer", model: Employer },
    { name: "Admin", model: Admin },
    { name: "Job", model: Job },
    { name: "Application", model: Application },
    { name: "AuditLog", model: AuditLog },
    { name: "Skill", model: Skill },
  ];

  for (const m of models) {
    await m.model.init(); // Đảm bảo indexes đã được đồng bộ
    const indexes = await m.model.collection.indexes();
    console.log(`\n📌 Collection [${m.name}] có ${indexes.length} indexes:`);
    indexes.forEach((idx) => {
      console.log(`  - Tên: "${idx.name}", Khóa:`, JSON.stringify(idx.key), idx.unique ? "[UNIQUE]" : "", idx.expireAfterSeconds ? `[TTL ${idx.expireAfterSeconds}s]` : "");
    });
  }

  await closeDB();
  process.exit(0);
}

checkIndexes().catch(async (err) => {
  console.error("Lỗi:", err);
  await closeDB();
  process.exit(1);
});
