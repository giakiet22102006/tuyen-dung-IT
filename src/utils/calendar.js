// src/utils/calendar.js
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

  const safeTitle = (title || "Lịch phỏng vấn").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const cleanDesc = (description || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

  const fullLocation = location || meetingUrl || "Online";

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
    `DESCRIPTION:${cleanDesc}${meetingUrl ? `\\nLink phỏng vấn: ${meetingUrl}` : ""}`,
    `LOCATION:${fullLocation.replace(/,/g, "\\,")}`,
    `ORGANIZER;CN=${(organizerName || "Nhà tuyển dụng").replace(/,/g, "\\,")}:mailto:${organizerEmail || "recruitment@vn-itjobs.com"}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${(attendeeName || "Ứng viên").replace(/,/g, "\\,")}:mailto:${attendeeEmail}`,
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
