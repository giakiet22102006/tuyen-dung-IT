// src/middlewares/flash.middleware.js
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
    // Xóa cookie flash sau khi đọc
    res.clearCookie("itj_flash");
  }

  res.locals.flash = flashData;

  req.flash = (type, message) => {
    const current = { [type]: message };
    res.cookie("itj_flash", JSON.stringify(current), {
      httpOnly: true,
      signed: true,
      sameSite: "lax",
      maxAge: 60 * 1000, // 1 phút
    });
  };

  next();
}

module.exports = flashMiddleware;
