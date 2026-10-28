// src/models/setting.model.js
const mongoose = require("mongoose");

const defaultAbout = {
  title: "Về chúng tôi - VN.ITJobs",
  subtitle:
    "Sứ mệnh kết nối tinh hoa công nghệ Việt Nam với các cơ hội nghề nghiệp bứt phá toàn cầu.",
  overviewParagraph1:
    "Được thành lập từ năm 2024, **VN.ITJobs** tự hào là nền tảng tuyển dụng công nghệ thông tin chuyên biệt và tiên phong tại Việt Nam. Chúng tôi xây dựng một hệ sinh thái việc làm số minh bạch, nơi các kỹ sư phần mềm, kiến trúc sư hệ thống, chuyên gia AI, DevOps và an toàn thông tin có thể tiếp cận những cơ hội nghề nghiệp xứng tầm.",
  overviewParagraph2:
    "Khác biệt với các nền tảng tuyển dụng chung chung, VN.ITJobs tập trung sâu vào đặc thù ngành công nghệ với hệ thống phân loại hơn 50+ kỹ năng lập trình (ReactJS, NodeJS, Golang, Python, AI/LLM, Cloud Kubernetes) cùng bộ lọc mức lương thực tế và đánh giá văn hóa doanh nghiệp chuẩn xác.",
  vision:
    "Trở thành trung tâm kết nối nhân tài công nghệ số 1 Đông Nam Á, hỗ trợ chuyển đổi số quốc gia và nâng cao vị thế của kỹ sư lập trình Việt Nam trên bản đồ công nghệ thế giới.",
  mission:
    "Giúp mọi lập trình viên tìm được công việc mơ ước với mức đãi ngộ xứng đáng, đồng thời hỗ trợ các doanh nghiệp công nghệ chiêu mộ đúng người, đúng thời điểm nhờ công nghệ trí tuệ nhân tạo (AI Matching) tiên tiến.",
  statsJobs: "880+",
  statsJobsLabel: "Việc làm IT mở hàng ngày",
  statsCompanies: "1.200+",
  statsCompaniesLabel: "Doanh nghiệp công nghệ đối tác",
  statsCandidates: "150.000+",
  statsCandidatesLabel: "Kỹ sư IT tin tưởng sử dụng",
  companyName: "Công ty Cổ phần Công nghệ VN.ITJobs Việt Nam (VN.ITJobs Technology JSC)",
  businessCode: "Số 0109988776 do Sở Kế hoạch và Đầu tư Thành phố Hà Nội cấp.",
  headOffice:
    "Tầng 12, Tòa nhà Keangnam Landmark 72, Đường Phạm Hùng, Phường Mễ Trì, Quận Nam Từ Liêm, TP. Hà Nội.",
  branchOffice:
    "Tầng 6, Bitexco Financial Tower, Số 2 Hải Triều, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh.",
  email: "contact@vn-itjobs.com",
  hotline: "+84-24-3768-9999",
};

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "system_settings",
      index: true,
    },
    about: {
      title: { type: String, default: defaultAbout.title },
      subtitle: { type: String, default: defaultAbout.subtitle },
      overviewParagraph1: { type: String, default: defaultAbout.overviewParagraph1 },
      overviewParagraph2: { type: String, default: defaultAbout.overviewParagraph2 },
      vision: { type: String, default: defaultAbout.vision },
      mission: { type: String, default: defaultAbout.mission },
      statsJobs: { type: String, default: defaultAbout.statsJobs },
      statsJobsLabel: { type: String, default: defaultAbout.statsJobsLabel },
      statsCompanies: { type: String, default: defaultAbout.statsCompanies },
      statsCompaniesLabel: { type: String, default: defaultAbout.statsCompaniesLabel },
      statsCandidates: { type: String, default: defaultAbout.statsCandidates },
      statsCandidatesLabel: { type: String, default: defaultAbout.statsCandidatesLabel },
      companyName: { type: String, default: defaultAbout.companyName },
      businessCode: { type: String, default: defaultAbout.businessCode },
      headOffice: { type: String, default: defaultAbout.headOffice },
      branchOffice: { type: String, default: defaultAbout.branchOffice },
      email: { type: String, default: defaultAbout.email },
      hotline: { type: String, default: defaultAbout.hotline },
    },
  },
  {
    timestamps: true,
  }
);

let cachedSettings = null;

settingSchema.statics.clearCache = function () {
  cachedSettings = null;
};

settingSchema.statics.getSettings = async function () {
  if (cachedSettings) return cachedSettings;
  let doc = await this.findOne({ key: "system_settings" });
  if (!doc) {
    try {
      doc = await this.create({ key: "system_settings", about: defaultAbout });
    } catch {
      doc = await this.findOne({ key: "system_settings" });
    }
  }
  cachedSettings = doc || { key: "system_settings", about: { ...defaultAbout } };
  return cachedSettings;
};

const Setting = mongoose.model("Setting", settingSchema);

module.exports = {
  Setting,
  defaultAbout,
};
