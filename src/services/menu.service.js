// src/services/menu.service.js
const NodeCache = require("node-cache");
const { Skill, Employer, Job } = require("../models");
const { CITIES, EMPLOYER_STATUS, JOB_MODERATION } = require("../config/constants");

// Cache TTL 1800 giây (30 phút)
const menuCache = new NodeCache({ stdTTL: 1800, checkperiod: 120 });
const CACHE_KEY = "global_menu_data";

async function getMenuData() {
  const cached = menuCache.get(CACHE_KEY);
  if (cached) return cached;

  try {
    // Truy vấn song song Skills và Employers (giảm 50% thời gian)
    const [skills, topEmployers] = await Promise.all([
      Skill.find({}).limit(5).select("name slug").lean(),
      Employer.find({
        status: EMPLOYER_STATUS.ACTIVE,
        deletedAt: null,
      })
        .limit(5)
        .select("companyName slug logo")
        .lean(),
    ]);

    // Top 3 Thành phố chính
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
      skills: [
        { name: "ReactJS", slug: "reactjs" },
        { name: "NodeJS", slug: "nodejs" },
        { name: "Javascript", slug: "javascript" },
        { name: "HTML5", slug: "html5" },
        { name: "CSS3", slug: "css3" },
      ],
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
