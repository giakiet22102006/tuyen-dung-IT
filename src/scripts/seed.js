// src/scripts/seed.js
const bcrypt = require("bcryptjs");
const { connectDB, closeDB } = require("../config/db");
const {
  Candidate,
  Employer,
  Admin,
  Job,
  Skill,
  Application,
  AuditLog,
} = require("../models");
const {
  CITIES,
  POSITIONS,
  WORKING_FORMS,
  EMPLOYER_STATUS,
  CANDIDATE_STATUS,
  ADMIN_ROLES,
  ADMIN_STATUS,
  JOB_MODERATION,
  APPLICATION_STATUS,
} = require("../config/constants");
const slugify = require("../utils/slugify");
const normalizeVi = require("../utils/normalizeVi");

const isBigMode = process.argv.includes("--big");

// Danh sách Kỹ năng IT mẫu thực tế
const SAMPLE_SKILLS = [
  "ReactJS", "NodeJS", "JavaScript", "TypeScript", "HTML5", "CSS3", "TailwindCSS",
  "NextJS", "VueJS", "Angular", "Python", "Django", "FastAPI", "Java", "Spring Boot",
  "Golang", "C#", ".NET Core", "PHP", "Laravel", "Flutter", "React Native", "iOS (Swift)",
  "Android (Kotlin)", "Docker", "Kubernetes", "AWS", "GCP", "Azure", "CI/CD",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "GraphQL", "REST API",
  "Kafka", "RabbitMQ", "Microservices", "Unit Test", "Jest", "Git", "Linux"
];

