// src/utils/sanitizeHtml.js
let sanitizeHtmlLib = null;
try {
  sanitizeHtmlLib = require("sanitize-html");
} catch {
  // Trong Jest CJS VM, htmlparser2 (pure ESM) có thể không require trực tiếp được;
  // khi đó sử dụng bộ lọc allowlist tuyến tính O(N) nghiêm ngặt bên dưới (tuyệt đối không dùng regex chỉ xóa <script>).
  sanitizeHtmlLib = null;
}

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "p", "a", "ul", "ol",
  "nl", "li", "b", "i", "strong", "em", "strike", "code", "hr", "br", "div",
  "span", "u",
];
const ALLOWED_TAGS_SET = new Set(ALLOWED_TAGS);
const VOID_TAGS_SET = new Set(["br", "hr"]);
// Các thẻ nguy hiểm cần loại bỏ luôn toàn bộ nội dung bên trong
const DROP_CONTENT_TAGS_SET = new Set([
  "script", "style", "iframe", "object", "embed", "svg", "math",
  "noscript", "template", "textarea", "title", "xmp",
]);
const SAFE_REL_TOKENS = new Set(["noopener", "noreferrer", "nofollow"]);

function escapeHtmlEntities(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeNumericAndNamedEntities(str) {
  return String(str)
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&#([0-9]+);?/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n")
    .replace(/&amp;/gi, "&");
}

/**
 * Kiểm tra href an toàn: chỉ cho phép http:, https:, mailto:, anchor # hoặc đường dẫn nội bộ bắt đầu bằng 1 dấu '/'
 */
function isSafeHref(rawHref) {
  if (!rawHref || typeof rawHref !== "string") return false;
  const decoded = decodeNumericAndNamedEntities(rawHref)
    // Loại bỏ ký tự điều khiển và khoảng trắng ẩn dùng để lách scheme (vd: java\tscript:)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0020\u007F]/g, "");

  if (!decoded) return false;
  if (decoded.startsWith("#")) return true;
  if (decoded.startsWith("/")) {
    return !decoded.startsWith("//") && !decoded.startsWith("/\\");
  }

  try {
    const parsed = new URL(decoded);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Bộ lọc HTML allowlist tuyến tính O(N) dự phòng khi chạy trong môi trường VM không nạp được ESM parser.
 * Đảm bảo hành vi bảo mật đồng nhất: loại bỏ toàn bộ style/class tùy ý, event handler on*, javascript:/data: URI,
 * đóng gói chống Reverse Tabnabbing (rel="noopener noreferrer") và chống ReDoS / mXSS thẻ mở dở.
 */
function strictFallbackSanitize(dirty) {
  // Xóa HTML comments
  const withoutComments = dirty.replace(/<!--[\s\S]*?-->/g, "");
  const len = withoutComments.length;
  let out = "";
  let i = 0;

  while (i < len) {
    const lt = withoutComments.indexOf("<", i);
    if (lt === -1) {
      out += withoutComments.slice(i);
      break;
    }

    if (lt > i) {
      out += withoutComments.slice(i, lt);
    }

    const gt = withoutComments.indexOf(">", lt + 1);
    if (gt === -1) {
      const trailing = withoutComments.slice(lt + 1);
      // Nếu là thẻ HTML mở dở dang cuối chuỗi (vd: <img src=x onerror=alert(1)) -> loại bỏ hẳn như htmlparser2;
      // nếu chỉ là dấu so sánh văn bản thường (vd: lương < 2000$) -> giữ lại dạng &lt; an toàn
      if (!/^[a-zA-Z!?/]/.test(trailing)) {
        out += "&lt;" + escapeHtmlEntities(trailing);
      }
      break;
    }

    const rawTagBody = withoutComments.slice(lt + 1, gt).trim();
    if (!rawTagBody || rawTagBody.startsWith("!") || rawTagBody.startsWith("?")) {
      i = gt + 1;
      continue;
    }

    const isClosing = rawTagBody.startsWith("/");
    const tagContent = isClosing ? rawTagBody.slice(1).trim() : rawTagBody;
    const nameMatch = tagContent.match(/^([a-zA-Z0-9]+)/);
    if (!nameMatch) {
      out += "&lt;" + escapeHtmlEntities(rawTagBody) + "&gt;";
      i = gt + 1;
      continue;
    }

    const tagName = nameMatch[1].toLowerCase();

    // Nếu là thẻ nguy hiểm chứa mã thực thi / style -> nhảy qua tới tận thẻ đóng tương ứng
    if (!isClosing && DROP_CONTENT_TAGS_SET.has(tagName)) {
      const lowerRemaining = withoutComments.toLowerCase();
      const closeNeedle = `</${tagName}`;
      const closeIdx = lowerRemaining.indexOf(closeNeedle, gt + 1);
      if (closeIdx === -1) {
        break;
      }
      const closeEnd = withoutComments.indexOf(">", closeIdx + closeNeedle.length);
      i = closeEnd === -1 ? len : closeEnd + 1;
      continue;
    }

    if (!ALLOWED_TAGS_SET.has(tagName)) {
      i = gt + 1;
      continue;
    }

    if (isClosing) {
      if (!VOID_TAGS_SET.has(tagName)) {
        out += `</${tagName}>`;
      }
      i = gt + 1;
      continue;
    }

    if (VOID_TAGS_SET.has(tagName)) {
      out += `<${tagName} />`;
      i = gt + 1;
      continue;
    }

    if (tagName !== "a") {
      // Toàn bộ thẻ định dạng văn bản chỉ giữ tên thẻ sạch, loại bỏ mọi thuộc tính (style, class, on*, id...)
      out += `<${tagName}>`;
      i = gt + 1;
      continue;
    }

    // Riêng thẻ <a>: chỉ trích xuất href, target, rel hợp lệ
    const attrSegment = tagContent.slice(nameMatch[0].length);
    const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    const extracted = {};
    let m;
    while ((m = attrRegex.exec(attrSegment)) !== null) {
      const attrName = m[1].toLowerCase();
      const attrVal = m[2] ?? m[3] ?? m[4] ?? "";
      if (attrName === "href" || attrName === "target" || attrName === "rel") {
        extracted[attrName] = attrVal;
      }
    }

    const safeAttrs = [];
    if (extracted.href && isSafeHref(extracted.href)) {
      safeAttrs.push(`href="${escapeHtmlEntities(extracted.href.trim())}"`);
    }
    if (extracted.target === "_blank") {
      safeAttrs.push(`target="_blank"`);
      safeAttrs.push(`rel="noopener noreferrer"`);
    } else {
      if (extracted.target === "_self") {
        safeAttrs.push(`target="_self"`);
      }
      if (extracted.rel) {
        const safeRel = extracted.rel
          .split(/\s+/)
          .map((t) => t.toLowerCase())
          .filter((t) => SAFE_REL_TOKENS.has(t))
          .join(" ");
        if (safeRel) {
          safeAttrs.push(`rel="${safeRel}"`);
        }
      }
    }

    out += safeAttrs.length > 0 ? `<a ${safeAttrs.join(" ")}>` : "<a>";
    i = gt + 1;
  }

  return out;
}

const SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  // Loại bỏ hoàn toàn style và class tùy ý trên '*' để chặn CSS Injection / UI Redressing / Phishing overlay
  allowedAttributes: {
    a: ["href", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: (tagName, attribs) => {
      const safeAttribs = {};
      if (attribs.href && isSafeHref(attribs.href)) {
        safeAttribs.href = attribs.href.trim();
      }
      if (attribs.target === "_blank") {
        safeAttribs.target = "_blank";
        safeAttribs.rel = "noopener noreferrer";
      } else {
        if (attribs.target === "_self") {
          safeAttribs.target = "_self";
        }
        if (attribs.rel) {
          const safeRel = attribs.rel
            .split(/\s+/)
            .map((t) => t.toLowerCase())
            .filter((t) => SAFE_REL_TOKENS.has(t))
            .join(" ");
          if (safeRel) safeAttribs.rel = safeRel;
        }
      }
      return { tagName, attribs: safeAttribs };
    },
  },
};

function sanitizeHtml(dirtyHtml) {
  if (!dirtyHtml || typeof dirtyHtml !== "string") return "";
  if (typeof sanitizeHtmlLib === "function") {
    try {
      return sanitizeHtmlLib(dirtyHtml, SANITIZE_OPTIONS);
    } catch {
      return strictFallbackSanitize(dirtyHtml);
    }
  }
  return strictFallbackSanitize(dirtyHtml);
}

sanitizeHtml.strictFallbackSanitize = strictFallbackSanitize;
module.exports = sanitizeHtml;
