// src/controllers/ai/ai.controller.js
const { Job, Application, Employer, Candidate } = require("../../models");
const { JOB_MODERATION } = require("../../config/constants");
const aiService = require("../../services/ai.service");
const { checkPdf, ensureCVBuffer } = require("../../services/storage.service");
const { isValidObjectId } = require("../../utils/securityHelpers");
const env = require("../../config/env");

function formatAiError(err) {
  return env.NODE_ENV === "production"
    ? "Đã xảy ra lỗi khi xử lý yêu cầu AI. Vui lòng thử lại sau."
    : "Lỗi xử lý AI: " + err.message;
}

/**
 * 1. AI CV Match & Gap Analysis (Candidate / Public)
 */
const postMatchCv = async (req, res) => {
  try {
    const { jobId, cvText: directCvText } = req.body;
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: "Mã việc làm (jobId) không hợp lệ." });
    }

    if (directCvText !== undefined && typeof directCvText !== "string") {
      return res.status(400).json({ success: false, message: "Dữ liệu văn bản CV không hợp lệ." });
    }
    if (typeof directCvText === "string" && directCvText.trim().length > 20000) {
      return res.status(400).json({ success: false, message: "Nội dung CV vượt quá giới hạn cho phép (tối đa 20.000 ký tự)." });
    }

    // Chỉ cho phép khớp CV với tin tuyển dụng đang hiển thị công khai (không lộ tin ẩn/đã xóa)
    const job = await Job.findOne({
      _id: jobId,
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
      deletedAt: null,
    }).lean();
    if (!job) {
      return res.status(404).json({ success: false, message: "Không tìm thấy việc làm yêu cầu." });
    }

    let cvText = directCvText || "";
    if (req.file && req.file.buffer) {
      const isValidPdf = await checkPdf(req.file.buffer);
      if (!isValidPdf) {
        return res.status(400).json({
          success: false,
          message: "File CV không đúng định dạng PDF hợp lệ hoặc chứa nội dung không an toàn.",
        });
      }
      const extracted = await aiService.extractTextFromPdf(req.file.buffer);
      if (extracted) {
        cvText = extracted.slice(0, 20000);
      }
    }

    if (!cvText || cvText.trim().length < 20) {
      return res.status(400).json({
        success: false,
        message: "Không thể đọc nội dung từ file CV hoặc nội dung quá ngắn. Vui lòng thử tải lên file PDF hợp lệ hoặc dán nội dung CV.",
      });
    }

    const result = await aiService.matchCvWithJob(cvText, job);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("AI postMatchCv error:", err);
    return res.status(500).json({ success: false, message: formatAiError(err) });
  }
};

/**
 * 2. AI Interview Prep (Candidate / Public)
 */
const postInterviewPrep = async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!isValidObjectId(jobId)) {
      return res.status(400).json({ success: false, message: "Mã việc làm (jobId) không hợp lệ." });
    }

    const job = await Job.findOne({
      _id: jobId,
      employerActive: true,
      moderation: JOB_MODERATION.VISIBLE,
      deletedAt: null,
    }).lean();
    if (!job) {
      return res.status(404).json({ success: false, message: "Không tìm thấy việc làm yêu cầu." });
    }

    const result = await aiService.generateInterviewPrep(job);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("AI postInterviewPrep error:", err);
    return res.status(500).json({ success: false, message: formatAiError(err) });
  }
};

/**
 * 3. AI Smart Job Description Generator (Employer)
 */
