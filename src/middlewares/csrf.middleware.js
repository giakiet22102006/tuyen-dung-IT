// src/middlewares/csrf.middleware.js
const { doubleCsrf } = require("csrf-csrf");
const env = require("../config/env");

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => env.COOKIE_SECRET,
  cookieName: "itj_csrf",
  cookieOptions: {
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    httpOnly: true,
    path: "/",
  },
  size: 32,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  getCsrfTokenFromRequest: (req) => {
    return req.body?._csrf || req.headers["x-csrf-token"] || req.query?._csrf;
  },
  getSessionIdentifier: (req) => {
    return req.cookies?.itj_token || "anonymous";
  },
});

module.exports = {
  generateToken: generateCsrfToken,
  doubleCsrfProtection,
};
