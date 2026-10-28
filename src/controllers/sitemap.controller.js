// src/controllers/sitemap.controller.js
const { Job, Employer, Article } = require("../models");
const { JOB_MODERATION, EMPLOYER_STATUS } = require("../config/constants");

const BASE_URL = "https://tuyen-dung-it.vercel.app";

async function renderSitemap(req, res) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");

  const today = new Date().toISOString().split("T")[0];

  const staticUrls = [
    { loc: `${BASE_URL}/`, priority: "1.0", changefreq: "daily", lastmod: today },
    { loc: `${BASE_URL}/search`, priority: "0.9", changefreq: "hourly", lastmod: today },
    { loc: `${BASE_URL}/companies`, priority: "0.8", changefreq: "daily", lastmod: today },
    { loc: `${BASE_URL}/salary`, priority: "0.8", changefreq: "weekly", lastmod: today },
    { loc: `${BASE_URL}/blog`, priority: "0.8", changefreq: "daily", lastmod: today },
    { loc: `${BASE_URL}/about`, priority: "0.7", changefreq: "monthly", lastmod: "2026-10-28" },
    { loc: `${BASE_URL}/contact`, priority: "0.7", changefreq: "monthly", lastmod: "2026-10-28" },
    { loc: `${BASE_URL}/privacy`, priority: "0.7", changefreq: "monthly", lastmod: "2026-10-28" },
    { loc: `${BASE_URL}/docs`, priority: "0.7", changefreq: "weekly", lastmod: "2026-10-28" },
    { loc: `${BASE_URL}/llms.txt`, priority: "0.7", changefreq: "weekly", lastmod: "2026-10-28" },
    { loc: `${BASE_URL}/openapi.json`, priority: "0.6", changefreq: "weekly", lastmod: "2026-10-28" },
  ];

  let dynamicUrls = [];

  try {
    const [jobs, employers, articles] = await Promise.all([
      Job.find({
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
        deletedAt: null,
      })
        .select("slug updatedAt")
        .sort({ updatedAt: -1 })
        .limit(200)
        .lean(),

      Employer.find({ status: EMPLOYER_STATUS.ACTIVE })
        .select("slug updatedAt")
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean(),

      Article.find({ status: "published" })
        .select("slug updatedAt")
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean(),
    ]);

    (jobs || []).forEach((j) => {
      dynamicUrls.push({
        loc: `${BASE_URL}/jobs/${j.slug}`,
        priority: "0.8",
        changefreq: "daily",
        lastmod: (j.updatedAt || new Date()).toISOString().split("T")[0],
      });
    });

    (employers || []).forEach((e) => {
      dynamicUrls.push({
        loc: `${BASE_URL}/companies/${e.slug}`,
        priority: "0.7",
        changefreq: "weekly",
        lastmod: (e.updatedAt || new Date()).toISOString().split("T")[0],
      });
    });

    (articles || []).forEach((a) => {
      dynamicUrls.push({
        loc: `${BASE_URL}/blog/${a.slug}`,
        priority: "0.6",
        changefreq: "monthly",
        lastmod: (a.updatedAt || new Date()).toISOString().split("T")[0],
      });
    });
  } catch (err) {
    console.warn("⚠️ Sitemap database query fallback:", err.message);
  }

  const allUrls = [...staticUrls, ...dynamicUrls];

  const xmlEntries = allUrls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join("\n");

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`;

  return res.send(sitemapXml);
}

module.exports = {
  renderSitemap,
};
