// src/utils/formatJobDescription.js
const sanitizeHtml = require("./sanitizeHtml");

/**
 * Format và chuẩn hóa nội dung mô tả công việc (Job Description)
 * Tự động chuyển đổi các đoạn văn bản / markdown / plain text chưa được định dạng
 * thành cấu trúc HTML chuẩn đẹp mắt: <h3> tiêu đề phân mục + <ul><li> từng gạch đầu dòng.
 */
function formatJobDescription(raw) {
  if (!raw || typeof raw !== "string") return "";

  let text = raw.trim();
  if (!text) return "";

  // Nếu đã chứa đầy đủ <ul> hoặc <ol>, chỉ cần làm sạch qua sanitizeHtml
  if (/<ul\b[^>]*>/i.test(text) || /<ol\b[^>]*>/i.test(text)) {
    return sanitizeHtml(text);
  }

  // Tiền xử lý: loại bỏ bọc markdown code block nếu có
  text = text.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

  // Regex tuyến tính O(N) (không dùng nested quantifier) sau khi đã tách sạch thẻ HTML ở bước so khớp
  const sectionHeaderRegex = /^(?:[-*•#]+\s*)?(Trách nhiệm công việc|Mô tả công việc|Nhiệm vụ chính|Công việc của bạn|Yêu cầu ứng viên|Yêu cầu công việc|Yêu cầu kỹ năng|Kỹ năng yêu cầu|Yêu cầu chuyên môn|Quyền lợi được hưởng|Quyền lợi ứng viên|Quyền lợi|Chế độ đãi ngộ|Phúc lợi nổi bật|Phúc lợi|Địa điểm làm việc|Thời gian làm việc|Thông tin chung|Về dự án)\s*:?$/i;

  // Tách từng dòng theo newline hoặc thẻ ngắt đoạn <p>, <br>, <div>
  const rawLines = text
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<div[^>]*>/gi, "")
    .split(/\r?\n/);

  let outputHtml = "";
  let inList = false;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].trim();
    if (!line) continue;

    // Loại bỏ markdown heading `#`, `##`, `###`
    const isMdHeading = line.startsWith("#");
    const cleanLine = line.replace(/^#{1,6}\s*/, "").trim();
    // Strip thẻ HTML bằng mẫu không chồng lấn tuyến tính trước khi kiểm tra tiêu đề (chống ReDoS)
    const plainLine = cleanLine.replace(/<[^>]*>/g, "").trim();

    // Kiểm tra xem dòng này có phải là tiêu đề phân mục không
    const isSectionHeader = isMdHeading || sectionHeaderRegex.test(plainLine) || (plainLine.endsWith(":") && plainLine.length <= 50 && !plainLine.startsWith("-") && !plainLine.startsWith("•"));

    if (isSectionHeader) {
      if (inList) {
        outputHtml += "</ul>\n";
        inList = false;
      }
      // Chuẩn hóa tiêu đề: bỏ dấu ":" ở cuối nếu có rồi thêm lại đồng nhất
      let headerText = plainLine.replace(/[:\s]+$/, "").trim();
      outputHtml += `<h3>${headerText}:</h3>\n`;
    } else {
      // Dòng nội dung chi tiết: loại bỏ gạch đầu dòng cũ (- , • , * , 1. )
      let itemContent = line.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, "").trim();
      if (!itemContent) continue;

      if (!inList) {
        outputHtml += "<ul>\n";
        inList = true;
      }
      outputHtml += `  <li>${itemContent}</li>\n`;
    }
  }

  if (inList) {
    outputHtml += "</ul>\n";
  }

  // Nếu không nhận diện được phân mục nào (văn bản thuần thông thường)
  if (!outputHtml) {
    outputHtml = `<p>${text}</p>`;
  }

  return sanitizeHtml(outputHtml);
}

module.exports = formatJobDescription;
