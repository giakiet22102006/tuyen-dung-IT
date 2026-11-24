// src/controllers/ai/ai.controller.js
const fs = require("fs");
const mongoose = require("mongoose");
const { Job, Application, Employer, Candidate } = require("../../models");
const aiService = require("../../services/ai.service");
const { getCVPath, checkPdf } = require("../../services/storage.service");

/**
 * 1. AI CV Match & Gap Analysis (Candidate / Public)
 */
const postMatchCv = async (req, res) => {
  try {
    const { jobId, cvText: directCvText } = req.body;
    if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: "Mã việc làm (jobId) không hợp lệ." });
    }

    if (directCvText !== undefined && typeof directCvText !== "string") {
      return res.status(400).json({ success: false, message: "Dữ liệu văn bản CV không hợp lệ." });
    }
    if (typeof directCvText === "string" && directCvText.trim().length > 20000) {
      return res.status(400).json({ success: false, message: "Nội dung CV vượt quá giới hạn cho phép (tối đa 20.000 ký tự)." });
    }

    const job = await Job.findById(jobId).lean();
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
    return res.status(500).json({ success: false, message: "Lỗi xử lý AI: " + err.message });
  }
};

/**
 * 2. AI Interview Prep (Candidate / Public)
 */
const postInterviewPrep = async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: "Mã việc làm (jobId) không hợp lệ." });
    }

    const job = await Job.findById(jobId).lean();
    if (!job) {
      return res.status(404).json({ success: false, message: "Không tìm thấy việc làm yêu cầu." });
    }

    const result = await aiService.generateInterviewPrep(job);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("AI postInterviewPrep error:", err);
    return res.status(500).json({ success: false, message: "Lỗi xử lý AI: " + err.message });
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
      title,
      position: position || "middle",
      skills: skillsArray,
      workingForm: workingForm || "office",
      city: city || "hanoi",
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("AI postGenerateJobDescription error:", err);
    return res.status(500).json({ success: false, message: "Lỗi xử lý AI: " + err.message });
  }
};

/**
 * 4. AI CV Screening & Executive Summary (Employer)
 */
const postScreenCv = async (req, res) => {
  try {
    const applicationId = req.params.applicationId || req.body.applicationId;
    if (!applicationId) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin applicationId." });
    }

    const application = await Application.findOne({
      _id: applicationId,
      employerId: req.user._id,
      hiddenByEmployer: false,
    }).populate("jobId");

    if (!application) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hồ sơ ứng tuyển của bạn." });
    }

    let cvText = "";
    if (application.cv && application.cv.key) {
      const cvFilePath = getCVPath(application.cv.key);
      if (cvFilePath && fs.existsSync(cvFilePath)) {
        const buffer = await fs.promises.readFile(cvFilePath);
        cvText = await aiService.extractTextFromPdf(buffer);
      }
    }

    if (!cvText) {
      // Fallback: Tạo text tổng hợp từ thông tin ứng viên
      cvText = `Họ tên: ${application.fullName}. Email: ${application.email}. Số điện thoại: ${application.phone}. Vị trí ứng tuyển: ${application.jobId ? application.jobId.title : ""}`;
    }

    const result = await aiService.screenAndSummarizeCv(cvText, application.jobId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("AI postScreenCv error:", err);
    return res.status(500).json({ success: false, message: "Lỗi xử lý AI: " + err.message });
  }
};

/**
 * 5. AI Job Scam & Policy Moderation (Admin)
 */
const postModerateJob = async (req, res) => {
  try {
    const jobId = req.params.jobId || req.body.jobId;
    let jobData = null;

    if (jobId && jobId !== "custom" && require("mongoose").isValidObjectId(jobId)) {
      jobData = await Job.findById(jobId).populate("employerId").lean();
    }
    if (!jobData && req.body && (req.body.title || req.body.description)) {
      jobData = req.body;
    }

    if (!jobData) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thông tin tin tuyển dụng." });
    }

    const result = await aiService.moderateJobContent(jobData);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("AI postModerateJob error:", err);
    return res.status(500).json({ success: false, message: "Lỗi xử lý AI: " + err.message });
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
    return res.status(500).json({ success: false, message: "Lỗi xử lý AI: " + err.message });
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
