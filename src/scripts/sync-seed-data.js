/**
 * Idempotent, non-destructive DB sync script to clean up legacy seeded records:
 * 1. Clears shared demo logo URLs (/assets/images/demo/demo4.png or mismatched image1.png) on Employers.
 * 2. Normalizes Job positions, realistic salary ranges by position, skill tags matching job title, and demo images.
 *
 * Safe to run on production: NEVER deletes users, candidates, applications, reviews, or jobs.
 * Usage:
 *   node src/scripts/sync-seed-data.js --dry-run
 *   node src/scripts/sync-seed-data.js
 */
require("dotenv").config();
const { connectDB, closeDB } = require("../config/db");
const { Employer, Job, Skill } = require("../models");
const normalizeVi = require("../utils/normalizeVi");
const slugify = require("../utils/slugify");
const {
  findJobTemplateByTitle,
  inferSkillsForJobTitle,
  getNormalizedSalary,
  isDemoLogoMismatch,
} = require("../constants/seed-templates");

const isDryRun = process.argv.includes("--dry-run");

async function syncDatabase() {
  await connectDB();
  console.log(
    isDryRun
      ? "🔍 [DRY-RUN] Kiểm tra dữ liệu DB (không ghi đè)..."
      : "🔧 Đang đồng bộ & chuẩn hóa dữ liệu DB (an toàn, không xóa record)..."
  );

  // 1. Clean mismatched demo logos on Employers
  const employers = await Employer.find({}).select("_id companyName logo").lean();
  let employerUpdatedCount = 0;
  const employerNameById = new Map();

  for (const emp of employers) {
    employerNameById.set(String(emp._id), emp.companyName || "");
    const logoUrl = emp.logo && emp.logo.url ? emp.logo.url : "";
    if (isDemoLogoMismatch(logoUrl, emp.companyName)) {
      employerUpdatedCount++;
      console.log(`  - Employer [${emp.companyName}]: clear mismatched logo "${logoUrl}"`);
      if (!isDryRun) {
        await Employer.updateOne({ _id: emp._id }, { $set: { "logo.url": "" } });
      }
    }
  }

  // 2. Build Skill lookup map (case-insensitive)
  const existingSkills = await Skill.find({}).select("_id name slug").lean();
  const skillMap = new Map();
  for (const sk of existingSkills) {
    if (sk.name) {
      skillMap.set(sk.name.toLowerCase(), {
        _id: sk._id,
        name: sk.name,
        slug: sk.slug || slugify(sk.name),
      });
    }
  }

  async function resolveSkills(skillNames) {
    const resolved = [];
    for (const rawName of skillNames) {
      const key = rawName.toLowerCase();
      let found = skillMap.get(key);
      if (!found && !isDryRun) {
        const created = await Skill.create({ name: rawName, slug: slugify(rawName) });
        found = { _id: created._id, name: created.name, slug: created.slug };
        skillMap.set(key, found);
      }
      if (found) {
        resolved.push(found);
      } else {
        resolved.push({ name: rawName, slug: slugify(rawName) });
      }
    }
    return resolved;
  }

  // 3. Normalize Jobs (position, salaryMin/salaryMax, skills, searchText, demo images)
  const jobs = await Job.find({})
    .select("_id employerId title position salaryMin salaryMax skills images searchText")
    .lean();

  let jobUpdatedCount = 0;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const updates = {};
    const tpl = findJobTemplateByTitle(job.title);

    // 3a. Validate position against template (e.g. Cloud Solutions Architect shouldn't be fresher/intern)
    let targetPosition = job.position;
    if (tpl && tpl.positions && tpl.positions.length > 0 && !tpl.positions.includes(job.position)) {
      targetPosition = tpl.positions[0];
      updates.position = targetPosition;
    }

    // 3b. Validate salaryMin/salaryMax against realistic bounds for targetPosition
    const salResult = getNormalizedSalary(targetPosition, job.salaryMin, job.salaryMax, i);
    if (salResult.changed) {
      updates.salaryMin = salResult.salaryMin;
      updates.salaryMax = salResult.salaryMax;
    }

    // 3c. Validate skills against expected skills for job title
    const expectedSkillNames = inferSkillsForJobTitle(job.title);
    if (expectedSkillNames && expectedSkillNames.length > 0) {
      const currentSkillNames = (job.skills || [])
        .map((s) => (s && s.name ? s.name.toLowerCase() : ""))
        .filter(Boolean);
      const expectedLower = expectedSkillNames.map((n) => n.toLowerCase());

      // Update if any expected skill is missing OR if current skills contain unrelated skills
      const hasSameSkills =
        currentSkillNames.length === expectedLower.length &&
        expectedLower.every((name) => currentSkillNames.includes(name));

      if (!hasSameSkills) {
        const resolvedSkills = await resolveSkills(expectedSkillNames);
        if (resolvedSkills.length > 0) {
          updates.skills = resolvedSkills.map((s) => ({
            name: s.name,
            slug: s.slug || slugify(s.name),
          }));
          const skillText = resolvedSkills.map((s) => s.name).join(" ");
          updates.searchText = normalizeVi(`${job.title} ${skillText}`);
        }
      }
    }

    // 3d. Clear LG demo gallery images on non-LG employers
    const empName = employerNameById.get(String(job.employerId)) || "";
    const isLg = empName.toLowerCase().includes("lg");
    if (!isLg && Array.isArray(job.images) && job.images.length > 0) {
      const onlyDemoImages = job.images.every(
        (img) => img && img.url && /\/assets\/images\/demo\/demo[1-3]\.png/i.test(img.url)
      );
      if (onlyDemoImages) {
        updates.images = [];
      }
    }

    if (Object.keys(updates).length > 0) {
      jobUpdatedCount++;
      console.log(
        `  - Job [${job.title}] (${job.position} -> ${targetPosition}):`,
        JSON.stringify({
          position: updates.position,
          salaryMin: updates.salaryMin,
          salaryMax: updates.salaryMax,
          skillsUpdated: Boolean(updates.skills),
          imagesCleared: Boolean(updates.images),
        })
      );
      if (!isDryRun) {
        await Job.updateOne({ _id: job._id }, { $set: updates });
      }
    }
  }

  console.log("\n==========================================");
  console.log(
    isDryRun
      ? `✅ [DRY-RUN] Phát hiện ${employerUpdatedCount}/${employers.length} công ty & ${jobUpdatedCount}/${jobs.length} việc làm cần chuẩn hóa.`
      : `✅ Đã cập nhật ${employerUpdatedCount}/${employers.length} công ty & ${jobUpdatedCount}/${jobs.length} việc làm.`
  );
  console.log("==========================================\n");

  await closeDB();
  process.exit(0);
}

syncDatabase().catch(async (err) => {
  console.error("❌ Lỗi khi đồng bộ dữ liệu DB:", err);
  await closeDB();
  process.exit(1);
});
