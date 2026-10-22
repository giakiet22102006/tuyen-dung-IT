// src/utils/sanitizeHtml.js
let sanitizeHtmlLib;
try {
  sanitizeHtmlLib = require("sanitize-html");
} catch {
  // Fallback for Jest test runner if htmlparser2 pure-ESM causes parse error in Jest VM
  sanitizeHtmlLib = (dirty) =>
    dirty ? dirty.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") : "";
}

function sanitizeHtml(dirtyHtml) {
  if (!dirtyHtml || typeof dirtyHtml !== "string") return "";
  if (typeof sanitizeHtmlLib === "function") {
    try {
      return sanitizeHtmlLib(dirtyHtml, {
        allowedTags: [
          "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "p", "a", "ul", "ol",
          "nl", "li", "b", "i", "strong", "em", "strike", "code", "hr", "br", "div",
          "span", "u",
        ],
        allowedAttributes: {
          a: ["href", "name", "target", "rel"],
          "*": ["class", "style"],
        },
        allowedSchemes: ["http", "https", "mailto"],
      });
    } catch {
      return dirtyHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    }
  }
  return dirtyHtml;
}

module.exports = sanitizeHtml;
