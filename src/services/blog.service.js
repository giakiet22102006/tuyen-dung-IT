// src/services/blog.service.js
const {
  Article,
  ARTICLE_CATEGORIES,
  ARTICLE_CATEGORY_LABELS,
  TARGET_AUDIENCES,
  TARGET_AUDIENCE_LABELS,
} = require("../models/article.model");
const paginate = require("../utils/pagination");
const slugify = require("../utils/slugify");

// Dữ liệu mẫu chuyên sâu chuẩn ITviec Blog
const now = Date.now();
const SEED_ARTICLES = [
  {
    title: "Roadmap Fullstack Web Developer 2026: Từ Số 0 Đến Lương 50 Triệu",
    slug: "roadmap-fullstack-web-developer-2026-luong-50-trieu",
    category: ARTICLE_CATEGORIES.CAREER_ROADMAP,
    targetAudience: TARGET_AUDIENCES.CANDIDATE,
    summary: "Bản đồ nghề nghiệp chi tiết giúp lập trình viên định hướng lộ trình học tập, làm chủ Frontend hiện đại, Backend quy mô lớn, Cloud và AI để bứt phá thu nhập.",
    readingTime: 8,
    tags: ["Roadmap", "Fullstack", "ReactJS", "NodeJS", "DevOps"],
    thumbnail: "/assets/images/demo/demo1.png",
    isOriginal: true,
    publishedAt: new Date(now),
    content: `
      <h2>1. Tổng quan thị trường Fullstack Developer năm 2026</h2>
      <p>Năm 2026, các doanh nghiệp công nghệ không chỉ tìm kiếm một lập trình viên biết viết HTML/CSS hay CRUD cơ bản. Xu hướng thị trường đòi hỏi kỹ sư Fullstack phải hiểu sâu về kiến trúc hệ thống phân tán, tối ưu hiệu năng (Web Vitals) và tích hợp các mô hình ngôn ngữ lớn (LLM / Gemini API) vào sản phẩm.</p>

      <h2>2. Giai đoạn 1: Nền tảng Vững chắc (Tháng 1 - Tháng 3)</h2>
      <p>Tập trung toàn lực vào <strong>JavaScript ES6+</strong>, TypeScript chuyên sâu, HTML5 Semantic và CSS hiện đại (Tailwind CSS v4). Hiểu rõ Event Loop, Asynchronous programming (Promise, async/await), và nguyên lý DOM rendering.</p>

      <h2>3. Giai đoạn 2: Frontend Hiện Đại & State Management (Tháng 4 - Tháng 6)</h2>
      <p>Làm chủ <strong>React 19 / Next.js App Router</strong> hoặc Vue 3. Nắm chắc Server Components, Server Actions, Client-side Caching và các pattern tối ưu re-render. Xây dựng ít nhất 2 dự án thực tế có authentication và thanh toán online.</p>

      <h2>4. Giai đoạn 3: Backend Scalable & Database (Tháng 7 - Tháng 9)</h2>
      <p>Xây dựng RESTful API và GraphQL với <strong>Node.js / Express / NestJS</strong> hoặc <strong>Golang</strong>. Thành thạo cả SQL (PostgreSQL) và NoSQL (MongoDB). Nắm vững indexing, database transaction, locking và caching với Redis.</p>

      <h2>5. Giai đoạn 4: CI/CD, Docker & Cloud Deployment (Tháng 10 - Tháng 12)</h2>
      <p>Tự động hóa build và test với GitHub Actions. Container hóa ứng dụng với Docker, deploy lên AWS/GCP hoặc Vercel. Hiểu cơ bản về Monitoring, logging và bảo mật OWASP Top 10.</p>
    `,
  },
  {
    title: "Top 10 Câu Hỏi Phỏng Vấn System Design Thường Gặp Nhất Tại Các Công Ty IT Lớn",
    slug: "top-10-cau-hoi-phong-van-system-design-it-hang-dau",
    category: ARTICLE_CATEGORIES.INTERVIEW_TIPS,
    targetAudience: TARGET_AUDIENCES.CANDIDATE,
    summary: "Chiến lược phân tích yêu cầu, tính toán băng thông dữ liệu và thiết kế kiến trúc chịu tải hàng triệu người dùng (High Availability & Scalability).",
    readingTime: 10,
    tags: ["System Design", "Interview", "Architecture", "Microservices"],
    thumbnail: "/assets/images/demo/demo2.png",
    isOriginal: true,
    publishedAt: new Date(now - 1000 * 60 * 30),
    content: `
      <h2>Tại sao phỏng vấn System Design quyết định cấp bậc Senior?</h2>
      <p>Ở cấp bậc Middle đến Senior, coding skill chỉ là điều kiện cần. Khả năng thiết kế hệ thống bền vững, chịu tải cao (High Concurrency) và khả năng mở rộng (Scalability) mới là yếu tố quyết định mức offer lương từ 40 đến 80 triệu đồng.</p>

      <h2>Khung 4 bước trả lời chuẩn quốc tế (PEDAC / FRAMEWORK):</h2>
      <ol>
        <li><strong>Xác định yêu cầu (Scope & Requirements):</strong> Phân chia rõ ràng Functional vs Non-Functional requirements (Latency, Availability, Consistency - Định lý CAP).</li>
        <li><strong>Ước lượng quy mô (Back-of-the-envelope estimation):</strong> Tính toán DAU, QPS (Queries Per Second), dung lượng lưu trữ cần thiết trong 5 năm.</li>
        <li><strong>Thiết kế sơ đồ tổng quan (High-Level Design):</strong> Client $\rightarrow$ DNS/CDN $\rightarrow$ Load Balancer $\rightarrow$ API Gateway $\rightarrow$ Microservices $\rightarrow$ DB & Cache.</li>
        <li><strong>Đi sâu vào chi tiết (Deep Dive & Bottlenecks):</strong> Giải quyết bài toán Database Sharding, Read/Write Replica, Message Queue (Kafka/RabbitMQ) và Failover.</li>
      </ol>
    `,
  },
  {
    title: "Bí Quyết Đàm Phán Lương IT Tăng 30% - 50% Khi Nhận Offer",
    slug: "bi-quyet-dam-phan-luong-it-tang-30-50-phan-tram",
    category: ARTICLE_CATEGORIES.SALARY_INSIGHTS,
    targetAudience: TARGET_AUDIENCES.ALL,
    summary: "Cách xác định giá trị bản thân, sử dụng dữ liệu thị trường và thương lượng khéo léo để đạt mức đãi ngộ cao nhất mà không làm mất lòng nhà tuyển dụng.",
    readingTime: 6,
    tags: ["Salary", "Đàm Phán Lương", "Offer", "Career Tips"],
    thumbnail: "/assets/images/demo/demo3.png",
    isOriginal: true,
    publishedAt: new Date(now - 1000 * 60 * 60),
    content: `
      <h2>1. Nghiên cứu dữ liệu mức lương thị trường trước buổi phỏng vấn</h2>
      <p>Không bao giờ bước vào buổi phỏng vấn với con số mơ hồ. Hãy sử dụng công cụ <a href="/salary" class="text-blue-600 underline font-semibold">Tra Cứu Lương IT</a> của VN.ITJobs để nắm chắc phân vị thu nhập tương ứng với số năm kinh nghiệm và công nghệ của bạn.</p>

      <h2>2. Không bao giờ đưa ra con số kỳ vọng quá sớm</h2>
      <p>Khi nhà tuyển dụng hỏi: <em>"Mức lương kỳ vọng của bạn là bao nhiêu?"</em> trong vòng sơ loại, hãy trả lời lịch sự: <em>"Em muốn tìm hiểu kỹ hơn về phạm vi trách nhiệm, quy mô dự án và môi trường làm việc để hai bên có thể thống nhất một mức đãi ngộ xứng đáng và cạnh tranh nhất."</em></p>

      <h2>3. Chiến lược đàm phán dựa trên giá trị giải quyết bài toán</h2>
      <p>Hãy chứng minh cho NTD thấy việc tuyển dụng bạn sẽ giúp họ tiết kiệm chi phí hạ tầng, rút ngắn tiến độ bàn giao sản phẩm hoặc mở rộng năng lực đội ngũ ra sao.</p>
    `,
  },
  {
    title: "Cẩm Nang Vượt Qua Vòng Live Coding & Whiteboard Bằng JavaScript / Golang",
    slug: "cam-nang-vuot-qua-vong-live-coding-whiteboard",
    category: ARTICLE_CATEGORIES.INTERVIEW_TIPS,
    targetAudience: TARGET_AUDIENCES.CANDIDATE,
    isGated: true,
    summary: "Quy tắc 5 bước 'Nói to suy nghĩ' (Think Aloud) và cách tối ưu độ phức tạp thuật toán O(N) khi phỏng vấn trực tiếp trước hội đồng tuyển dụng.",
    readingTime: 7,
    tags: ["Live Coding", "Algorithms", "Data Structures", "LeetCode"],
    thumbnail: "/assets/images/demo/demo4.png",
    isOriginal: true,
    publishedAt: new Date(now - 1000 * 60 * 90),
    content: `
      <h2>Sai lầm lớn nhất của ứng viên khi Live Coding</h2>
      <p>Hầu hết ứng viên thất bại không phải vì không giải được bài toán, mà vì im lặng cắm đầu gõ code ngay khi vừa nhận đề bài. Người phỏng vấn cần thấy cách bạn tư duy, giao tiếp và phản biện!</p>

      <h2>Quy tắc vàng 5 bước làm chủ phòng phỏng vấn:</h2>
      <ul>
        <li><strong>Bước 1:</strong> Đặt câu hỏi làm rõ các trường hợp biên (Edge Cases: mảng rỗng, giá trị âm, số cực lớn, null/undefined).</li>
        <li><strong>Bước 2:</strong> Trình bày ý tưởng giải pháp sơ khai (Brute Force) và phân tích Time/Space Complexity.</li>
        <li><strong>Bước 3:</strong> Đề xuất phương án tối ưu (ví dụ: dùng Hash Map, Two Pointers hoặc Sliding Window để giảm từ $O(N^2)$ xuống $O(N)$).</li>
        <li><strong>Bước 4:</strong> Viết code mạch lạc, đặt tên biến có nghĩa và tuân thủ Clean Code.</li>
        <li><strong>Bước 5:</strong> Tự chạy Dry Run với test case mẫu trước khi thông báo đã hoàn thành.</li>
      </ul>
    `,
  },
  {
    title: "Xu Hướng AI & DevOps Sẽ Chi Phối Thị Trường Tuyển Dụng IT Việt Nam 2026",
    slug: "xu-huong-ai-devops-thi-truong-tuyen-dung-it-2026",
    category: ARTICLE_CATEGORIES.TECH_TRENDS,
    targetAudience: TARGET_AUDIENCES.ALL,
    summary: "Phân tích các kỹ năng công nghệ đang có tốc độ tăng trưởng tuyển dụng nhanh nhất và được các công ty săn đón với mức lương cao vượt trội.",
    readingTime: 6,
    tags: ["AI Trends", "DevOps", "Cloud", "Kubernetes", "GenAI"],
    thumbnail: "/assets/images/demo/demo1.png",
    isOriginal: true,
    publishedAt: new Date(now - 1000 * 60 * 120),
    content: `
      <h2>Sự bùng nổ của AI-assisted Development và Kỹ sư AI Platform</h2>
      <p>Năm 2026 đánh dấu bước ngoặt khi AI không còn là công nghệ viễn tưởng mà đã trở thành công cụ làm việc bắt buộc. Các lập trình viên biết kết hợp công cụ sinh code AI và hiểu kiến trúc RAG (Retrieval-Augmented Generation) có năng suất làm việc cao gấp 2-3 lần.</p>

      <h2>DevOps / Platform Engineering: Vị trí 'vàng' không lo thiếu việc</h2>
      <p>Khi các doanh nghiệp chuyển dịch toàn diện lên đám mây (Multi-Cloud / Hybrid Cloud), vai trò của kỹ sư DevOps, Kubernetes, Terraform và CI/CD tự động hóa đang có mức lương trung vị chạm mốc 45 - 60 triệu VNĐ/tháng.</p>
    `,
  },
  {
    title: "Cẩm Nang Tuyển Dụng Lập Trình Viên Senior & Thu Hút Tech Talent Năm 2026",
    slug: "cam-nang-tuyen-dung-lap-trinh-vien-senior-2026",
    category: ARTICLE_CATEGORIES.RECRUITMENT_TIPS,
    targetAudience: TARGET_AUDIENCES.EMPLOYER,
    isGated: true,
    summary: "Chiến lược xây dựng thương hiệu tuyển dụng kỹ thuật, thiết kế bài test thực chiến và quy trình phỏng vấn chuẩn mực để chiêu mộ nhân tài công nghệ hàng đầu.",
    readingTime: 8,
    tags: ["Tech Recruiting", "Tuyển Dụng IT", "Headhunter", "HR Tech"],
    thumbnail: "/assets/images/demo/demo2.png",
    isOriginal: true,
    publishedAt: new Date(now - 1000 * 60 * 150),
    content: `
      <h2>1. Vì sao cách tuyển dụng IT truyền thống không còn hiệu quả?</h2>
      <p>Kỹ sư phần mềm giỏi (Senior+) thường không chủ động nộp đơn ứng tuyển rộng rãi. Họ là những 'Passive Candidates' (ứng viên thụ động). Để tiếp cận họ, doanh nghiệp cần văn hóa Tech cởi mở, minh bạch về mức đãi ngộ và lộ trình thăng tiến kỹ thuật (Tech Track song song Management Track).</p>

      <h2>2. Thiết kế bài test kỹ thuật tôn trọng thời gian ứng viên</h2>
      <p>Tránh các bài tập về nhà kéo dài 3-5 ngày. Hãy chuyển đổi sang hình thức: Pair Programming trực tiếp 45 phút, hoặc thảo luận giải pháp kiến trúc dựa trên chính bài toán thực tế mà công ty đang đối mặt.</p>

      <h2>3. Rút ngắn thời gian từ phỏng vấn đến gửi Offer</h2>
      <p>Ứng viên giỏi thường nhận từ 2-4 lời mời cùng lúc. Quy trình tuyển dụng gọn gàng trong vòng 7 - 10 ngày làm việc sẽ giúp công ty gia tăng tỷ lệ chốt offer thành công lên tới hơn 85%.</p>
    `,
  },
  {
    title: "Tổng Hợp Xu Hướng Micro-Frontends và Design System Cho Doanh Nghiệp Lớn",
    slug: "tong-hop-xu-huong-micro-frontends-va-design-system",
    category: ARTICLE_CATEGORIES.TECH_TRENDS,
    targetAudience: TARGET_AUDIENCES.ALL,
    summary: "Bài viết tổng hợp và biên tập từ chuyên trang công nghệ Martin Fowler và Medium về giải pháp kiến trúc Micro-Frontends giải quyết nút thắt cho các dự án đa đội ngũ.",
    readingTime: 7,
    tags: ["Micro-Frontends", "Architecture", "Design System", "Trích Nguồn"],
    thumbnail: "/assets/images/demo/demo3.png",
    isOriginal: false,
    sourceName: "Martin Fowler & Medium",
    sourceUrl: "https://martinfowler.com/articles/micro-frontends.html",
    originalAuthor: "Cam Jackson",
    publishedAt: new Date(now - 1000 * 60 * 180),
    content: `
      <h2>Khái niệm cốt lõi về Micro-Frontends</h2>
      <p>Lấy cảm hứng từ kiến trúc Microservices ở tầng Backend, Micro-Frontends chia nhỏ ứng dụng Frontend đơn khối (Monolith) thành nhiều module độc lập do các nhóm tính năng (Feature Teams) tự chủ phát triển và triển khai.</p>

      <h2>Khi nào nên áp dụng?</h2>
      <ul>
        <li>Quy mô kỹ sư Frontend vượt quá 20 người cùng làm việc trên một codebase.</li>
        <li>Cần tách biệt chu kỳ release tính năng giữa các phòng ban để tránh xung đột mã nguồn.</li>
        <li>Doanh nghiệp muốn thử nghiệm công nghệ mới song song mà không cần viết lại toàn bộ sản phẩm cũ.</li>
      </ul>
    `,
  },
];

