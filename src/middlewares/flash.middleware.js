// src/middlewares/flash.middleware.js
const env = require("../config/env");

const isProd = env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

/**
 * Flash message qua signed cookie, tồn tại trong 1 request
 * Không sử dụng session server-side
 */
function flashMiddleware(req, res, next) {
  let flashData = { success: null, error: null };

  if (req.signedCookies && req.signedCookies.itj_flash) {
    try {
      flashData = JSON.parse(req.signedCookies.itj_flash);
    } catch (e) {
      flashData = { success: null, error: null };
    }
    // Xóa cookie flash sau khi đọc với tùy chọn đồng bộ
    res.clearCookie("itj_flash", {
      httpOnly: true,
      secure: isProd,
      signed: true,
      sameSite: "lax",
      path: "/",
    });
  }

  res.locals.flash = flashData;

  req.flash = (type, message) => {
    const current = { [type]: message };
    res.cookie("itj_flash", JSON.stringify(current), {
      httpOnly: true,
      secure: isProd,
      signed: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 1000, // 1 phút
    });
  };

  next();
}

module.exports = flashMiddleware;
