// src/services/notification.service.js
const { Notification } = require("../models");

/**
 * Tạo thông báo mới trong hệ thống
 */
async function createNotification({ recipientId, recipientType, title, message, link = "#", type = "system" }) {
  try {
    if (!recipientId || !recipientType || !title || !message) {
      return null;
    }
    const notif = await Notification.create({
      recipientId,
      recipientType,
      title,
      message,
      link,
      type,
      isRead: false,
    });
    return notif;
  } catch (err) {
    console.error("❌ Lỗi tạo thông báo:", err.message);
    return null;
  }
}

/**
 * Lấy danh sách thông báo của người dùng
 */
async function getNotifications(recipientId, recipientType, limit = 15) {
  try {
    return await Notification.find({
      recipientId,
      recipientType,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  } catch (err) {
    console.error("❌ Lỗi lấy thông báo:", err.message);
    return [];
  }
}

/**
 * Đếm số lượng thông báo chưa đọc
 */
async function getUnreadCount(recipientId, recipientType) {
  try {
    return await Notification.countDocuments({
      recipientId,
      recipientType,
      isRead: false,
    });
  } catch (err) {
    return 0;
  }
}

/**
 * Đánh dấu một thông báo là đã đọc
 */
async function markAsRead(notificationId, recipientId) {
  try {
    return await Notification.findOneAndUpdate(
      { _id: notificationId, recipientId },
      { isRead: true },
      { new: true }
    );
  } catch (err) {
    return null;
  }
}

/**
 * Đánh dấu tất cả thông báo là đã đọc
 */
async function markAllAsRead(recipientId, recipientType) {
  try {
    await Notification.updateMany(
      { recipientId, recipientType, isRead: false },
      { isRead: true }
    );
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
