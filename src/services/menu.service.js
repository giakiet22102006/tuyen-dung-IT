// src/services/menu.service.js
const NodeCache = require("node-cache");
const { Skill, Employer, Job } = require("../models");
const { CITIES, EMPLOYER_STATUS, JOB_MODERATION } = require("../config/constants");

// Cache TTL 300 giây (5 phút)
const menuCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const CACHE_KEY = "global_menu_data";

async function getMenuData() {
  const cached = menuCache.get(CACHE_KEY);
  if (cached) return cached;

  try {
    // 1. Top 5 Skills có nhiều job nhất (hoặc 5 skills đầu)
    const skills = await Skill.find({}).limit(5).select("name slug").lean();

    // 2. Top 5 Công ty hàng đầu (active, có nhiều job nhất)
    const topEmployers = await Employer.find({
      status: EMPLOYER_STATUS.ACTIVE,
      deletedAt: null,
    })
      .limit(5)
      .select("companyName slug logo")
      .lean();

    // 3. Top 3 Thành phố chính
    const mainCities = CITIES.filter((c) => c.value !== "khac").slice(0, 3);

    const menuData = {
      skills,
      topEmployers,
      cities: mainCities,
    };

    menuCache.set(CACHE_KEY, menuData);
    return menuData;
  } catch (err) {
    console.error("Lỗi lấy dữ liệu menu:", err);
    return {
      skills: [],
      topEmployers: [],
      cities: CITIES.slice(0, 3),
    };
  }
}

function clearMenuCache() {
  menuCache.del(CACHE_KEY);
}

module.exports = {
  getMenuData,
  clearMenuCache,
};