/**
 * Đảm bảo database luôn có bài viết mẫu phong phú
 */
async function ensureSeedArticles() {
  try {
    const count = await Article.countDocuments();
    if (count === 0) {
      await Article.insertMany(SEED_ARTICLES);
      console.log("📚 Đã khởi tạo 7 bài viết chuyên sâu cho IT Blog.");
    }
  } catch (err) {
    console.error("Lỗi seed articles:", err.message);
  }
}

function normalizeCategory(cat) {
  if (!cat || typeof cat !== "string") return ARTICLE_CATEGORIES.CAREER_ROADMAP;
  const trimmed = cat.trim();
  for (const [key, val] of Object.entries(ARTICLE_CATEGORIES)) {
    if (trimmed === val || trimmed.toLowerCase() === val.toLowerCase()) return val;
  }
  for (const [val, label] of Object.entries(ARTICLE_CATEGORY_LABELS)) {
    if (trimmed.toLowerCase() === label.toLowerCase()) return val;
  }
  const slug = trimmed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (slug.includes("tuyen dung")) return ARTICLE_CATEGORIES.RECRUITMENT_TIPS;
  if (slug.includes("phong van")) return ARTICLE_CATEGORIES.INTERVIEW_TIPS;
  if (slug.includes("luong") || slug.includes("dai ngo")) return ARTICLE_CATEGORIES.SALARY_INSIGHTS;
  if (slug.includes("lo trinh") || slug.includes("career") || slug.includes("sinh vien")) return ARTICLE_CATEGORIES.CAREER_ROADMAP;
  if (slug.includes("xu huong") || slug.includes("cong nghe") || slug.includes("tech")) return ARTICLE_CATEGORIES.TECH_TRENDS;
  return trimmed;
}