// Danh sách Công ty mẫu thực tế
const SAMPLE_COMPANIES = [
  {
    name: "LG CNS Việt Nam",
    city: "ha-noi",
    address: "Tầng 15, tòa Keangnam Landmark 72, Mễ Trì, Nam Từ Liêm, Hà Nội",
    model: "Sản phẩm & Giải pháp",
    size: "151 - 300 nhân viên",
    time: "Thứ 2 - Thứ 6",
    ot: "Không có OT",
    desc: "<p>LG CNS là công ty hàng đầu Hàn Quốc cung cấp dịch vụ công nghệ thông tin và chuyển đổi số toàn diện. Tại Việt Nam, chúng tôi xây dựng các hệ thống giải pháp cốt lõi cho các đối tác toàn cầu.</p>",
    logo: "/assets/images/demo/image1.png"
  },
  {
    name: "FPT Software",
    city: "ha-noi",
    address: "Tòa nhà FPT, Phố Duy Tân, Cầu Giấy, Hà Nội",
    model: "Outsourcing & Dịch vụ",
    size: "10.000+ nhân viên",
    time: "Thứ 2 - Thứ 6",
    ot: "Có OT (trả lương theo luật)",
    desc: "<p>FPT Software là công ty xuất khẩu phần mềm lớn nhất Đông Nam Á, hiện diện tại hơn 30 quốc gia trên thế giới với các dự án chuyển đổi số quy mô lớn.</p>",
    logo: "/assets/images/demo/demo4.png"
  },
  {
    name: "VNG Corporation",
    city: "ho-chi-minh",
    address: "Z06 Đường số 13, Phường Tân Thuận Đông, Quận 7, TP. Hồ Chí Minh",
    model: "Sản phẩm",
    size: "1.000 - 5.000 nhân viên",
    time: "Thứ 2 - Thứ 6",
    ot: "Linh hoạt",
    desc: "<p>Kỳ lân công nghệ đầu tiên tại Việt Nam, sở hữu hệ sinh thái Zalo, Zing, VNG Games và ZaloPay phục vụ hàng chục triệu người dùng.</p>",
    logo: "/assets/images/demo/image1.png"
  },
  {
    name: "MoMo (M-Service)",
    city: "ho-chi-minh",
    address: "Tòa nhà Phú Mỹ Hưng, Hoàng Văn Thái, Quận 7, TP. Hồ Chí Minh",
    model: "Sản phẩm (Fintech)",
    size: "1.000 - 3.000 nhân viên",
    time: "Thứ 2 - Thứ 6",
    ot: "Không có OT",
    desc: "<p>Siêu ứng dụng tài chính số 1 Việt Nam, mang đến trải nghiệm thanh toán và tài chính thông minh cho hơn 30 triệu người dùng.</p>",
    logo: "/assets/images/demo/demo4.png"
  },
  {
    name: "Techcombank",
    city: "ha-noi",
    address: "Số 6 Quang Trung, Trần Hưng Đạo, Hoàn Kiếm, Hà Nội",
    model: "Ngân hàng số",
    size: "5.000 - 10.000 nhân viên",
    time: "Thứ 2 - Thứ 6",
    ot: "Không có OT",
    desc: "<p>Khối Công nghệ & Dữ liệu Techcombank đang tiên phong dẫn dắt quá trình chuyển đổi số ngân hàng với kiến trúc Cloud-first hiện đại.</p>",
    logo: "/assets/images/demo/image1.png"
  },
  {
    name: "One Mount Group",
    city: "ha-noi",
    address: "Tòa nhà T26, KĐT Times City, Hai Bà Trưng, Hà Nội",
    model: "Sản phẩm",
    size: "1.000 - 3.000 nhân viên",
    time: "Thứ 2 - Thứ 6",
    ot: "Linh hoạt",
    desc: "<p>Xây dựng hệ sinh thái số tin cậy và tiện lợi lớn nhất Việt Nam qua các sản phẩm VinShop, VinID, OneHousing.</p>",
    logo: "/assets/images/demo/demo4.png"
  },
  {
    name: "Shopee Việt Nam",
    city: "ho-chi-minh",
    address: "Tòa nhà Saigon Centre, 67 Lê Lợi, Quận 1, TP. Hồ Chí Minh",
    model: "Sản phẩm (E-Commerce)",
    size: "1.000 - 5.000 nhân viên",
    time: "Thứ 2 - Thứ 6",
    ot: "Có OT",
    desc: "<p>Sàn thương mại điện tử hàng đầu Đông Nam Á và Đài Loan, cung cấp nền tảng giao dịch trực tuyến tiện lợi và bảo mật.</p>",
    logo: "/assets/images/demo/image1.png"
  },
  {
    name: "Viettel Solutions",
    city: "ha-noi",
    address: "Tòa nhà Viettel, Số 1 Trần Hữu Dực, Nam Từ Liêm, Hà Nội",
    model: "Giải pháp chuyển đổi số",
    size: "3.000 - 5.000 nhân viên",
    time: "Thứ 2 - Thứ 6",
    ot: "Linh hoạt",
    desc: "<p>Thành viên của Tập đoàn Viettel, tiên phong xây dựng Chính phủ điện tử, thành phố thông minh và các giải pháp số cho doanh nghiệp.</p>",
    logo: "/assets/images/demo/demo4.png"
  },
  {
    name: "Enclave IT",
    city: "da-nang",
    address: "453 Hải Phòng, Chính Gián, Thanh Khê, Đà Nẵng",
    model: "Dịch vụ phần mềm",
    size: "300 - 500 nhân viên",
    time: "Thứ 2 - Thứ 6",
    ot: "Không có OT",
    desc: "<p>Công ty gia công phần mềm hàng đầu miền Trung, hợp tác lâu năm với các đối tác công nghệ tại Hoa Kỳ và Châu Âu.</p>",
    logo: "/assets/images/demo/image1.png"
  },
  {
    name: "KMS Technology",
    city: "da-nang",
    address: "Tòa nhà Bưu điện, 271 Nguyễn Văn Linh, Thanh Khê, Đà Nẵng",
    model: "Dịch vụ & Sản phẩm",
    size: "1.000 - 1.500 nhân viên",
    time: "Thứ 2 - Thứ 6",
    ot: "Không có OT",
    desc: "<p>Tập đoàn dịch vụ phần mềm quốc tế được bình chọn là một trong những nơi làm việc tốt nhất Việt Nam nhiều năm liên tiếp.</p>",
    logo: "/assets/images/demo/demo4.png"
  }
];

// Danh sách Tiêu đề công việc mẫu
const JOB_TITLES = [
  "Frontend Engineer (ReactJS, NextJS)",
  "Senior Backend Developer (NodeJS, Express)",
  "Fullstack Developer (ReactJS, NodeJS)",
  "Java Backend Engineer (Spring Boot, Microservices)",
  "DevOps Engineer (AWS, Docker, K8s)",
  "Mobile Developer (Flutter, Dart)",
  "iOS Engineer (Swift)",
  "Android Engineer (Kotlin)",
  "Python Data Engineer",
  "Senior Golang Engineer",
  "Automation QA/QC Engineer",
  "Lead Frontend Architect",
  "Software Engineer (.NET Core, C#)",
  "Cloud Solutions Architect (GCP/AWS)",
  "Data Scientist / AI Engineer"
];

