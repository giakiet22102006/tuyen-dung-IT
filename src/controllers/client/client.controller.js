// src/controllers/client/client.controller.js
const {
  getTotalPublicJobsCount,
  getTopEmployers,
  searchJobs,
  getCompanyList,
  getCompanyDetails,
  getJobDetails,
} = require("../../services/job.service");
const { getAutocompleteSuggestions } = require("../../services/fuzzySearch.service");
const { CITIES, POSITIONS, WORKING_FORMS, BENEFITS, JOB_MODERATION, EMPLOYER_STATUS } = require("../../config/constants");
const { Skill, Job, Application, Review, Employer, Feedback, Candidate, CompanyFollow } = require("../../models");
const { uploadCV, saveCvBuffer } = require("../../services/storage.service");
const { generateItProfilePdf } = require("../../services/pdfGenerator.service");
const { getCompanyMapData } = require("../../utils/googleMaps");
const { chatWithSupportAssistant } = require("../../services/ai.service");

const wantsMarkdown = (req) => {
  const accept = req.get("accept") || "";
  if (!accept.includes("text/markdown")) return false;
  if (!accept.includes("text/html")) return true;
  return req.accepts(["text/markdown", "text/html"]) === "text/markdown";
};

const renderIndex = async (req, res) => {
  res.vary("Accept");

  const [totalPublicJobs, topEmployers, marqueeEmployers] = await Promise.all([
    getTotalPublicJobsCount(),
    getTopEmployers(9),
    getTopEmployers(16),
  ]);

  if (wantsMarkdown(req)) {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    const employersList = (topEmployers || [])
      .map((e) => `- [${e.companyName}](https://tuyen-dung-it.vercel.app/companies/${e.slug}) (${e.jobCount || 0} việc làm mở)`)
      .join("\n");

    return res.send(
`# VN.ITJobs - Nền tảng tuyển dụng IT & Việc làm Developer hàng đầu Việt Nam

> VN.ITJobs (https://tuyen-dung-it.vercel.app) là nền tảng tuyển dụng công nghệ thông tin chuyên biệt hàng đầu Việt Nam. Nền tảng kết nối trực tiếp hơn 100.000+ lập trình viên với hơn 1.200+ doanh nghiệp công nghệ, cung cấp công cụ so khớp CV bằng AI, tra cứu lương IT và đánh giá môi trường làm việc minh bạch.

Hiện có **${totalPublicJobs}** việc làm IT đang mở tại Hà Nội, TP. Hồ Chí Minh, Đà Nẵng và Remote.

## Nhà tuyển dụng công nghệ hàng đầu
${employersList || "- FPT Software, Techcombank, MoMo, VNG, Viettel"}

## Danh mục việc làm IT & Chuyên môn nổi bật
- **Frontend & Web Development**: ReactJS, Next.js, VueJS, Angular, TypeScript.
- **Backend & Cloud Architecture**: Node.js, Java Spring Boot, Golang, Python, Microservices, AWS, Docker, Kubernetes.
- **Mobile Development**: Flutter, React Native, iOS Swift, Android Kotlin.
- **Trí tuệ nhân tạo & Dữ liệu (AI / ML)**: Machine Learning, Deep Learning, LLM, Computer Vision, Data Engineering.
- **DevOps, SRE & Cloud**: CI/CD, Terraform, AWS, Azure, GCP, An toàn thông tin.
- **Quản lý dự án & QA/QC**: Automation Test, Manual Test, Scrum Master, Product Owner.

## Dành cho AI Agents & Nhà phát triển
- **Model Context Protocol (MCP) Server**: [https://tuyen-dung-it.vercel.app/mcp](https://tuyen-dung-it.vercel.app/mcp)
- **MCP Manifest**: [https://tuyen-dung-it.vercel.app/.well-known/mcp](https://tuyen-dung-it.vercel.app/.well-known/mcp)
- **Developer Documentation & Portal**: [https://tuyen-dung-it.vercel.app/docs](https://tuyen-dung-it.vercel.app/docs)
- **OpenAPI 3.1 Spec**: [https://tuyen-dung-it.vercel.app/openapi.json](https://tuyen-dung-it.vercel.app/openapi.json)
- **Agent Instructions (when to use)**: [https://tuyen-dung-it.vercel.app/.well-known/agent-instructions.md](https://tuyen-dung-it.vercel.app/.well-known/agent-instructions.md)
- **LLM Context File**: [https://tuyen-dung-it.vercel.app/llms.txt](https://tuyen-dung-it.vercel.app/llms.txt)
- **Sitemap**: [https://tuyen-dung-it.vercel.app/sitemap.xml](https://tuyen-dung-it.vercel.app/sitemap.xml)

## Điều hướng chính
- [Tìm kiếm việc làm IT](/search)
- [Danh sách công ty IT](/companies)
- [Tra cứu mức lương IT](/salary)
- [Cẩm nang nghề nghiệp](/blog)
- [Về chúng tôi](/about)
- [Liên hệ ban quản trị](/contact)
- [Chính sách bảo mật](/privacy)
`
    );
  }

  const topSkills = (res.locals.menuData && res.locals.menuData.skills) || [];

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.render("pages/index", {
    title: "VN.ITJobs - Nền tảng tuyển dụng IT & Việc làm Developer hàng đầu Việt Nam",
    totalPublicJobs,
    topEmployers,
    marqueeEmployers,
    topSkills,
    cities: CITIES,
    selectedCity: "",
    keyword: "",
  });
};