/**
 * Lấy danh sách bài viết kèm bộ lọc, tìm kiếm và phân trang
 */
async function getArticles({ category = "", audience = "", search = "", page = 1, limit = 6 }) {
  await ensureSeedArticles();

  const filter = { isPublished: true };
  const andConditions = [];

  if (category) {
    const normalizedCat = normalizeCategory(category);
    const labelForCat = ARTICLE_CATEGORY_LABELS[normalizedCat];
    const categoryOrConditions = [
      { category: normalizedCat },
      { category: category },
    ];
    if (labelForCat) {
      categoryOrConditions.push({ category: labelForCat });
      categoryOrConditions.push({ category: new RegExp(labelForCat, "i") });
    }
    andConditions.push({ $or: categoryOrConditions });
  }

  if (audience && Object.values(TARGET_AUDIENCES).includes(audience)) {
    if (audience === TARGET_AUDIENCES.CANDIDATE) {
      andConditions.push({ targetAudience: { $in: [TARGET_AUDIENCES.CANDIDATE, TARGET_AUDIENCES.ALL] } });
    } else if (audience === TARGET_AUDIENCES.EMPLOYER) {
      andConditions.push({ targetAudience: { $in: [TARGET_AUDIENCES.EMPLOYER, TARGET_AUDIENCES.ALL] } });
    }
  }

  if (search && search.trim()) {
    const s = search.trim();
    andConditions.push({
      $or: [
        { title: { $regex: s, $options: "i" } },
        { summary: { $regex: s, $options: "i" } },
        { tags: { $in: [new RegExp(s, "i")] } },
        { sourceName: { $regex: s, $options: "i" } },
      ],
    });
  }

  if (andConditions.length > 0) {
    filter.$and = andConditions;
  }

  const total = await Article.countDocuments(filter);
  const pagination = paginate(total, page, limit);

  const articles = await Article.find(filter)
    .sort({ publishedAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  return {
    articles,
    pagination,
    total,
  };
}

/**
 * Lấy chi tiết bài viết theo Slug và tăng lượt xem
 */
async function getArticleBySlug(slug) {
  await ensureSeedArticles();

  const article = await Article.findOneAndUpdate(
    { slug, isPublished: true },
    { $inc: { views: 1 } },
    { new: true }
  ).lean();

  return article;
}

/**
 * Lấy bài viết liên quan cùng chuyên mục
 */
async function getRelatedArticles(category, excludeId, limit = 3) {
  const filter = {
    isPublished: true,
    category,
    _id: { $ne: excludeId },
  };

  return await Article.find(filter)
    .sort({ views: -1, publishedAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * ========================================================
 * PHẦN QUẢN TRỊ ADMIN (CMS CHO BÀI VIẾT)
 * ========================================================
 */

/**
 * Lấy danh sách bài viết cho trang Quản trị Admin
 */
async function getAdminArticles({ search = "", category = "", audience = "", isPublished = "", page = 1, limit = 10 }) {
  await ensureSeedArticles();

  const filter = {};

  if (category) {
    const normalizedCat = normalizeCategory(category);
    const labelForCat = ARTICLE_CATEGORY_LABELS[normalizedCat];
    const categoryOrConditions = [
      { category: normalizedCat },
      { category: category },
    ];
    if (labelForCat) categoryOrConditions.push({ category: labelForCat });
    filter.$or = categoryOrConditions;
  }

  if (audience && Object.values(TARGET_AUDIENCES).includes(audience)) {
    filter.targetAudience = audience;
  }

  if (isPublished !== "" && isPublished !== undefined) {
    filter.isPublished = isPublished === "true" || isPublished === true;
  }

  if (search && search.trim()) {
    const s = search.trim();
    filter.$or = [
      { title: { $regex: s, $options: "i" } },
      { summary: { $regex: s, $options: "i" } },
      { sourceName: { $regex: s, $options: "i" } },
      { tags: { $in: [new RegExp(s, "i")] } },
    ];
  }

  const total = await Article.countDocuments(filter);
  const pagination = paginate(total, page, limit);

  const articles = await Article.find(filter)
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  return {
    articles,
    pagination,
    total,
  };
}

/**
 * Lấy bài viết theo ID (cho trang Edit)
 */
async function getArticleById(id) {
  return await Article.findById(id).lean();
}

/**
 * Tạo mới bài viết
 */
async function createArticle(data) {
  let baseSlug = (data.slug && data.slug.trim()) || slugify(data.title);
  if (!baseSlug) baseSlug = `bai-viet-${Date.now()}`;

  // Kiểm tra trùng lặp slug
  let finalSlug = baseSlug;
  const existing = await Article.findOne({ slug: finalSlug });
  if (existing) {
    finalSlug = slugify(data.title, true);
  }

  const tags = Array.isArray(data.tags)
    ? data.tags
    : typeof data.tags === "string"
    ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const isGated =
    (data.targetAudience === TARGET_AUDIENCES.CANDIDATE || data.targetAudience === TARGET_AUDIENCES.EMPLOYER) &&
    (data.isGated === "true" || data.isGated === true || data.isGated === "on");

  const article = new Article({
    title: data.title.trim(),
    slug: finalSlug,
    category: normalizeCategory(data.category) || ARTICLE_CATEGORIES.TECH_TRENDS,
    targetAudience: data.targetAudience || TARGET_AUDIENCES.ALL,
    isGated,
    summary: data.summary.trim(),
    content: data.content,
    thumbnail: data.thumbnail || "/assets/images/demo/demo1.png",
    tags,
    readingTime: parseInt(data.readingTime, 10) || 5,
    isOriginal: data.isOriginal === "false" || data.isOriginal === false ? false : true,
    sourceName: data.sourceName ? data.sourceName.trim() : "",
    sourceUrl: data.sourceUrl ? data.sourceUrl.trim() : "",
    originalAuthor: data.originalAuthor ? data.originalAuthor.trim() : "",
    isPublished: data.isPublished === "false" || data.isPublished === false ? false : true,
    publishedAt: data.isPublished === false ? null : new Date(),
  });

  return await article.save();
}

/**
 * Cập nhật bài viết
 */
async function updateArticle(id, data) {
  const article = await Article.findById(id);
  if (!article) {
    throw new Error("Không tìm thấy bài viết");
  }

  if (data.title) article.title = data.title.trim();
  if (data.slug && data.slug.trim() && data.slug.trim() !== article.slug) {
    const slugExists = await Article.findOne({ slug: data.slug.trim(), _id: { $ne: id } });
    if (slugExists) {
      article.slug = slugify(data.slug.trim(), true);
    } else {
      article.slug = data.slug.trim();
    }
  }
  if (data.category) article.category = normalizeCategory(data.category);
  if (data.targetAudience) article.targetAudience = data.targetAudience;
  if (data.summary) article.summary = data.summary.trim();
  if (data.content) article.content = data.content;
  if (data.thumbnail) article.thumbnail = data.thumbnail.trim();

  if (data.tags !== undefined) {
    article.tags = Array.isArray(data.tags)
      ? data.tags
      : typeof data.tags === "string"
      ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
  }

  if (data.readingTime) article.readingTime = parseInt(data.readingTime, 10) || 5;

  article.isOriginal = data.isOriginal === "false" || data.isOriginal === false ? false : true;
  article.sourceName = data.sourceName ? data.sourceName.trim() : "";
  article.sourceUrl = data.sourceUrl ? data.sourceUrl.trim() : "";
  article.originalAuthor = data.originalAuthor ? data.originalAuthor.trim() : "";

  if (data.isGated !== undefined || data.targetAudience !== undefined) {
    const aud = data.targetAudience || article.targetAudience;
    const gated = data.isGated !== undefined ? data.isGated : article.isGated;
    article.isGated =
      (aud === TARGET_AUDIENCES.CANDIDATE || aud === TARGET_AUDIENCES.EMPLOYER) &&
      (gated === "true" || gated === true || gated === "on");
  }

  if (data.isPublished !== undefined) {
    const wasPublished = article.isPublished;
    article.isPublished = data.isPublished === "true" || data.isPublished === true;
    if (!wasPublished && article.isPublished && !article.publishedAt) {
      article.publishedAt = new Date();
    }
  }

  return await article.save();
}

/**
 * Xóa bài viết
 */
async function deleteArticle(id) {
  return await Article.findByIdAndDelete(id);
}

/**
 * Bật / Tắt trạng thái xuất bản bài viết
 */
async function toggleArticlePublish(id) {
  const article = await Article.findById(id);
  if (!article) {
    throw new Error("Không tìm thấy bài viết");
  }
  article.isPublished = !article.isPublished;
  if (article.isPublished && !article.publishedAt) {
    article.publishedAt = new Date();
  }
  return await article.save();
}

module.exports = {
  ARTICLE_CATEGORIES,
  ARTICLE_CATEGORY_LABELS,
  TARGET_AUDIENCES,
  TARGET_AUDIENCE_LABELS,
  ensureSeedArticles,
  getArticles,
  getArticleBySlug,
  getRelatedArticles,
  getAdminArticles,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  toggleArticlePublish,
};
