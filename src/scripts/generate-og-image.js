const sharp = require("sharp");
const path = require("path");

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#000055" />
      <stop offset="50%" stop-color="#000071" />
      <stop offset="100%" stop-color="#0A2668" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0088FF" />
      <stop offset="100%" stop-color="#9FDB7C" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)" />

  <!-- Grid decoration lines -->
  <circle cx="1050" cy="150" r="300" fill="#0088FF" opacity="0.08" />
  <circle cx="150" cy="500" r="250" fill="#9FDB7C" opacity="0.05" />

  <!-- Badge -->
  <rect x="100" y="90" width="340" height="46" rx="23" fill="#ffffff" fill-opacity="0.12" stroke="#0088FF" stroke-width="2" />
  <text x="130" y="120" font-family="sans-serif" font-size="18" font-weight="700" fill="#9FDB7C">🚀 NỀN TẢNG TUYỂN DỤNG IT 2026</text>

  <!-- Brand Title -->
  <text x="100" y="240" font-family="sans-serif" font-size="84" font-weight="900" fill="#FFFFFF" letter-spacing="-1">VN.ITJobs</text>
  
  <!-- Subtitle -->
  <text x="100" y="320" font-family="sans-serif" font-size="36" font-weight="700" fill="url(#accent)">Việc làm Developer &amp; Nhân tài Công nghệ số 1 Việt Nam</text>

  <!-- Description -->
  <text x="100" y="390" font-family="sans-serif" font-size="22" font-weight="400" fill="#DEDEDE">Kết nối 100.000+ kỹ sư phần mềm với hàng nghìn công ty công nghệ hàng đầu.</text>
  <text x="100" y="425" font-family="sans-serif" font-size="22" font-weight="400" fill="#DEDEDE">So khớp hồ sơ thông minh bằng AI, tra cứu lương chuẩn xác và bảo mật tuyệt đối.</text>

  <!-- Features pills -->
  <rect x="100" y="490" width="280" height="56" rx="12" fill="#ffffff" fill-opacity="0.1" stroke="#ffffff" stroke-opacity="0.2" />
  <text x="130" y="526" font-family="sans-serif" font-size="19" font-weight="600" fill="#FFFFFF">⚡ AI Resume Matching</text>

  <rect x="410" y="490" width="270" height="56" rx="12" fill="#ffffff" fill-opacity="0.1" stroke="#ffffff" stroke-opacity="0.2" />
  <text x="440" y="526" font-family="sans-serif" font-size="19" font-weight="600" fill="#FFFFFF">💰 Tra Cứu Lương IT</text>

  <rect x="710" y="490" width="300" height="56" rx="12" fill="#ffffff" fill-opacity="0.1" stroke="#ffffff" stroke-opacity="0.2" />
  <text x="740" y="526" font-family="sans-serif" font-size="19" font-weight="600" fill="#FFFFFF">🏢 1.200+ Doanh Nghiệp</text>
</svg>
`;

async function main() {
  const dest = path.join(__dirname, "../../public/assets/images/og-image.png");
  await sharp(Buffer.from(svg)).png().toFile(dest);
  console.log("Successfully generated:", dest);
}

main().catch(console.error);