const renderAbout = (req, res) => {
  res.vary("Accept");
  if (wantsMarkdown(req)) {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    return res.send(
`# Về chúng tôi - VN.ITJobs

VN.ITJobs là nền tảng tuyển dụng công nghệ thông tin chuyên biệt và tiên phong tại Việt Nam, thành lập năm 2024.

## Sứ mệnh & Tầm nhìn
- Sứ mệnh: Giúp mọi lập trình viên tìm được công việc mơ ước với mức đãi ngộ xứng đáng, đồng thời hỗ trợ các doanh nghiệp công nghệ chiêu mộ đúng người, đúng thời điểm nhờ công nghệ trí tuệ nhân tạo (AI Matching) tiên tiến.
- Tầm nhìn: Trở thành trung tâm kết nối nhân tài công nghệ số 1 Đông Nam Á, hỗ trợ chuyển đổi số quốc gia và nâng cao vị thế của kỹ sư lập trình Việt Nam.

## Thông tin pháp lý & Trụ sở
- Pháp nhân: Công ty Cổ phần Công nghệ VN.ITJobs Việt Nam (VN.ITJobs Technology JSC)
- Giấy phép ĐKDN: Số 0109988776 do Sở Kế hoạch và Đầu tư TP. Hà Nội cấp.
- Trụ sở chính: Tầng 12, Tòa nhà Keangnam Landmark 72, Đường Phạm Hùng, Phường Mễ Trì, Quận Nam Từ Liêm, TP. Hà Nội.
- Chi nhánh TP.HCM: Tầng 6, Bitexco Financial Tower, Số 2 Hải Triều, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh.
- Email: contact@vn-itjobs.com | Hotline: +84-24-3768-9999
`
    );
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.render("pages/about", {
    title: "Về chúng tôi - VN.ITJobs | Nền tảng tuyển dụng IT hàng đầu Việt Nam",
  });
};

const renderContact = (req, res) => {
  res.vary("Accept");
  if (wantsMarkdown(req)) {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    return res.send(
`# Liên hệ Ban Quản Trị - VN.ITJobs

## Thông tin văn phòng
- Trụ sở Hà Nội: Tầng 12, Tòa nhà Keangnam Landmark 72, Đường Phạm Hùng, Phường Mễ Trì, Quận Nam Từ Liêm, TP. Hà Nội.
- Hotline Miền Bắc: +84-24-3768-9999
- Chi nhánh TP.HCM: Tầng 6, Bitexco Financial Tower, Số 2 Hải Triều, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh.
- Hotline Miền Nam: +84-28-3829-8888

## Kênh hỗ trợ chuyên biệt
- Hỗ trợ Ứng viên: candidate-care@vn-itjobs.com
- Hỗ trợ Doanh nghiệp tuyển dụng: employer@vn-itjobs.com
- Hợp tác & Truyền thông: partnership@vn-itjobs.com
- Giờ làm việc: Thứ Hai - Thứ Sáu: 08:30 - 18:00 (GMT+7)
`
    );
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.render("pages/contact", {
    title: "Liên hệ - VN.ITJobs | Hỗ trợ Ứng viên & Nhà tuyển dụng công nghệ",
  });
};

const renderPrivacy = (req, res) => {
  res.vary("Accept");
  if (wantsMarkdown(req)) {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    return res.send(
`# Chính Sách Bảo Mật Thông Tin (Privacy Policy) - VN.ITJobs

VN.ITJobs cam kết bảo vệ dữ liệu cá nhân của người dùng theo Nghị định 13/2023/NĐ-CP và Luật An toàn thông tin mạng Việt Nam.

## 1. Dữ liệu thu thập
- Ứng viên: Họ tên, email, số điện thoại, vị trí chuyên môn, kỹ năng, mức lương mong muốn, tệp CV đính kèm.
- Nhà tuyển dụng: Tên doanh nghiệp, mã số thuế, địa chỉ, thông tin đại diện tuyển dụng, tin tuyển dụng.
- Kỹ thuật: Địa chỉ IP, cookie phiên bảo mật, thiết bị truy cập.

## 2. Mục đích sử dụng
- Kết nối hồ sơ ứng viên với nhà tuyển dụng khi ứng viên chủ động nộp đơn.
- Tự động phân tích và so khớp kỹ năng bằng AI (AI Matching Engine).
- Gửi thông báo việc làm mới và mã bảo mật OTP.
- Tổng hợp báo cáo thống kê lương IT ẩn danh.

## 3. Quyền của người dùng
- Người dùng có toàn quyền truy cập, chỉnh sửa, yêu cầu trích xuất hoặc xóa bỏ tài khoản và dữ liệu cá nhân bất cứ lúc nào qua email privacy@vn-itjobs.com.
- Tuyệt đối không chia sẻ dữ liệu cho bên thứ ba vì mục đích quảng cáo khi chưa có sự đồng ý.

## 4. Liên hệ bảo vệ dữ liệu
- Công ty Cổ phần Công nghệ VN.ITJobs Việt Nam
- Địa chỉ: Tầng 12, Tòa nhà Keangnam Landmark 72, Đường Phạm Hùng, Nam Từ Liêm, Hà Nội.
- Hotline: +84-24-3768-9999 | Email: privacy@vn-itjobs.com
`
    );
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.render("pages/privacy", {
    title: "Chính sách bảo mật thông tin - VN.ITJobs",
  });
};

const renderDocs = (req, res) => {
  res.vary("Accept");
  if (wantsMarkdown(req)) {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    return res.send(
`# VN.ITJobs Developer Portal & AI Integration

Tài liệu lập trình viên, OpenAPI Specification và Model Context Protocol (MCP) Server cho AI Agents.

## 1. Model Context Protocol (MCP) Server
- Streamable HTTP Transport Endpoint: \`POST https://tuyen-dung-it.vercel.app/mcp\`
- Protocol Version: 2024-11-05
- Discovery Manifest: \`https://tuyen-dung-it.vercel.app/.well-known/mcp\`
- Available Tools: \`search_jobs\`, \`get_job_details\`, \`calculate_salary\`, \`list_companies\`, \`get_platform_info\`.

## 2. OpenAPI 3.1 Spec
- URL: [https://tuyen-dung-it.vercel.app/openapi.json](https://tuyen-dung-it.vercel.app/openapi.json)

## 3. Markdown Content Negotiation (acceptmarkdown.com)
- Supply header \`Accept: text/markdown\` to any public page (\`/\`, \`/about\`, \`/contact\`, \`/privacy\`, \`/docs\`).

## 4. REST Endpoints
- Autocomplete: \`GET /api/search/suggestions?q={query}\`
- Salary: \`GET /api/salary/calculate?position={pos}&skill={skill}&city={city}\`
- Feedback: \`POST /api/feedback\`
`
    );
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.render("pages/docs", {
    title: "Tài liệu Lập trình viên & Tích hợp AI Agent - VN.ITJobs Developer Portal",
  });
};

const renderSearch = async (req, res) => {
  const { city, keyword, skill, position, workingForm, benefit, company, page, exact } = req.query;

  const [searchResult, totalPublicJobs] = await Promise.all([
    searchJobs(req.query),
    getTotalPublicJobsCount(),
  ]);

  const topSkills = (res.locals.menuData && res.locals.menuData.skills) || [];

  const {
    jobs,
    pagination,
    isFuzzyApplied,
    originalKeyword,
    suggestedKeyword,
    didYouMean,
  } = searchResult;

  const escapeHtml = (str) =>
    String(str || "").replace(/[&<>"']/g, (s) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[s] || s));

  // Xác định tiêu đề hiển thị an toàn chống Reflected XSS
  let searchTitle = `${pagination.totalItems} việc làm IT`;
  if (isFuzzyApplied) {
    searchTitle = `${pagination.totalItems} việc làm cho từ khóa gợi ý <span class="text-[#0088FF]">"${escapeHtml(suggestedKeyword)}"</span>`;
  } else if (benefit) {
    const foundBenefit = BENEFITS.find((b) => b.value === benefit);
    searchTitle = `${pagination.totalItems} việc làm có đãi ngộ <span class="text-[#0088FF]">"${escapeHtml(foundBenefit ? foundBenefit.label : benefit)}"</span>`;
  } else if (skill) {
    searchTitle = `${pagination.totalItems} việc làm <span class="text-[#0088FF]">${escapeHtml(skill)}</span>`;
  } else if (keyword) {
    searchTitle = `${pagination.totalItems} việc làm cho từ khóa <span class="text-[#0088FF]">"${escapeHtml(keyword)}"</span>`;
  } else if (city) {
    const foundCity = CITIES.find((c) => c.value === city);
    searchTitle = `${pagination.totalItems} việc làm tại <span class="text-[#0088FF]">${escapeHtml(foundCity ? foundCity.label : city)}</span>`;
  }

  res.render("pages/search", {
    title: "Kết quả tìm kiếm - VN.ITJobs",
    searchTitle,
    jobs,
    pagination,
    totalPublicJobs,
    topSkills,
    cities: CITIES,
    positions: POSITIONS,
    workingForms: WORKING_FORMS,
    benefits: BENEFITS,
    selectedCity: city || "",
    selectedPosition: position || "",
    selectedWorkingForm: workingForm || "",
    selectedBenefit: benefit || "",
    keyword: keyword || "",
    selectedSkill: skill || "",
    isFuzzyApplied: !!isFuzzyApplied,
    originalKeyword: originalKeyword || "",
    suggestedKeyword: suggestedKeyword || "",
    didYouMean: didYouMean || "",
    exact: exact === "true",
  });
};

const renderCompanyList = async (req, res) => {
  const page = req.query.page || 1;
  const { employers, pagination } = await getCompanyList(page, 9);

  res.render("pages/company-list", {
    title: "Danh sách công ty - VN.ITJobs",
    employers,
    pagination,
  });
};

const renderCompanyDetails = async (req, res) => {
  const data = await getCompanyDetails(req.params.slug);
  if (!data) {
    return res.status(404).render("pages/index", {
      title: "Không tìm thấy công ty",
      flash: { error: "Không tìm thấy thông tin công ty yêu cầu hoặc công ty đã ngừng hoạt động." },
    });
  }

  // Lấy danh sách đánh giá của công ty
  const reviews = await Review.find({
    employerId: data.company._id,
    isApproved: true,
  })
    .sort({ createdAt: -1 })
    .lean();

  const totalReviews = reviews.length;
  const avgRating =
    totalReviews > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
      : null;

  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    if (ratingCounts[r.rating] !== undefined) ratingCounts[r.rating]++;
  });

  // Số lượng ứng viên theo dõi công ty và trạng thái của ứng viên hiện tại
  const followersCount = await CompanyFollow.countDocuments({ employerId: data.company._id });
  let isFollowed = false;
  if (req.user && req.role === "candidate") {
    isFollowed = !!(await CompanyFollow.exists({ candidateId: req.user._id, employerId: data.company._id }));
  }

  const mapData = getCompanyMapData(data.company);

  res.render("pages/company-details", {
    title: `${data.company.companyName} - VN.ITJobs`,
    company: data.company,
    jobs: data.jobs,
    reviews,
    totalReviews,
    avgRating,
    ratingCounts,
    followersCount,
    isFollowed,
    mapData,
  });
};

const postCompanyReview = async (req, res) => {
  const { slug } = req.params;
  const company = await Employer.findOne({
    slug,
    status: EMPLOYER_STATUS.ACTIVE,
    deletedAt: null,
  });

  if (!company) {
    req.flash("error", "Công ty không tồn tại.");
    return res.redirect("/companies");
  }

  if (!req.user) {
    req.flash("error", "Vui lòng đăng nhập (Ứng viên hoặc Doanh nghiệp) để gửi đánh giá.");
    return res.redirect(`/companies/${slug}`);
  }

  const { rating, title, pros, cons } = req.body;
  const numRating = Number(rating);

  if (!numRating || numRating < 1 || numRating > 5) {
    req.flash("error", "Vui lòng chọn số sao đánh giá (1 - 5 sao).");
    return res.redirect(`/companies/${slug}#review-section`);
  }

  if (!title || !title.trim()) {
    req.flash("error", "Vui lòng nhập tiêu đề đánh giá.");
    return res.redirect(`/companies/${slug}#review-section`);
  }

  let authorRole = "candidate";
  let authorName = "Thành viên VN.ITJobs";
  let authorCandidateId = null;
  let authorEmployerId = null;

  if (req.role === "employer") {
    authorRole = "employer";
    authorName = req.user.companyName || "Đối tác doanh nghiệp";
    authorEmployerId = req.user._id;
  } else if (req.role === "candidate") {
    authorRole = "candidate";
    authorName = req.user.fullName || "Ứng viên";
    authorCandidateId = req.user._id;
  }

  // Bộ lọc từ khóa nhạy cảm cơ bản
  const badWords = ["lừa đảo", "chó", "mất dạy", "đụ", "dm", "đm", "vcl"];
  const fullContent = `${title} ${pros || ""} ${cons || ""}`.toLowerCase();
  const hasToxic = badWords.some((w) => fullContent.includes(w));

  const review = new Review({
    employerId: company._id,
    authorRole,
    authorCandidateId,
    authorEmployerId,
    authorName,
    rating: numRating,
    title: title.trim(),
    pros: pros ? pros.trim() : "",
    cons: cons ? cons.trim() : "",
    isApproved: !hasToxic,
  });

  await review.save();

  if (hasToxic) {
    req.flash("success", "Đánh giá của bạn đã được ghi nhận và đang chờ quản trị viên duyệt nội dung.");
  } else {
    req.flash("success", "Cảm ơn bạn đã gửi đánh giá công ty thành công!");
  }

  res.redirect(`/companies/${slug}#review-section`);
};

const postSubmitFeedback = async (req, res) => {
  try {
    const { type, rating, title, content, url, contactEmail, contactName } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập nội dung phản hồi." });
    }

    const feedback = new Feedback({
      type: ["bug", "rating", "suggestion"].includes(type) ? type : "bug",
      rating: rating ? Number(rating) : null,
      title: title ? title.trim() : "",
      content: content.trim(),
      url: url || "",
      contactEmail: contactEmail ? contactEmail.trim() : (req.user ? req.user.email : ""),
      contactName: contactName ? contactName.trim() : (req.user ? (req.user.fullName || req.user.companyName) : ""),
      userRole: req.role || "guest",
      userId: req.user ? req.user._id : null,
      status: "new",
    });

    await feedback.save();
    return res.json({
      success: true,
      message: "Cảm ơn bạn đã gửi phản hồi / báo cáo sự cố! Ban Quản trị VN.ITJobs đã tiếp nhận.",
    });
  } catch (err) {
    console.error("Lỗi gửi feedback:", err.message);
    return res.status(500).json({ success: false, message: "Không thể gửi phản hồi: " + err.message });
  }
};

// Lưu lịch sử rate-limit gửi chat hỗ trợ (chống spam)
const chatRateLimitMap = new Map();

const postChatAssistant = async (req, res) => {
  try {
    const ip = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
    const now = Date.now();
    const userWindow = chatRateLimitMap.get(ip) || [];
    const recentRequests = userWindow.filter((ts) => now - ts < 60 * 1000);

    if (recentRequests.length >= 25) {
      return res.status(429).json({
        success: false,
        message: "Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi một lát rồi thử lại nhé!",
      });
    }

    recentRequests.push(now);
    chatRateLimitMap.set(ip, recentRequests);

    // Dọn dẹp bộ nhớ định kỳ nếu Map quá lớn
    if (chatRateLimitMap.size > 5000) {
      for (const [k, v] of chatRateLimitMap.entries()) {
        if (v.every((ts) => now - ts > 60 * 1000)) chatRateLimitMap.delete(k);
      }
    }

    const { message, history } = req.body;
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập nội dung câu hỏi." });
    }

    const cleanMessage = message.trim().slice(0, 500);
    const safeHistory = Array.isArray(history)
      ? history.slice(-6).map((h) => ({
          role: h.role === "user" ? "user" : "assistant",
          text: String(h.text || "").slice(0, 500),
        }))
      : [];

    const reply = await chatWithSupportAssistant({
      message: cleanMessage,
      history: safeHistory,
      userRole: req.role || "guest",
      userName: req.user ? (req.user.fullName || req.user.companyName) : "",
    });

    return res.json({
      success: true,
      reply,
    });
  } catch (err) {
    console.error("Lỗi xử lý chat trợ lý:", err.message);
    return res.status(500).json({
      success: false,
      message: "Có lỗi khi xử lý tin nhắn của bạn: " + err.message,
    });
  }
};

const renderJobDetails = async (req, res) => {
  const data = await getJobDetails(req.params.slug);
  if (!data) {
    return res.status(404).render("pages/index", {
      title: "Không tìm thấy việc làm",
      flash: { error: "Việc làm này không tồn tại hoặc đã ngừng tuyển dụng." },
    });
  }

  // Tăng lượt xem thực tế cho tin tuyển dụng (Recruitment Analytics)
  Job.updateOne({ _id: data.job._id }, { $inc: { viewsCount: 1 } }).catch(() => {});

  const mapData = getCompanyMapData(data.job.employerId, data.job);

  res.render("pages/job-details", {
    title: `${data.job.title} - ${data.job.employerId.companyName}`,
    job: data.job,
    company: data.job.employerId,
    companyJobCount: data.companyJobCount,
    mapData,
  });
};

const postApplyJob = async (req, res) => {
  const { slug } = req.params;
  const job = await Job.findOne({
    slug,
    employerActive: true,
    moderation: JOB_MODERATION.VISIBLE,
    deletedAt: null,
  });

  if (!job) {
    req.flash("error", "Việc làm này không tồn tại hoặc đã ngừng tuyển dụng.");
    return res.redirect("/");
  }

  // Kiểm tra nộp trùng
  const existingApp = await Application.findOne({
    jobId: job._id,
    candidateId: req.user._id,
  });

  if (existingApp) {
    req.flash("error", "Bạn đã ứng tuyển công việc này rồi.");
    return res.redirect(`/jobs/${slug}`);
  }

  const { fullName, email, phone, applyType } = req.body;
  if (!fullName || !fullName.trim() || !email || !email.trim() || !phone || !phone.trim()) {
    req.flash("error", "Vui lòng điền đầy đủ họ tên, email và số điện thoại.");
    return res.redirect(`/jobs/${slug}`);
  }

  let cvData;

  if (applyType === "it_profile") {
    // Ứng tuyển nhanh bằng hồ sơ IT Profile trực tuyến
    const candidate = await Candidate.findById(req.user._id);
    const profile = candidate ? candidate.itProfile : null;
    const hasProfile = profile && (profile.title || (profile.skills && profile.skills.length > 0));

    if (!hasProfile) {
      req.flash("error", "Hồ sơ IT Profile của bạn chưa có thông tin. Vui lòng cập nhật IT Profile hoặc tải lên file PDF.");
      return res.redirect(`/candidate/it-profile`);
    }

    try {
      const pdfBuffer = await generateItProfilePdf(candidate, job.title);
      const safeName = `IT_Profile_${(candidate.fullName || "Candidate").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      cvData = await saveCvBuffer(pdfBuffer, safeName);
    } catch (err) {
      req.flash("error", "Không thể tạo file CV từ hồ sơ IT Profile: " + err.message);
      return res.redirect(`/jobs/${slug}`);
    }
  } else {
    // Ứng tuyển bằng file CV tải lên từ máy tính
    if (!req.file) {
      req.flash("error", "Vui lòng tải lên file CV định dạng PDF hoặc chọn ứng tuyển bằng IT Profile.");
      return res.redirect(`/jobs/${slug}`);
    }

    try {
      cvData = await uploadCV(req.file);
    } catch (err) {
      req.flash("error", err.message || "File CV không đúng định dạng PDF hợp lệ.");
      return res.redirect(`/jobs/${slug}`);
    }
  }

  try {
    await Application.create({
      jobId: job._id,
      employerId: job.employerId,
      candidateId: req.user._id,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      cv: {
        key: cvData.key,
        originalName: cvData.originalName || (req.file ? req.file.originalname : "CV.pdf"),
        size: cvData.size || (req.file ? req.file.size : 0),
      },
      viewed: false,
      status: "pending",
    });

    // Tạo thông báo In-App cho Nhà tuyển dụng
    const { createNotification } = require("../../services/notification.service");
    createNotification({
      recipientId: job.employerId,
      recipientType: "employer",
      title: "Ứng viên mới nộp hồ sơ",
      message: `${fullName.trim()} vừa ứng tuyển vào vị trí "${job.title}".`,
      link: "/employer/cvs",
      type: "application_new",
    }).catch(() => {});
  } catch (err) {
    if (err.code === 11000) {
      req.flash("error", "Bạn đã ứng tuyển công việc này rồi.");
      return res.redirect(`/jobs/${slug}`);
    }
    throw err;
  }

  req.flash("success", "Nộp hồ sơ ứng tuyển thành công! Nhà tuyển dụng sẽ sớm liên hệ với bạn.");
  res.redirect(`/jobs/${slug}`);
};

const getSearchSuggestions = async (req, res) => {
  const { q } = req.query;
  const data = await getAutocompleteSuggestions(q || "", 6);
  res.json(data);
};

module.exports = {
  renderIndex,
  renderSearch,
  renderCompanyList,
  renderCompanyDetails,
  postCompanyReview,
  postSubmitFeedback,
  postChatAssistant,
  renderJobDetails,
  postApplyJob,
  getSearchSuggestions,
  renderAbout,
  renderContact,
  renderPrivacy,
  renderDocs,
  wantsMarkdown,
};