const SAMPLE_NAMES = [
  "Nguyễn Văn An", "Trần Thị Mai", "Lê Hoàng Long", "Phạm Minh Đức",
  "Vũ Thị Thảo", "Hoàng Gia Huy", "Đặng Ngọc Ánh", "Bùi Quang Hải",
  "Đỗ Phương Linh", "Ngô Thành Nam", "Dương Quốc Bảo", "Hồ Bích Ngọc",
  "Lý Triều Vĩ", "Trịnh Thùy Trang", "Đinh Hữu Phước"
];

async function seedData() {
  await connectDB();
  console.log(`\n🌱 Bắt đầu dọn dẹp và nạp dữ liệu mẫu (Chế độ: ${isBigMode ? "BIG 10.000 Jobs" : "Chuẩn Thực tế"})...`);

  // Xóa dữ liệu cũ
  await Promise.all([
    Candidate.deleteMany({}),
    Employer.deleteMany({}),
    Job.deleteMany({}),
    Skill.deleteMany({}),
    Application.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
  console.log("🧹 Đã làm sạch các collections cũ.");

  // 1. Nạp Skills
  console.log("👉 Đang nạp danh sách Kỹ năng IT...");
  const skillDocs = SAMPLE_SKILLS.map((name) => ({
    name,
    slug: slugify(name),
  }));
  const skills = await Skill.insertMany(skillDocs);
  console.log(`✅ Đã nạp ${skills.length} kỹ năng IT.`);

  // Hash mật khẩu dùng chung cho seed (tiết kiệm CPU)
  const defaultPassword = await bcrypt.hash("12345678aA", 12);

  // 2. Nạp Employers
  console.log("👉 Đang nạp danh sách Nhà tuyển dụng...");
  const employersToCreate = [];
  const employerCount = isBigMode ? 500 : SAMPLE_COMPANIES.length;

  for (let i = 0; i < employerCount; i++) {
    const base = SAMPLE_COMPANIES[i % SAMPLE_COMPANIES.length];
    const companyName = isBigMode ? `${base.name} #${i + 1}` : base.name;
    const slug = slugify(companyName, true);
    const email = `employer${i + 1}@${slugify(base.name)}.vn`;

    employersToCreate.push({
      companyName,
      slug,
      email,
      password: defaultPassword,
      phone: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
      logo: { url: base.logo, key: "" },
      city: base.city,
      address: base.address,
      companyModel: base.model,
      companySize: base.size,
      workingTime: base.time,
      overtime: base.ot,
      description: base.desc,
      status: i === 1 && !isBigMode ? EMPLOYER_STATUS.PENDING : EMPLOYER_STATUS.ACTIVE,
      approvedAt: new Date(),
      searchText: normalizeVi(`${companyName} ${email} ${base.address}`),
    });
  }

  const employers = await Employer.insertMany(employersToCreate);
  console.log(`✅ Đã nạp ${employers.length} nhà tuyển dụng.`);

  // 3. Nạp Candidates
  console.log("👉 Đang nạp danh sách Ứng viên...");
  const candidateCount = isBigMode ? 2000 : SAMPLE_NAMES.length;
  const candidatesToCreate = [];

  for (let i = 0; i < candidateCount; i++) {
    const name = SAMPLE_NAMES[i % SAMPLE_NAMES.length];
    const fullName = isBigMode ? `${name} ${i + 1}` : name;
    const email = `candidate${i + 1}@gmail.com`;
    const phone = `03${Math.floor(10000000 + Math.random() * 90000000)}`;

    candidatesToCreate.push({
      fullName,
      email,
      password: defaultPassword,
      phone,
      avatar: { url: "/assets/images/demo/image1.png", key: "" },
      status: CANDIDATE_STATUS.ACTIVE,
      searchText: normalizeVi(`${fullName} ${email} ${phone}`),
    });
  }

  const candidates = await Candidate.insertMany(candidatesToCreate);
  console.log(`✅ Đã nạp ${candidates.length} ứng viên.`);

  // 4. Nạp Jobs
  console.log("👉 Đang nạp danh sách Việc làm IT...");
  const jobCount = isBigMode ? 10000 : 45;
  const jobsToCreate = [];
  const positionKeys = POSITIONS.map((p) => p.value);
  const workingFormKeys = WORKING_FORMS.map((w) => w.value);

  const sampleImages = [
    { url: "/assets/images/demo/demo1.png", key: "" },
    { url: "/assets/images/demo/demo2.png", key: "" },
    { url: "/assets/images/demo/demo3.png", key: "" },
  ];

  for (let i = 0; i < jobCount; i++) {
    const employer = employers[i % employers.length];
    const title = JOB_TITLES[i % JOB_TITLES.length];
    const position = positionKeys[i % positionKeys.length];
    const workingForm = workingFormKeys[i % workingFormKeys.length];

    // Chọn 2-4 kỹ năng ngẫu nhiên
    const jobSkills = [];
    const skillCount = 2 + (i % 3);
    for (let s = 0; s < skillCount; s++) {
      const sk = skills[(i * 3 + s) % skills.length];
      if (!jobSkills.some((item) => item.slug === sk.slug)) {
        jobSkills.push({ name: sk.name, slug: sk.slug });
      }
    }

    const minSal = 800 + (i % 10) * 200;
    const maxSal = minSal + 500 + (i % 5) * 200;
    const slug = isBigMode
      ? `${slugify(title)}-${i + 1}-${Math.random().toString(36).substring(2, 7)}`
      : slugify(title, true);
    const skillText = jobSkills.map((s) => s.name).join(" ");

    jobsToCreate.push({
      employerId: employer._id,
      title: isBigMode ? `${title} (Mã #${i + 1})` : title,
      slug,
      salaryMin: minSal,
      salaryMax: maxSal,
      position,
      workingForm,
      skills: jobSkills,
      images: sampleImages,
      description: `<p>Tuyển dụng vị trí <strong>${title}</strong> tại <strong>${employer.companyName}</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: ${skillText}. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>`,
      city: employer.city,
      address: employer.address,
      employerActive: employer.status === EMPLOYER_STATUS.ACTIVE,
      moderation: JOB_MODERATION.VISIBLE,
      searchText: normalizeVi(`${title} ${skillText}`),
    });

    // Batch insert theo cụm 1000 items nếu ở chế độ big
    if (jobsToCreate.length === 1000) {
      await Job.insertMany(jobsToCreate);
      jobsToCreate.length = 0;
      process.stdout.write(`  ...đã nạp ${i + 1}/${jobCount} việc làm\r`);
    }
  }

  if (jobsToCreate.length > 0) {
    await Job.insertMany(jobsToCreate);
  }
  const totalJobs = await Job.countDocuments();
  console.log(`\n✅ Đã nạp thành công tổng cộng ${totalJobs} việc làm.`);

  // 5. Nạp Applications
  console.log("👉 Đang nạp danh sách Đơn ứng tuyển...");
  const appCount = isBigMode ? 5000 : 25;
  const appsToCreate = [];
  const statusValues = Object.values(APPLICATION_STATUS);
  const sampleJobs = await Job.find({}).limit(500).select("_id employerId").lean();

  for (let i = 0; i < appCount; i++) {
    const job = sampleJobs[i % sampleJobs.length];
    const candidate = candidates[i % candidates.length];
    const status = statusValues[i % statusValues.length];

    appsToCreate.push({
      jobId: job._id,
      employerId: job.employerId,
      candidateId: candidate._id,
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      cv: {
        key: `cv-${candidate._id}-${job._id}.pdf`,
        originalName: `CV_${slugify(candidate.fullName)}.pdf`,
        size: 1024 * 350, // 350KB
      },
      viewed: i % 2 === 0,
      status,
      reviewedAt: status !== APPLICATION_STATUS.PENDING ? new Date() : null,
    });

    if (appsToCreate.length === 1000) {
      try {
        await Application.insertMany(appsToCreate, { ordered: false });
      } catch (e) {
        // bỏ qua trùng unique
      }
      appsToCreate.length = 0;
      process.stdout.write(`  ...đã nạp ${i + 1}/${appCount} đơn ứng tuyển\r`);
    }
  }

  if (appsToCreate.length > 0) {
    try {
      await Application.insertMany(appsToCreate, { ordered: false });
    } catch (e) {
      // bỏ qua trùng unique
    }
  }
  const totalApps = await Application.countDocuments();
  console.log(`\n✅ Đã nạp thành công tổng cộng ${totalApps} hồ sơ ứng tuyển.`);

  console.log("\n==========================================");
  console.log("🎉 TẤT CẢ DỮ LIỆU ĐÃ ĐƯỢC SEED THÀNH CÔNG!");
  console.log(`- Kỹ năng (Skills): ${await Skill.countDocuments()}`);
  console.log(`- Nhà tuyển dụng (Employers): ${await Employer.countDocuments()}`);
  console.log(`- Ứng viên (Candidates): ${await Candidate.countDocuments()}`);
  console.log(`- Việc làm (Jobs): ${totalJobs}`);
  console.log(`- Đơn nộp CV (Applications): ${totalApps}`);
  console.log("==========================================\n");

  await closeDB();
  process.exit(0);
}

seedData().catch(async (err) => {
  console.error("❌ Lỗi khi nạp dữ liệu:", err);
  await closeDB();
  process.exit(1);
});
