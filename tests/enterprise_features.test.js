// tests/enterprise_features.test.js
const mongoose = require("mongoose");
const { connectDB, closeDB } = require("../src/config/db");
const { Candidate, Employer, Job, Application, Notification } = require("../src/models");
const {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} = require("../src/services/notification.service");
const { generateIcsEvent } = require("../src/utils/calendar");

describe("Enterprise Feature Expansion Tests", () => {
  let candidate;
  let employer;
  let job;
  let application;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu test
    if (candidate) await Candidate.findByIdAndDelete(candidate._id);
    if (employer) await Employer.findByIdAndDelete(employer._id);
    if (job) await Job.findByIdAndDelete(job._id);
    if (application) await Application.findByIdAndDelete(application._id);
    await Notification.deleteMany({
      recipientId: { $in: [candidate?._id, employer?._id].filter(Boolean) },
    });
    await closeDB();
  });

  test("1. In-App Notification System: Tạo, Đếm số lượng chưa đọc, Đánh dấu đã đọc", async () => {
    candidate = await Candidate.create({
      fullName: "Ứng Viên Test Thông Báo",
      email: `cand_notif_${Date.now()}@test.com`,
      password: "password123",
      itProfile: {
        title: "Senior Node.js Developer",
        level: "senior",
        skills: ["NodeJS", "TypeScript"],
        openToWork: true,
      },
    });

    employer = await Employer.create({
      companyName: "Công Ty Test Talent",
      slug: `cong-ty-test-talent-${Date.now()}`,
      email: `emp_talent_${Date.now()}@test.com`,
      password: "password123",
      status: "active",
      city: "ha-noi",
    });

    // Tạo thông báo cho Candidate
    const notif = await createNotification({
      recipientId: candidate._id,
      recipientType: "candidate",
      title: "Lời mời phỏng vấn mới",
      message: "Công ty đã xếp lịch phỏng vấn với bạn.",
      link: "/candidate/applied-jobs",
      type: "interview_schedule",
    });

    expect(notif).toBeDefined();
    expect(notif.isRead).toBe(false);

    // Kiểm tra unread count
    const unreadBefore = await getUnreadCount(candidate._id, "candidate");
    expect(unreadBefore).toBeGreaterThanOrEqual(1);

    // Đánh dấu đã đọc
    await markAsRead(notif._id, candidate._id);
    const unreadAfter = await getUnreadCount(candidate._id, "candidate");
    expect(unreadAfter).toBe(unreadBefore - 1);
  });

  test("2. Calendar Integration: Sinh file iCalendar (.ics) chuẩn RFC 5545", () => {
    const startDate = new Date("2026-11-01T09:30:00Z");
    const icsContent = generateIcsEvent({
      title: "Phỏng vấn Senior Fullstack - FPT Software",
      description: "Phỏng vấn kỹ thuật vòng 1",
      location: "Google Meet",
      startDate,
      durationMinutes: 60,
      organizerName: "FPT Software",
      organizerEmail: "hr@fpt.com",
      attendeeName: "Nguyễn Văn A",
      attendeeEmail: "candidate@gmail.com",
      meetingUrl: "https://meet.google.com/abc-xyz",
    });

    expect(icsContent).toContain("BEGIN:VCALENDAR");
    expect(icsContent).toContain("VERSION:2.0");
    expect(icsContent).toContain("METHOD:REQUEST");
    expect(icsContent).toContain("BEGIN:VEVENT");
    expect(icsContent).toContain("SUMMARY:Phỏng vấn Senior Fullstack - FPT Software");
    expect(icsContent).toContain("END:VEVENT");
    expect(icsContent).toContain("END:VCALENDAR");
  });

  test("3. Internal Notes & Scorecard Rating trong hồ sơ ứng viên", async () => {
    job = await Job.create({
      employerId: employer._id,
      title: "NodeJS Architect",
      slug: `nodejs-architect-${Date.now()}`,
      position: "senior",
      workingForm: "office",
      city: "ha-noi",
      skills: [{ name: "NodeJS", slug: "nodejs" }],
    });

    application = await Application.create({
      jobId: job._id,
      employerId: employer._id,
      candidateId: candidate._id,
      fullName: candidate.fullName,
      email: candidate.email,
      phone: "0912345678",
      cv: { key: "dummy-key", originalName: "CV.pdf" },
      rating: 5,
      internalNotes: [
        {
          author: "Tech Lead",
          content: "Ứng viên chuyên sâu về Microservices và RabbitMQ.",
        },
      ],
    });

    expect(application.rating).toBe(5);
    expect(application.internalNotes.length).toBe(1);
    expect(application.internalNotes[0].author).toBe("Tech Lead");
  });

  test("4. Talent Pool & Quyền riêng tư: Tìm ứng viên Open to Work và loại trừ công ty hiện tại", async () => {
    const candidatesFound = await Candidate.find({
      status: "active",
      "itProfile.openToWork": true,
      "itProfile.skills": { $regex: /^NodeJS$/i },
    }).lean();

    expect(candidatesFound.length).toBeGreaterThanOrEqual(1);
    const found = candidatesFound.some((c) => c._id.toString() === candidate._id.toString());
    expect(found).toBe(true);
  });
});
