/**
 * Bọc controller function để bắt lỗi bất đồng bộ và chuyển cho errorHandler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
