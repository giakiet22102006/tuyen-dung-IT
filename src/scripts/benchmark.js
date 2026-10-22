// src/scripts/benchmark.js
const { connectDB, closeDB } = require("../config/db");
const { Job, Application, Employer, Candidate, Skill } = require("../models");
const { JOB_MODERATION, EMPLOYER_STATUS, POSITIONS, WORKING_FORMS, CITIES } = require("../config/constants");
const normalizeVi = require("../utils/normalizeVi");
const slugify = require("../utils/slugify");

async function populateJobsIfEmpty() {
  let count = await Job.countDocuments();
  if (count >= 10000) return count;

  console.log(`📦 Đang tự động nạp dữ liệu lớn (10.000 Jobs) để thực hiện Benchmark...`);

  // Tạo employer mẫu nếu chưa có
  let emp = await Employer.findOne({ status: EMPLOYER_STATUS.ACTIVE });
  if (!emp) {
    emp = await Employer.create({
      companyName: "LG CNS Việt Nam",
      slug: "lg-cns-viet-nam",
      email: "lgcns@gmail.com",
      password: "Password123",
      city: "ha-noi",
      address: "Keangnam Landmark 72, Hà Nội",
      status: EMPLOYER_STATUS.ACTIVE,
    });
  }

  let cand = await Candidate.findOne({});
  if (!cand) {
    cand = await Candidate.create({
      fullName: "Nguyễn Văn Benchmark",
      email: "benchmark@candidate.com",
      password: "Password123",
    });
  }

  const jobsToCreate = [];
  const positions = POSITIONS.map((p) => p.value);
  const workingForms = WORKING_FORMS.map((w) => w.value);
  const cities = CITIES.map((c) => c.value);

  const sampleTitles = [
    "Frontend Engineer (ReactJS, NextJS)",
    "Backend Developer (NodeJS, Express)",
    "Fullstack Developer (NodeJS, ReactJS)",
    "Senior Java Engineer (Spring Boot)",
    "DevOps Engineer (Docker, Kubernetes)",
    "Mobile Developer (Flutter, React Native)",
    "Python AI Engineer (FastAPI, PyTorch)",
    "Golang Backend Developer",
  ];

  for (let i = count; i < 10000; i++) {
    const title = sampleTitles[i % sampleTitles.length];
    const pos = positions[i % positions.length];
    const wf = workingForms[i % workingForms.length];
    const ct = cities[i % cities.length];
    const slug = `${slugify(title)}-bm-${i + 1}`;

    jobsToCreate.push({
      employerId: emp._id,
      title: `${title} #${i + 1}`,
      slug,
      salaryMin: 1000 + (i % 10) * 100,
      salaryMax: 2000 + (i % 10) * 100,
      position: pos,
      workingForm: wf,
      skills: [
        { name: "ReactJS", slug: "reactjs" },
        { name: "NodeJS", slug: "nodejs" },
      ],
      city: ct,
      address: "Tòa nhà Keangnam, Hà Nội",
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
      searchText: normalizeVi(`${title} ReactJS NodeJS #${i + 1}`),
    });

    if (jobsToCreate.length === 2000) {
      await Job.insertMany(jobsToCreate);
      jobsToCreate.length = 0;
      process.stdout.write(`  ...đã nạp ${i + 1}/10000 việc làm\r`);
    }
  }

  if (jobsToCreate.length > 0) {
    await Job.insertMany(jobsToCreate);
  }

  // Nạp 1000 applications
  const appCount = await Application.countDocuments();
  if (appCount < 1000) {
    const appsToCreate = [];
    const jobs = await Job.find({}).limit(1000).select("_id employerId").lean();
    for (let j = 0; j < jobs.length; j++) {
      appsToCreate.push({
        jobId: jobs[j]._id,
        employerId: jobs[j].employerId,
        candidateId: cand._id,
        fullName: "Nguyễn Văn Benchmark",
        email: "benchmark@candidate.com",
        phone: "0912345678",
        cv: { key: `cv-${j}.pdf`, originalName: "CV.pdf" },
        status: "pending",
      });
    }
    await Application.insertMany(appsToCreate, { ordered: false });
  }

  console.log(`\n✅ Hoàn tất nạp dữ liệu! Bắt đầu đo lường hiệu năng trên 10.000 bản ghi.`);
  return await Job.countDocuments();
}

