// src/services/auth.service.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const env = require("../config/env");

const JWT_ALGORITHM = "HS256";
const MAX_JWT_LENGTH = 4096;

/**
 * Tạo JWT token cho Candidate hoặc Employer
 * Payload gồm: id, role ('candidate' | 'employer'), tv (tokenVersion)
 */
function signUserToken(user, role, extra = {}) {
  const payload = {
    id: user._id.toString(),
    role,
    tv: extra.tv !== undefined ? extra.tv : (user.tokenVersion || 0),
    ...extra,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: "7d",
  });
}

/**
 * Tạo JWT token riêng cho Admin
 * Payload gồm: id, role ('superadmin' | 'admin'), tv (tokenVersion)
 */
function signAdminToken(admin) {
  return jwt.sign(
    {
      id: admin._id.toString(),
      role: admin.role,
      tv: admin.tokenVersion || 0,
    },
    env.ADMIN_JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: "1d",
    }
  );
}

/**
 * Giải mã token của User (ghim cứng thuật toán HS256 chống algorithm confusion)
 */
function verifyUserToken(token) {
  if (!token || typeof token !== "string" || token.length > MAX_JWT_LENGTH) {
    return null;
  }
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  } catch (err) {
    return null;
  }
}

/**
 * Giải mã token của Admin (ghim cứng thuật toán HS256 chống algorithm confusion)
 */
function verifyAdminToken(token) {
  if (!token || typeof token !== "string" || token.length > MAX_JWT_LENGTH) {
    return null;
  }
  try {
    return jwt.verify(token, env.ADMIN_JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  } catch (err) {
    return null;
  }
}

/**
 * Mã hóa mật khẩu bằng bcrypt (cost 12)
 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 12);
}

/**
 * So khớp mật khẩu
 */
async function comparePassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = {
  signUserToken,
  signAdminToken,
  verifyUserToken,
  verifyAdminToken,
  hashPassword,
  comparePassword,
};
