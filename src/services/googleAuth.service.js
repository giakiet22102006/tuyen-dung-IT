// src/services/googleAuth.service.js
const env = require("../config/env");

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
 * Xây dựng URL chuyển hướng sang Google OAuth Consent Screen
 */
function getGoogleAuthUrl(role, next = "/", req = null) {
  if (!isGoogleConfigured()) return null;

  const redirectUri = getCallbackUrl(role, req);
  const state = Buffer.from(JSON.stringify({ role, next: next || "/" })).toString("base64url");

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
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
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
  isGoogleConfigured,
  getGoogleAuthUrl,
  getCallbackUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
};