async function runBenchmark() {
  await connectDB();
  console.log("🚀 Bắt đầu Benchmark Hiệu năng Hệ thống VN.ITJobs...\n");

  const totalJobs = await populateJobsIfEmpty();
  console.log(`📊 Tổng số lượng Việc làm kiểm chuẩn: ${totalJobs}`);

  const results = [];

  // 1. Benchmark Query Tìm kiếm cơ bản (City + Position + WorkingForm)
  console.log("\n--- [Test 1] Tìm kiếm theo Thành phố + Cấp bậc + Hình thức làm việc ---");
  const query1 = {
    city: "ha-noi",
    position: "senior",
    workingForm: "office",
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  };
  const start1 = process.hrtime.bigint();
  const explain1 = await Job.find(query1)
    .sort({ createdAt: -1 })
    .limit(9)
    .explain("executionStats");
  const end1 = process.hrtime.bigint();
  const time1 = Number(end1 - start1) / 1e6;

  const stats1 = explain1.executionStats;
  const stage1 = stats1.executionStages?.stage || stats1.executionStages?.inputStage?.stage;
  const isIxscan1 = JSON.stringify(explain1).includes("IXSCAN") && !JSON.stringify(explain1).includes("COLLSCAN");

  console.log(`⏱️ Thời gian phản hồi: ${time1.toFixed(2)} ms (DB Server Time: ${stats1.executionTimeMillis} ms)`);
  console.log(`🔍 Winning Stage: ${stage1} | IXSCAN: ${isIxscan1 ? '✅ YES' : '❌ NO'}`);
  console.log(`📄 Docs Examined: ${stats1.totalDocsExamined} | Returned: ${stats1.nReturned}`);
  results.push({
    test: "Tìm kiếm City + Position + WorkingForm",
    totalJobs: "10,000",
    timeMs: time1.toFixed(2),
    dbTimeMs: stats1.executionTimeMillis,
    docsExamined: stats1.totalDocsExamined,
    returned: stats1.nReturned,
    stage: stage1,
    zeroCollscan: isIxscan1,
  });

  // 2. Benchmark Query Lọc theo Kỹ năng (skills.slug)
  console.log("\n--- [Test 2] Lọc theo Kỹ năng IT (skills.slug: 'reactjs') ---");
  const query2 = {
    "skills.slug": "reactjs",
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  };
  const start2 = process.hrtime.bigint();
  const explain2 = await Job.find(query2)
    .sort({ createdAt: -1 })
    .limit(9)
    .explain("executionStats");
  const end2 = process.hrtime.bigint();
  const time2 = Number(end2 - start2) / 1e6;

  const stats2 = explain2.executionStats;
  const stage2 = stats2.executionStages?.stage || stats2.executionStages?.inputStage?.stage;
  const isIxscan2 = JSON.stringify(explain2).includes("IXSCAN") && !JSON.stringify(explain2).includes("COLLSCAN");

  console.log(`⏱️ Thời gian phản hồi: ${time2.toFixed(2)} ms (DB Server Time: ${stats2.executionTimeMillis} ms)`);
  console.log(`🔍 Winning Stage: ${stage2} | IXSCAN: ${isIxscan2 ? '✅ YES' : '❌ NO'}`);
  console.log(`📄 Docs Examined: ${stats2.totalDocsExamined} | Returned: ${stats2.nReturned}`);
  results.push({
    test: "Lọc theo Kỹ năng IT (skills.slug)",
    totalJobs: "10,000",
    timeMs: time2.toFixed(2),
    dbTimeMs: stats2.executionTimeMillis,
    docsExamined: stats2.totalDocsExamined,
    returned: stats2.nReturned,
    stage: stage2,
    zeroCollscan: isIxscan2,
  });

  // 3. Benchmark Query Tìm kiếm Từ khóa không dấu (searchText)
  console.log("\n--- [Test 3] Tìm kiếm Từ khóa tiếng Việt không dấu (searchText: 'nodejs') ---");
  const keywordNormalized = normalizeVi("nodejs");
  const query3 = {
    searchText: new RegExp(keywordNormalized, "i"),
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  };
  const start3 = process.hrtime.bigint();
  const explain3 = await Job.find(query3)
    .sort({ createdAt: -1 })
    .limit(9)
    .explain("executionStats");
  const end3 = process.hrtime.bigint();
  const time3 = Number(end3 - start3) / 1e6;

  const stats3 = explain3.executionStats;
  const stage3 = stats3.executionStages?.stage || stats3.executionStages?.inputStage?.stage;
  const isIxscan3 = JSON.stringify(explain3).includes("IXSCAN");

  console.log(`⏱️ Thời gian phản hồi: ${time3.toFixed(2)} ms (DB Server Time: ${stats3.executionTimeMillis} ms)`);
  console.log(`🔍 Winning Stage: ${stage3} | IXSCAN: ${isIxscan3 ? '✅ YES' : '❌ NO'}`);
  console.log(`📄 Docs Examined: ${stats3.totalDocsExamined} | Returned: ${stats3.nReturned}`);
  results.push({
    test: "Tìm kiếm từ khóa (searchText)",
    totalJobs: "10,000",
    timeMs: time3.toFixed(2),
    dbTimeMs: stats3.executionTimeMillis,
    docsExamined: stats3.totalDocsExamined,
    returned: stats3.nReturned,
    stage: stage3,
    zeroCollscan: isIxscan3,
  });

  // 4. Benchmark Query Nhà tuyển dụng xem danh sách Job của mình (employerId + deletedAt)
  console.log("\n--- [Test 4] Quản lý tin tuyển dụng của Nhà tuyển dụng (employerId + deletedAt) ---");
  const sampleEmp = await Employer.findOne({ status: EMPLOYER_STATUS.ACTIVE });
  const query4 = {
    employerId: sampleEmp ? sampleEmp._id : "67b8f9e01234567890abcdef",
    deletedAt: null,
  };
  const start4 = process.hrtime.bigint();
  const explain4 = await Job.find(query4)
    .sort({ createdAt: -1 })
    .limit(9)
    .explain("executionStats");
  const end4 = process.hrtime.bigint();
  const time4 = Number(end4 - start4) / 1e6;

  const stats4 = explain4.executionStats;
  const stage4 = stats4.executionStages?.stage || stats4.executionStages?.inputStage?.stage;
  const isIxscan4 = JSON.stringify(explain4).includes("IXSCAN") && !JSON.stringify(explain4).includes("COLLSCAN");

  console.log(`⏱️ Thời gian phản hồi: ${time4.toFixed(2)} ms (DB Server Time: ${stats4.executionTimeMillis} ms)`);
  console.log(`🔍 Winning Stage: ${stage4} | IXSCAN: ${isIxscan4 ? '✅ YES' : '❌ NO'}`);
  console.log(`📄 Docs Examined: ${stats4.totalDocsExamined} | Returned: ${stats4.nReturned}`);
  results.push({
    test: "Quản lý Job của NTD (employerId + deletedAt)",
    totalJobs: "10,000",
    timeMs: time4.toFixed(2),
    dbTimeMs: stats4.executionTimeMillis,
    docsExamined: stats4.totalDocsExamined,
    returned: stats4.nReturned,
    stage: stage4,
    zeroCollscan: isIxscan4,
  });

  // 5. Benchmark Query Ứng viên xem danh sách hồ sơ đã nộp (candidateId + hiddenByCandidate)
  console.log("\n--- [Test 5] Quản lý CV đã nộp của Ứng viên (candidateId + hiddenByCandidate) ---");
  const sampleCand = await Candidate.findOne({});
  const query5 = {
    candidateId: sampleCand ? sampleCand._id : "67b8f9e01234567890abcdef",
    hiddenByCandidate: false,
  };
  const start5 = process.hrtime.bigint();
  const explain5 = await Application.find(query5)
    .sort({ createdAt: -1 })
    .limit(9)
    .explain("executionStats");
  const end5 = process.hrtime.bigint();
  const time5 = Number(end5 - start5) / 1e6;

  const stats5 = explain5.executionStats;
  const stage5 = stats5.executionStages?.stage || stats5.executionStages?.inputStage?.stage;
  const isIxscan5 = JSON.stringify(explain5).includes("IXSCAN") && !JSON.stringify(explain5).includes("COLLSCAN");

  console.log(`⏱️ Thời gian phản hồi: ${time5.toFixed(2)} ms (DB Server Time: ${stats5.executionTimeMillis} ms)`);
  console.log(`🔍 Winning Stage: ${stage5} | IXSCAN: ${isIxscan5 ? '✅ YES' : '❌ NO'}`);
  console.log(`📄 Docs Examined: ${stats5.totalDocsExamined} | Returned: ${stats5.nReturned}`);
  results.push({
    test: "Quản lý CV đã nộp (candidateId + hiddenByCandidate)",
    totalJobs: "10,000",
    timeMs: time5.toFixed(2),
    dbTimeMs: stats5.executionTimeMillis,
    docsExamined: stats5.totalDocsExamined,
    returned: stats5.nReturned,
    stage: stage5,
    zeroCollscan: isIxscan5,
  });

  console.log("\n=========================================================================================");
  console.log("🏁 TỔNG HỢP KẾT QUẢ BENCHMARK TRÊN 10.000 BẢN GHI:");
  console.table(results);
  console.log("=========================================================================================\n");

  await closeDB();
  process.exit(0);
}

runBenchmark().catch(async (err) => {
  console.error("Lỗi Benchmark:", err);
  await closeDB();
  process.exit(1);
});
