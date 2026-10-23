// src/controllers/client/notification.controller.js
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} = require("../../services/notification.service");

/**
 * Lấy danh sách thông báo và số lượng chưa đọc
 */
const getNotificationsApi = async (req, res) => {
  if (!req.user || !req.role) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(req.user._id, req.role, 20),
    getUnreadCount(req.user._id, req.role),
  ]);

  return res.json({
    success: true,
    notifications,
    unreadCount,
  });
};

/**
 * Đánh dấu một thông báo đã đọc
 */
const markReadApi = async (req, res) => {
  if (!req.user || !req.role) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }

  const { id } = req.params;
  await markAsRead(id, req.user._id);

  const unreadCount = await getUnreadCount(req.user._id, req.role);
  return res.json({ success: true, unreadCount });
};

/**
 * Đánh dấu tất cả thông báo đã đọc
 */
const markAllReadApi = async (req, res) => {
  if (!req.user || !req.role) {
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
  }

  await markAllAsRead(req.user._id, req.role);
  return res.json({ success: true, unreadCount: 0 });
};

module.exports = {
  getNotificationsApi,
  markReadApi,
  markAllReadApi,
};
