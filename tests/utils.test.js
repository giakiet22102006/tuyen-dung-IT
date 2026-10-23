const slugify = require("../src/utils/slugify");
const normalizeVi = require("../src/utils/normalizeVi");
const formatSalary = require("../src/utils/formatSalary");
const paginate = require("../src/utils/pagination");

describe("Kiểm tra bộ tiện ích (Utils)", () => {
  test("normalizeVi: bỏ dấu và chuyển chữ thường chính xác", () => {
    expect(normalizeVi("Đà Nẵng & TP. Hồ Chí Minh")).toBe("da nang & tp. ho chi minh");
    expect(normalizeVi("Lập trình viên ReactJS Đẳng cấp")).toBe("lap trinh vien reactjs dang cap");
  });

  test("slugify: tạo slug URL chuẩn tiếng Việt", () => {
    expect(slugify("Đà Nẵng")).toBe("da-nang");
    expect(slugify("Lập trình viên Frontend (ReactJS/VueJS)")).toBe("lap-trinh-vien-frontend-reactjsvuejs");
    const withSuffix = slugify("Tuyển dụng NodeJS", true);
    expect(withSuffix).toMatch(/^tuyen-dung-nodejs-[a-f0-9]{6}$/);
  });

  test("formatSalary: hiển thị lương đúng chuẩn", () => {
    expect(formatSalary(1000, 1500)).toBe("1.000$ - 1.500$");
    expect(formatSalary(1000, null)).toBe("Từ 1.000$ (Thỏa thuận theo năng lực)");
    expect(formatSalary(null, 2000)).toBe("Tới 2.000$");
    expect(formatSalary(null, null)).toBe("Thương lượng");
    expect(formatSalary("", "")).toBe("Thương lượng");
  });

  test("paginate: tính toán phân trang chuẩn", () => {
    const p1 = paginate(25, 1, 10);
    expect(p1.totalPages).toBe(3);
    expect(p1.currentPage).toBe(1);
    expect(p1.skip).toBe(0);
    expect(p1.hasNext).toBe(true);
    expect(p1.hasPrev).toBe(false);

    const p3 = paginate(25, 3, 10);
    expect(p3.currentPage).toBe(3);
    expect(p3.skip).toBe(20);
    expect(p3.hasNext).toBe(false);
    expect(p3.hasPrev).toBe(true);
  });
});