const postGenerateJobDescription = async (req, res) => {
  try {
    const { title, position, skills, workingForm, city } = req.body;
    if (!title || typeof title !== "string" || title.trim().length < 3 || title.trim().length > 200) {
      return res.status(400).json({ success: false, message: "Tiêu đề công việc phải từ 3 đến 200 ký tự." });
    }

    const skillsArray = skills
      ? (Array.isArray(skills) ? skills : String(skills).split(","))
          .slice(0, 20)
          .map((s) => ({ name: String(s).trim().slice(0, 50) }))
          .filter((s) => s.name)
      : [];

    const result = await aiService.generateJobDescription({
      title: title.trim(),
      position: typeof position === "string" ? position.trim().slice(0, 40) : "middle",
      skills: skillsArray,
      workingForm: typeof workingForm === "string" ? workingForm.trim().slice(0, 40) : "office",
      city: typeof city === "string" ? city.trim().slice(0, 40) : "hanoi",
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("AI postGenerateJobDescription error:", err);
    return res.status(500).json({ success: false, message: formatAiError(err) });
  }
};

/**
 * 4. AI CV Screening & Executive Summary (Employer)
 */
const postScreenCv = async (req, res) => {
  try {
    const applicationId = req.params.applicationId || req.body.applicationId;
    if (!isValidObjectId(applicationId)) {
      return res.status(400).json({ success: false, message: "Mã hồ sơ (applicationId) không hợp lệ." });
    }

    const application = await Application.findOne({
      _id: applicationId,
      employerId: req.user._id,
      hiddenByEmployer: false,
    }).populate("jobId");

    if (!application) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ ứng tuyển của bạn." });
    }

    // Đọc PDF thật (ổ đĩa/tmp → MongoDB StoredFile). Thiếu file thì báo lỗi rõ ràng (422),
    // tuyệt đối không gửi vài chữ họ tên cho AI rồi chấm ứng viên "10% - Không phù hợp".
    const buffer = await ensureCVBuffer(application.cv && application.cv.key);
    if (!buffer) {
      return res.status(422).json({
        success: false,
        code: "CV_FILE_MISSING",
        message: "Không tìm thấy file CV PDF của hồ sơ này trên hệ thống lưu trữ nên AI không thể sàng lọc. Vui lòng yêu cầu ứng viên nộp lại CV.",
      });
    }

    let cvText = "";
    try {
      cvText = (await aiService.extractTextFromPdf(buffer)) || "";
    } catch (parseErr) {
      console.warn("AI postScreenCv: không trích xuất được text PDF:", parseErr.message);
      cvText = "";
    }

    if (!cvText || cvText.trim().length < 20) {
      return res.status(422).json({
        success: false,
        code: "CV_TEXT_UNREADABLE",
        message: "Không đọc được nội dung chữ trong file CV (có thể là PDF dạng ảnh scan). AI chưa thể sàng lọc hồ sơ này — vui lòng xem trực tiếp file PDF.",
      });
    }

    const result = await aiService.screenAndSummarizeCv(cvText.slice(0, 20000), application.jobId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("AI postScreenCv error:", err);
    return res.status(500).json({ success: false, message: formatAiError(err) });
  }
};

/**
 * 5. AI Job Scam & Policy Moderation (Admin)
 */
const postModerateJob = async (req, res) => {
  try {
    const jobId = req.params.jobId || req.body.jobId;
    let jobData = null;

    if (jobId && jobId !== "custom" && isValidObjectId(jobId)) {
      jobData = await Job.findById(jobId).populate("employerId", "companyName slug city").lean();
    }
    if (!jobData && req.body && (req.body.title || req.body.description)) {
      jobData = {
        title: typeof req.body.title === "string" ? req.body.title.slice(0, 300) : "",
        description: typeof req.body.description === "string" ? req.body.description.slice(0, 10000) : "",
        salaryMin: req.body.salaryMin,
        salaryMax: req.body.salaryMax,
      };
    }

    if (!jobData) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thông tin tin tuyển dụng." });
    }

    const result = await aiService.moderateJobContent(jobData);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("AI postModerateJob error:", err);
    return res.status(500).json({ success: false, message: formatAiError(err) });
  }
};

/**
 * 6. AI Market Insights Report (Admin)
 */
const getMarketInsights = async (req, res) => {
  try {
    const [totalJobs, totalEmployers, totalCandidates, totalApplications, recentJobs] = await Promise.all([
      Job.countDocuments({ deletedAt: null }),
      Employer.countDocuments({ deletedAt: null }),
      Candidate.countDocuments({ deletedAt: null }),
      Application.countDocuments({ hiddenByEmployer: false }),
      Job.find({ deletedAt: null }).select("skills").limit(50).lean(),
    ]);

    // Trích xuất các skill xuất hiện nhiều nhất
    const skillCountMap = {};
    recentJobs.forEach((job) => {
      (job.skills || []).forEach((sk) => {
        if (sk && sk.name) {
          skillCountMap[sk.name] = (skillCountMap[sk.name] || 0) + 1;
        }
      });
    });

    const topSkillsList = Object.entries(skillCountMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name)
      .join(", ") || "ReactJS, NodeJS, Golang, Python, AWS, Docker";

    const insights = await aiService.generateMarketInsights({
      totalJobs,
      totalEmployers,
      totalCandidates,
      totalApplications,
      topSkillsList,
    });

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalJobs,
          totalEmployers,
          totalCandidates,
          totalApplications,
          topSkills: topSkillsList,
        },
        insights,
      },
    });
  } catch (err) {
    console.error("AI getMarketInsights error:", err);
    return res.status(500).json({ success: false, message: formatAiError(err) });
  }
};

module.exports = {
  postMatchCv,
  postInterviewPrep,
  postGenerateJobDescription,
  postScreenCv,
  postModerateJob,
  getMarketInsights,
};
