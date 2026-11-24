// src/utils/calendar.js
const { safeUrl } = require("./securityHelpers");

/**
 * Escape văn bản chuẩn RFC 5545 để chống CRLF & iCalendar Property Injection
 */
function escapeIcsText(value, { allowNewlines = false } = {}) {
  let str = String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  str = allowNewlines ? str.replace(/\n/g, "\\n") : str.replace(/\n/g, " ");
  return str
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, "");
}

/**
 * Làm sạch tham số CN và địa chỉ email trong thuộc tính ORGANIZER/ATTENDEE (chặn tách dòng hoặc phá cú pháp ;)
 */
function sanitizeIcsParam(value, fallback = "") {
  const cleaned = String(value || fallback)
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n\u0000-\u001F\u007F":;,]/g, " ")
    .trim();
  return cleaned || fallback;
}

function sanitizeIcsEmail(value, fallback = "recruitment@vn-itjobs.com") {
  const cleaned = String(value || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\r\n\s\u0000-\u001F\u007F":;,<>]/g, "")
    .trim();
  return cleaned.includes("@") ? cleaned : fallback;
}

/**
 * Tạo nội dung file sự kiện iCalendar (.ics) chuẩn RFC 5545
 * Tương thích Google Calendar, Microsoft Outlook, Apple Calendar
 */
function generateIcsEvent({
  title,
  description,
  location,
  startDate,
  durationMinutes = 60,
  organizerName,
  organizerEmail,
  attendeeName,
  attendeeEmail,
  meetingUrl,
}) {
  const pad = (n) => (n < 10 ? "0" + n : n);
  const toIcsDate = (d) => {
    return (
      d.getUTCFullYear().toString() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z"
    );
  };

  const start = new Date(startDate);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const now = new Date();
  const uid = `interview-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@vn-itjobs.com`;

  const safeTitle = escapeIcsText(title || "Lịch phỏng vấn");
  const cleanDesc = escapeIcsText(description || "", { allowNewlines: true });
  const validMeetingUrl = safeUrl(meetingUrl);
  const fullLocation = escapeIcsText(location || validMeetingUrl || "Online");
  const safeOrganizerName = sanitizeIcsParam(organizerName, "Nhà tuyển dụng");
  const safeOrganizerEmail = sanitizeIcsEmail(organizerEmail, "recruitment@vn-itjobs.com");
  const safeAttendeeName = sanitizeIcsParam(attendeeName, "Ứng viên");
  const safeAttendeeEmail = sanitizeIcsEmail(attendeeEmail, "candidate@vn-itjobs.com");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VN.ITJobs//Recruitment Portal//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${safeTitle}`,
    `DESCRIPTION:${cleanDesc}${validMeetingUrl ? `\\nLink phỏng vấn: ${escapeIcsText(validMeetingUrl)}` : ""}`,
    `LOCATION:${fullLocation}`,
    `ORGANIZER;CN=${safeOrganizerName}:mailto:${safeOrganizerEmail}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${safeAttendeeName}:mailto:${safeAttendeeEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Nhắc lịch phỏng vấn trước 30 phút",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

module.exports = {
  generateIcsEvent,
};
