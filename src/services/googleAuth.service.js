// src/services/googleAuth.service.js
const crypto = require("crypto");
const env = require("../config/env");
const isSafeRedirect = require("../utils/sanitizeRedirect");

const OAUTH_STATE_COOKIE = "itj_oauth_state";
const isProd = env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

/**
 * Kiểm tra xem ứng dụng đã được cấu hình Google OAuth Client hay chưa
 */
function isGoogleConfigured() {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_ID.trim() &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_CLIENT_SECRET.trim()
  );
}

/**
 * Sinh cryptographic nonce gắn với trình duyệt (cookie HttpOnly) để chống OAuth Login CSRF
 */
function createOAuthState(role, next = "/", res = null) {
  const nonce = crypto.randomBytes(32).toString("hex");
  const safeNext = isSafeRedirect(next) ? next : "/";

  if (res && typeof res.cookie === "function") {
    res.cookie(OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60 * 1000, // 10 phút
    });
  }

  return Buffer.from(JSON.stringify({ role, next: safeNext, nonce })).toString("base64url");
}

/**
 * Xác thực state trả về từ Google callback khớp với cookie nonce của phiên hiện tại (timing-safe)
 */
function verifyOAuthState(rawState, expectedRole, req, res = null, defaultNext = "/") {
  const cookieNonce = req?.cookies?.[OAUTH_STATE_COOKIE];

  if (res && typeof res.clearCookie === "function") {
    res.clearCookie(OAUTH_STATE_COOKIE, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
    });
  }

  if (
    !rawState ||
    typeof rawState !== "string" ||
    !cookieNonce ||
    typeof cookieNonce !== "string"
  ) {
    return { valid: false, next: defaultNext };
  }

  try {
    const decoded = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8"));
    if (
      !decoded ||
      decoded.role !== expectedRole ||
      typeof decoded.nonce !== "string" ||
      decoded.nonce.length !== cookieNonce.length
    ) {
      return { valid: false, next: defaultNext };
    }

    const expectedBuf = Buffer.from(cookieNonce, "utf8");
    const actualBuf = Buffer.from(decoded.nonce, "utf8");
    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return { valid: false, next: defaultNext };
    }

    const safeNext = isSafeRedirect(decoded.next) ? decoded.next : defaultNext;
    return { valid: true, next: safeNext };
  } catch {
    return { valid: false, next: defaultNext };
  }
}

/**
 * Xây dựng URL chuyển hướng sang Google OAuth Consent Screen
 */
function getGoogleAuthUrl(role, next = "/", req = null, res = null) {
  if (!isGoogleConfigured()) return null;

  const redirectUri = getCallbackUrl(role, req);
  const state = createOAuthState(role, next || "/", res);

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID.trim(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Tính toán URL callback động theo host và giao thức
 */
function getCallbackUrl(role, req) {
  if (env.GOOGLE_CALLBACK_URL && env.GOOGLE_CALLBACK_URL.trim()) {
    const base = env.GOOGLE_CALLBACK_URL.trim().replace(/\/+$/, "");
    return `${base}/${role}/auth/google/callback`;
  }

  if (req) {
    let rawProto = req.protocol || "http";
    if (env.TRUST_PROXY && req.headers && req.headers["x-forwarded-proto"]) {
      rawProto = String(req.headers["x-forwarded-proto"]).split(",")[0].trim().toLowerCase();
    }
    const proto = rawProto === "https" ? "https" : "http";
    const host = req.get("host");
    return `${proto}://${host}/${role}/auth/google/callback`;
  }

  return `http://localhost:${env.PORT || 3000}/${role}/auth/google/callback`;
}

/**
 * Đổi authorization code lấy access_token từ Google
 */
async function exchangeCodeForTokens(code, redirectUri) {
  const tokenUrl = "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID.trim(),
    client_secret: env.GOOGLE_CLIENT_SECRET.trim(),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Token Error: ${response.status} - ${errText}`);
  }

  return response.json();
}

/**
 * Lấy thông tin tài khoản người dùng từ Google userinfo endpoint
 */
async function fetchGoogleUserInfo(accessToken) {
  const userinfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";
  const response = await fetch(userinfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google UserInfo Error: ${response.status} - ${errText}`);
  }

  return response.json();
}

module.exports = {
  OAUTH_STATE_COOKIE,
  isGoogleConfigured,
  createOAuthState,
  verifyOAuthState,
  getGoogleAuthUrl,
  getCallbackUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
};
