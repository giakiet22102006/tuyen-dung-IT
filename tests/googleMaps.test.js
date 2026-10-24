// tests/googleMaps.test.js
const { getCompanyMapData } = require("../src/utils/googleMaps");

describe("Google Maps Integration Tests", () => {
  test("1. Trả về null nếu công ty không tồn tại hoặc không có địa chỉ", () => {
    expect(getCompanyMapData(null)).toBeNull();
    expect(getCompanyMapData({})).toBeNull();
    expect(getCompanyMapData({ companyName: "Công ty Không Địa Chỉ", address: "" })).toBeNull();
    expect(getCompanyMapData({ companyName: "Công ty Không Địa Chỉ", address: "   " })).toBeNull();
  });

  test("2. Tự động sinh Embed URL và Search URL chuẩn xác khi có địa chỉ cụ thể", () => {
    const company = {
      companyName: "FPT Software",
      city: "ha-noi",
      address: "Tòa nhà FPT, Phố Duy Tân, Cầu Giấy",
    };

    const mapData = getCompanyMapData(company);
    expect(mapData).toBeDefined();
    expect(mapData.hasAddress).toBe(true);
    expect(mapData.fullAddress).toContain("Tòa nhà FPT, Phố Duy Tân, Cầu Giấy");
    expect(mapData.fullAddress).toContain("Hà Nội");

    // Embed URL
    expect(mapData.embedUrl).toContain("https://maps.google.com/maps?q=");
    expect(mapData.embedUrl).toContain("output=embed");
    expect(mapData.embedUrl).toContain(encodeURIComponent("FPT Software, Tòa nhà FPT, Phố Duy Tân, Cầu Giấy, Hà Nội"));

    // Search / Directions URL
    expect(mapData.searchUrl).toContain("https://www.google.com/maps/search/?api=1&query=");
  });

  test("3. Trích xuất đúng src từ mã Iframe do Nhà tuyển dụng dán vào", () => {
    const iframeSnippet = '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3724.096" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy"></iframe>';
    const company = {
      companyName: "Techcombank",
      city: "ha-noi",
      address: "6 Quang Trung, Hoàn Kiếm",
      googleMapsUrl: iframeSnippet,
    };

    const mapData = getCompanyMapData(company);
    expect(mapData).toBeDefined();
    expect(mapData.embedUrl).toBe("https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3724.096");
  });

  test("4. Ưu tiên địa chỉ của tin tuyển dụng (Job) nếu tin có địa chỉ làm việc cụ thể", () => {
    const company = {
      companyName: "VNG Corporation",
      city: "ho-chi-minh",
      address: "VNG Campus, Quận 7",
    };

    const job = {
      city: "da-nang",
      address: "Tầng 5, Tòa nhà ACB, 218 Bạch Đằng",
    };

    const mapData = getCompanyMapData(company, job);
    expect(mapData).toBeDefined();
    expect(mapData.fullAddress).toContain("Tầng 5, Tòa nhà ACB, 218 Bạch Đằng");
    expect(mapData.fullAddress).toContain("Đà Nẵng");
    expect(mapData.embedUrl).toContain(encodeURIComponent("VNG Corporation, Tầng 5, Tòa nhà ACB, 218 Bạch Đằng, Đà Nẵng"));
  });
});
