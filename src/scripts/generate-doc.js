// src/scripts/generate-doc.js
const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  LevelFormat,
} = require("docx");

async function generateDocx() {
  const primaryColor = "000065";
  const accentColor = "0088FF";
  const darkTextColor = "121212";
  const grayTextColor = "555555";
  const headerBgColor = "000065";
  const tableBorderColor = "DEDEDE";
  const zebraBgColor = "F8F9FA";

  function createHeading1(text) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 180 },
      children: [
        new TextRun({
          text,
          bold: true,
          size: 32, // 16pt
          color: primaryColor,
          font: "Arial",
        }),
      ],
    });
  }

  function createHeading2(text) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text,
          bold: true,
          size: 26, // 13pt
          color: accentColor,
          font: "Arial",
        }),
      ],
    });
  }

  function createHeading3(text) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 180, after: 80 },
      children: [
        new TextRun({
          text,
          bold: true,
          size: 22, // 11pt
          color: darkTextColor,
          font: "Arial",
        }),
      ],
    });
  }

  function createParagraph(text, isBold = false, isItalic = false) {
    return new Paragraph({
      spacing: { before: 60, after: 80, line: 276 },
      children: [
        new TextRun({
          text,
          bold: isBold,
          italics: isItalic,
          size: 22, // 11pt
          color: darkTextColor,
          font: "Arial",
        }),
      ],
    });
  }

  function createBullet(text, boldPrefix = "") {
    const children = [];
    if (boldPrefix) {
      children.push(
        new TextRun({
          text: boldPrefix + " ",
          bold: true,
          size: 22,
          color: darkTextColor,
          font: "Arial",
        })
      );
    }
    children.push(
      new TextRun({
        text,
        size: 22,
        color: darkTextColor,
        font: "Arial",
      })
    );
    return new Paragraph({
      bullet: { level: 0 },
      spacing: { before: 40, after: 40, line: 260 },
      children,
    });
  }

  function createCalloutBox(title, text) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        left: { style: BorderStyle.SINGLE, size: 24, color: accentColor },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: "F0F7FF" },
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "💡 " + title + ": ",
                      bold: true,
                      size: 22,
                      color: primaryColor,
                      font: "Arial",
                    }),
                    new TextRun({
                      text,
                      size: 22,
                      color: darkTextColor,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  }

  function createTable(headers, rowsData) {
    const borderStyle = { style: BorderStyle.SINGLE, size: 4, color: tableBorderColor };
    const borders = {
      top: borderStyle,
      bottom: borderStyle,
      left: borderStyle,
      right: borderStyle,
      insideHorizontal: borderStyle,
      insideVertical: borderStyle,
    };

    const headerRow = new TableRow({
      tableHeader: true,
      children: headers.map(
        (h) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: headerBgColor },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: h,
                    bold: true,
                    size: 20,
                    color: "FFFFFF",
                    font: "Arial",
                  }),
                ],
              }),
            ],
          })
      ),
    });

    const dataRows = rowsData.map((row, index) => {
      const isZebra = index % 2 === 1;
      return new TableRow({
        children: row.map(
          (cellText, colIndex) =>
            new TableCell({
              shading: isZebra ? { type: ShadingType.CLEAR, fill: zebraBgColor } : undefined,
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
              children: [
                new Paragraph({
                  alignment: colIndex === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                  children: [
                    new TextRun({
                      text: cellText,
                      size: 20,
                      color: darkTextColor,
                      font: "Arial",
                    }),
                  ],
                }),
              ],
            })
        ),
      });
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [headerRow, ...dataRows],
    });
  }

  const doc = new Document({
    creator: "VN.ITJobs Engineering Team",
    title: "Tài liệu Tổng kết Tính năng Hệ thống VN.ITJobs",
    description: "Tài liệu chi tiết chức năng cho từng nhóm người dùng: Ứng viên, Nhà tuyển dụng, Quản trị viên và Khách vãng lai",
    styles: {
      default: {
        document: {
          run: {
            font: "Arial",
            size: 22,
            color: darkTextColor,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children: [
          // Tiêu đề tài liệu
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 120 },
            children: [
              new TextRun({
                text: "HỆ THỐNG TUYỂN DỤNG CÔNG NGHỆ THÔNG TIN",
                bold: true,
                size: 24,
                color: accentColor,
                font: "Arial",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 60, after: 240 },
            children: [
              new TextRun({
                text: "VN.ITJOBS - BẢNG TỔNG HỢP CHỨC NĂNG CÁC PHÂN HỆ NGƯỜI DÙNG",
                bold: true,
                size: 34,
                color: primaryColor,
                font: "Arial",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 360 },
            children: [
              new TextRun({
                text: "Website: https://tuyen-dung-it.vercel.app | Phiên bản: 2.1 (Production)",
                italics: true,
                size: 20,
                color: grayTextColor,
                font: "Arial",
              }),
            ],
          }),

          createCalloutBox(
            "TỔNG QUAN HỆ THỐNG",
            "VN.ITJobs là nền tảng tuyển dụng việc làm IT trực tuyến chuyên sâu, cung cấp giải pháp kết nối tuyển dụng thông minh giữa Ứng viên ngành CNTT và các Doanh nghiệp công nghệ. Hệ thống được thiết kế theo kiến trúc MVC chuẩn mực trên nền Node.js / Express / MongoDB, tích hợp bảo mật đa lớp (Double CSRF, Rate Limiting, OTP verification, Helmet CSP) cùng công cụ tìm kiếm mờ Fuzzy Search & Typo Tolerance tối ưu."
          ),

          new Paragraph({ spacing: { before: 200, after: 100 } }),

          // PHẦN 1: BẢNG TỔNG KẾT MA TRẬN PHÂN QUYỀN
          createHeading1("1. MA TRẬN PHÂN QUYỀN VÀ PHẠM VI SỬ DỤNG (RBAC)"),
          createParagraph(
            "Hệ thống phân định rạch ròi 4 nhóm đối tượng người dùng với quyền hạn và không gian làm việc độc lập hoàn toàn:"
          ),
          createTable(
            ["STT", "Nhóm Người Dùng", "Phạm Vi Quyền Hạn", "Không Gian Làm Việc", "Điều Kiện Kích Hoạt"],
            [
              [
                "1",
                "Khách vãng lai (Guest)",
                "Xem trang chủ, tìm kiếm việc làm, xem chi tiết job, xem danh sách công ty, gợi ý từ khóa.",
                "Trang công khai (/)",
                "Không yêu cầu đăng nhập",
              ],
              [
                "2",
                "Ứng viên (Candidate)",
                "Tìm kiếm nâng cao, nộp hồ sơ PDF, quản lý danh sách việc làm đã nộp, theo dõi tiến độ, rút hồ sơ, quản lý hồ sơ cá nhân.",
                "Cổng Ứng viên (/candidate/*)",
                "Đăng ký + Xác thực mã OTP qua Gmail",
              ],
              [
                "3",
                "Nhà tuyển dụng (Employer)",
                "Quản lý hồ sơ công ty, đăng tin tuyển dụng, chỉnh sửa/xóa job, tiếp nhận và duyệt CV ứng viên, tải PDF bảo mật, cập nhật trạng thái tuyển dụng.",
                "Cổng Doanh nghiệp (/employer/*)",
                "Xác thực Gmail OTP + Admin duyệt kích hoạt",
              ],
              [
                "4",
                "Quản trị viên (Admin)",
                "Xem thống kê KPIs hệ thống, duyệt/khóa doanh nghiệp, quản lý ứng viên, giám sát Audit Logs bất biến, phân quyền Superadmin.",
                "Cổng Quản trị (/admin/*)",
                "Tài khoản Admin nội bộ có kiểm tra vai trò",
              ],
            ]
          ),

          new Paragraph({ spacing: { before: 200, after: 100 } }),

          // PHẦN 2: CHỨC NĂNG DÀNH CHO KHÁCH VÃNG LAI
          createHeading1("2. PHÂN HỆ KHÁCH VÃNG LAI & TRANG CÔNG KHAI"),
          createHeading2("2.1. Trang chủ (Home Page - /)"),
          createBullet(
            "Hiển thị số lượng việc làm IT thực tế đang tuyển dụng tại Việt Nam (có bộ đếm động từ MongoDB).",
            "• Thống kê việc làm:"
          ),
          createBullet(
            "Cho phép chọn nhanh thành phố (Hà Nội, Đà Nẵng, TP.HCM, Khác) và nhập từ khóa kỹ năng.",
            "• Thanh tìm kiếm trung tâm:"
          ),
          createBullet(
            "Tự động hiển thị dropdown gợi ý sau 200ms khi gõ từ khóa (ReactJS, Python, Frontend...); hỗ trợ sửa lỗi chính tả trực tiếp trên thanh tìm kiếm.",
            "• Gợi ý tức thì (Live Autocomplete):"
          ),
          createBullet(
            "Danh sách các tag kỹ năng hot nhất (ReactJS, NodeJS, JavaScript, Golang, DevOps...) click để xem nhanh việc làm.",
            "• Kỹ năng phổ biến:"
          ),
          createBullet(
            "Hiển thị 9 doanh nghiệp có số lượng việc làm mở nhiều nhất kèm logo, thành phố và số job đang tuyển (xử lý bằng batch aggregate không bị N+1).",
            "• Top Nhà tuyển dụng hàng đầu:"
          ),

          createHeading2("2.2. Trang Tìm kiếm Nâng cao (/search)"),
          createBullet(
            "Kết hợp cùng lúc 5 tiêu chí: Thành phố + Cấp bậc (Intern, Fresher, Junior, Middle, Senior, Manager) + Hình thức làm việc (Tại văn phòng, Từ xa, Linh hoạt) + Kỹ năng chuyên môn + Công ty cụ thể.",
            "• Bộ lọc đa chiều:"
          ),
          createBullet(
            "Tự động phát hiện lỗi chính tả (ví dụ: gõ 'pythn' tự động tìm 'python', 'fontend' tự động tìm 'frontend', 'recat' tự động tìm 'react') và hiển thị kết quả ngay mà không để trang bị trống.",
            "• Tìm kiếm mờ (Fuzzy Search & Typo Tolerance):"
          ),
          createBullet(
            "Hiển thị banner thông báo 'Có phải bạn muốn tìm: [Từ khóa gợi ý]?' kèm nút 'Vẫn tìm kiếm chính xác [Từ khóa cũ]' khi người dùng muốn giữ nguyên từ khóa.",
            "• Gợi ý Did You Mean:"
          ),
          createBullet(
            "Mỗi trang gồm 9 việc làm, bảo lưu chính xác toàn bộ tham số bộ lọc khi chuyển trang.",
            "• Phân trang thông minh:"
          ),

          createHeading2("2.3. Trang Chi tiết Việc làm (/jobs/:slug) & Doanh nghiệp (/companies)"),
          createBullet(
            "Xem đầy đủ tiêu đề, dải lương ($ min - $ max), cấp bậc, hình thức, tags kỹ năng, địa chỉ và mô tả công việc (đã xử lý an toàn chống mã độc XSS).",
            "• Chi tiết việc làm:"
          ),
          createBullet(
            "Xem thông tin công ty tuyển dụng, số lượng việc làm đang tuyển và form gửi CV trực tuyến.",
            "• Thông tin NTD:"
          ),
          createBullet(
            "Danh bạ toàn bộ các công ty CNTT uy tín trên nền tảng, có phân trang 9 công ty/trang.",
            "• Danh sách công ty:"
          ),
          createBullet(
            "Xem trang giới thiệu riêng của từng doanh nghiệp kèm toàn bộ danh sách các vị trí tuyển dụng của công ty đó.",
            "• Chi tiết công ty:"
          ),

          new Paragraph({ spacing: { before: 200, after: 100 } }),

          // PHẦN 3: CHỨC NĂNG DÀNH CHO ỨNG VIÊN
          createHeading1("3. PHÂN HỆ ỨNG VIÊN (CANDIDATE)"),
          createHeading2("3.1. Xác thực tài khoản & Kích hoạt qua Gmail"),
          createBullet(
            "Ứng viên điền Họ tên, Email, Mật khẩu, Số điện thoại. Tài khoản khởi tạo ở trạng thái chưa kích hoạt (isEmailVerified = false).",
            "• Đăng ký tài khoản (/candidate/signup):"
          ),
          createBullet(
            "Hệ thống tự sinh mã xác minh 6 số ngẫu nhiên, mã hóa bcrypt và gửi email kích hoạt chuyên nghiệp về hòm thư Gmail của ứng viên. Mã có hiệu lực trong 10 phút.",
            "• Kích hoạt OTP Gmail (/candidate/verify-registration):"
          ),
          createBullet(
            "Cho phép gửi lại mã OTP sau khoảng thời gian chờ, có cơ chế Rate Limiting chống spam gửi email liên tục.",
            "• Gửi lại OTP kích hoạt:"
          ),
          createBullet(
            "Hệ thống kiểm tra nghiêm ngặt: nếu tài khoản chưa xác thực Gmail sẽ bị chặn truy cập (HTTP 403) và tự động dẫn sang trang nhập mã kích hoạt.",
            "• Chặn đăng nhập khi chưa xác thực:"
          ),
          createBullet(
            "Nhập email -> nhận OTP 6 số qua Gmail -> xác minh OTP -> đặt mật khẩu mới an toàn.",
            "• Quên mật khẩu (/candidate/forgot-password):"
          ),
          createBullet(
            "Thay đổi mật khẩu trong tài khoản bằng cách nhập mật khẩu cũ và mật khẩu mới.",
            "• Đổi mật khẩu (/candidate/change-password):"
          ),

          createHeading2("3.2. Quản lý Hồ sơ Cá nhân (/candidate/profile)"),
          createBullet(
            "Xem họ tên, địa chỉ email đã xác thực, số điện thoại đăng ký và ngày tham gia hệ thống.",
            "• Xem hồ sơ:"
          ),
          createBullet(
            "Cập nhật họ và tên, số điện thoại liên lạc mới nhất.",
            "• Cập nhật thông tin:"
          ),

          createHeading2("3.3. Nộp Hồ sơ Ứng tuyển Trực tuyến (Job Application)"),
          createBullet(
            "Chỉ cần bấm 'Nộp hồ sơ ngay' tại trang chi tiết công việc, form tự động điền sẵn Họ tên, Email, SĐT của ứng viên.",
            "• Form nộp CV thuận tiện:"
          ),
          createBullet(
            "Chỉ chấp nhận file định dạng PDF chuẩn (kiểm tra nghiêm ngặt Magic Bytes bằng thư viện file-type, giới hạn tối đa 5MB). File được lưu trữ trong thư mục riêng tư bảo mật (storage/private/cv/), không public ra ngoài internet.",
            "• Tải file CV bảo mật:"
          ),
          createBullet(
            "Hệ thống áp dụng cơ chế khóa Unique Index (jobId, candidateId) trong Database. Mỗi ứng viên chỉ được nộp 1 lần cho cùng 1 công việc, tránh tình trạng spam nộp trùng hồ sơ.",
            "• Chống nộp trùng tuyệt đối:"
          ),

          createHeading2("3.4. Quản lý Việc làm Đã Ứng tuyển (/candidate/applied-jobs)"),
          createBullet(
            "Hiển thị chi tiết tất cả công việc đã nộp: Tên vị trí, Tên công ty, Mức lương, Ngày giờ nộp hồ sơ.",
            "• Danh sách hồ sơ đã gửi:"
          ),
          createBullet(
            "Theo dõi trực tiếp quá trình xét duyệt của Nhà tuyển dụng theo 5 cấp độ: Đang chờ duyệt (Pending), Đã xem hồ sơ (Reviewed), Mời phỏng vấn (Interviewed), Được tuyển dụng (Accepted), Chưa phù hợp (Rejected).",
            "• Theo dõi trạng thái thực tế:"
          ),
          createBullet(
            "Khi hồ sơ đang ở trạng thái 'Đang chờ duyệt' (pending), ứng viên có quyền bấm 'Rút hồ sơ'. Hồ sơ sẽ ẩn khỏi bảng điều khiển của ứng viên mà vẫn bảo đảm dữ liệu hệ thống toàn vẹn.",
            "• Rút hồ sơ ứng tuyển:"
          ),

          new Paragraph({ spacing: { before: 200, after: 100 } }),

          // PHẦN 4: CHỨC NĂNG DÀNH CHO NHÀ TUYỂN DỤNG
          createHeading1("4. PHÂN HỆ NHÀ TUYỂN DỤNG (EMPLOYER)"),
          createHeading2("4.1. Đăng ký & Quy trình Phê duyệt Doanh nghiệp"),
          createBullet(
            "Đăng ký thông tin công ty: Tên doanh nghiệp, Email tuyển dụng, Mật khẩu, Thành phố, Địa chỉ văn phòng.",
            "• Đăng ký doanh nghiệp (/employer/signup):"
          ),
          createBullet(
            "Gửi mã OTP 6 số về hòm thư Gmail của công ty để kích hoạt tài khoản ban đầu.",
            "• Xác thực email công ty:"
          ),
          createBullet(
            "Tài khoản sau khi kích hoạt email sẽ ở trạng thái 'pending'. Quản trị viên (Admin) sẽ kiểm tra thông tin pháp lý doanh nghiệp để duyệt kích hoạt (active).",
            "• Trạng thái Chờ duyệt (Pending):"
          ),
          createBullet(
            "Khi tài khoản đang ở trạng thái pending, hệ thống hiển thị banner cảnh báo và khóa quyền đăng tin tuyển dụng mới để chống spam tin rác.",
            "• Giới hạn quyền khi pending:"
          ),

          createHeading2("4.2. Quản lý Hồ sơ Doanh nghiệp (/employer/company-profile)"),
          createBullet(
            "Cập nhật Tên công ty, Website, Địa chỉ trụ sở, Giới thiệu văn hóa doanh nghiệp, chế độ đãi ngộ.",
            "• Thông tin công ty:"
          ),
          createBullet(
            "Tải lên logo thương hiệu (xử lý tự động cắt vuông, nén tối ưu và chống mã độc bằng thư viện Sharp).",
            "• Upload Logo:"
          ),

          createHeading2("4.3. Quản lý Tin Tuyển dụng (/employer/jobs)"),
          createBullet(
            "Xem toàn bộ danh sách các vị trí công ty đang tuyển dụng kèm số lượng CV ứng tuyển của từng job.",
            "• Bảng danh sách tin:"
          ),
          createBullet(
            "Nhập tiêu đề, cấp bậc (Intern -> Manager), hình thức (Văn phòng, Từ xa, Linh hoạt), dải lương ($ min - max), chọn tags kỹ năng, tải ảnh môi trường làm việc, soạn mô tả công việc (Rich Text an toàn).",
            "• Tạo tin tuyển dụng mới (/employer/jobs/create):"
          ),
          createBullet(
            "Chỉnh sửa nội dung tin tuyển dụng bất cứ lúc nào.",
            "• Chỉnh sửa tin tuyển dụng (/employer/jobs/:id/edit):"
          ),
          createBullet(
            "Xóa công việc bằng cơ chế Soft Delete (đánh dấu deletedAt), ẩn ngay khỏi trang tìm kiếm công khai nhưng không làm mất dữ liệu CV đã ứng tuyển trước đó.",
            "• Xóa tin tuyển dụng:"
          ),
          createBullet(
            "Hệ thống kiểm tra quyền sở hữu nghiêm ngặt ở tầng controller/middleware. Nhà tuyển dụng A tuyệt đối không thể xem, sửa hoặc xóa tin của Nhà tuyển dụng B.",
            "• Bảo mật cô lập đa khách thuê (Multi-tenancy):"
          ),

          createHeading2("4.4. Quản lý & Xét duyệt Hồ sơ Ứng viên (/employer/cvs)"),
          createBullet(
            "Xem danh sách toàn bộ ứng viên đã nộp CV vào tất cả các vị trí tuyển dụng của công ty.",
            "• Bảng quản lý CV tổng hợp:"
          ),
          createBullet(
            "Lọc CV theo từng vị trí tuyển dụng cụ thể hoặc lọc theo trạng thái duyệt hồ sơ.",
            "• Bộ lọc hồ sơ:"
          ),
          createBullet(
            "Hệ thống tự động chuyển trạng thái hồ sơ sang 'Đã xem' (reviewed) ngay khi NTD click vào xem hồ sơ.",
            "• Tự động đánh dấu đã xem:"
          ),
          createBullet(
            "Xem trực tiếp file CV PDF trong trình duyệt thông qua cơ chế Stream HTTP bảo mật từ thư mục riêng tư (chỉ NTD sở hữu tin tuyển dụng mới có quyền xem).",
            "• Đọc file CV PDF bảo mật (/employer/cvs/:id/pdf):"
          ),
          createBullet(
            "Chuyển trạng thái CV linh hoạt giữa các bước: Đang chờ duyệt -> Đã xem hồ sơ -> Mời phỏng vấn -> Được tuyển dụng -> Chưa phù hợp.",
            "• Cập nhật tiến độ ứng tuyển (/employer/cvs/:id/status):"
          ),
          createBullet(
            "Ẩn hoặc xóa hồ sơ ứng viên khỏi danh sách quản lý của doanh nghiệp.",
            "• Từ chối / Xóa hồ sơ:"
          ),

          new Paragraph({ spacing: { before: 200, after: 100 } }),

          // PHẦN 5: CHỨC NĂNG DÀNH CHO ADMIN
          createHeading1("5. PHÂN HỆ QUẢN TRỊ VIÊN HỆ THỐNG (ADMIN)"),
          createHeading2("5.1. Cổng Quản trị & Xác thực Đa tầng"),
          createBullet(
            "Đường dẫn quản trị tùy biến qua biến môi trường ADMIN_PATH giúp ẩn cổng quản trị khỏi sự dò quét của hacker.",
            "• URL quản trị bảo mật:"
          ),
          createBullet(
            "Phân tách 2 cấp độ: Administrator (Quản trị viên) và Super Administrator (Quản trị viên cấp cao).",
            "• Phân quyền 2 cấp độ:"
          ),
          createBullet(
            "Chặn đăng nhập ngay lập tức đối với tài khoản quản trị viên bị vô hiệu hóa (status: inactive).",
            "• Kiểm soát phiên đăng nhập:"
          ),

          createHeading2("5.2. Bảng điều khiển Thống kê & Phân tích KPIs (Dashboard)"),
          createBullet(
            "Hiển thị 4 chỉ số trọng yếu: Tổng số việc làm đang tuyển, Tổng số hồ sơ CV đã nộp, Tổng số Nhà tuyển dụng, Tổng số Ứng viên.",
            "• Thống kê thời gian thực:"
          ),
          createBullet(
            "Biểu đồ trực quan hóa dữ liệu tuyển dụng và tốc độ gia tăng người dùng (sử dụng thư viện Chart.js).",
            "• Biểu đồ phân tích:"
          ),

          createHeading2("5.3. Quản lý Doanh nghiệp & Nhà Tuyển dụng (Employer Management)"),
          createBullet(
            "Danh sách toàn bộ các công ty trên hệ thống kèm logo, email, số việc làm, ngày đăng ký và trạng thái.",
            "• Danh sách doanh nghiệp:"
          ),
          createBullet(
            "Lọc theo từ khóa, thành phố, trạng thái (Chờ duyệt - Pending, Hoạt động - Active, Bị khóa - Inactive).",
            "• Bộ lọc đa năng:"
          ),
          createBullet(
            "Xem đầy đủ hồ sơ doanh nghiệp, thông tin liên hệ và toàn bộ việc làm do công ty đó đăng tải.",
            "• Chi tiết doanh nghiệp:"
          ),
          createBullet(
            "Chuyển trạng thái công ty từ Pending sang Active sau khi kiểm duyệt tính hợp lệ, cho phép doanh nghiệp đăng tin tuyển dụng.",
            "• Phê duyệt doanh nghiệp:"
          ),
          createBullet(
            "Khóa các công ty có dấu hiệu lừa đảo hoặc vi phạm quy định (chuyển sang Inactive). Hệ thống tự động ẩn toàn bộ việc làm của công ty đó khỏi trang tìm kiếm công khai.",
            "• Khóa / Mở khóa doanh nghiệp:"
          ),

          createHeading2("5.4. Quản lý Ứng viên (Candidate Management)"),
          createBullet(
            "Xem danh sách toàn bộ ứng viên, trạng thái xác thực email (isEmailVerified), số điện thoại và ngày tạo.",
            "• Danh bạ ứng viên:"
          ),
          createBullet(
            "Xem lịch sử chi tiết tất cả các công việc ứng viên đó đã nộp và trạng thái xét duyệt của từng hồ sơ.",
            "• Chi tiết ứng viên:"
          ),
          createBullet(
            "Khóa hoặc mở khóa tài khoản ứng viên vi phạm chính sách cộng đồng.",
            "• Khóa tài khoản ứng viên:"
          ),

          createHeading2("5.5. Nhật ký Hệ thống Bất biến (System Audit Logs)"),
          createBullet(
            "Mọi hành động nhạy cảm của Admin đều được ghi lại tự động: Đăng nhập, Duyệt công ty, Khóa công ty, Khóa ứng viên, v.v.",
            "• Ghi log tự động:"
          ),
          createBullet(
            "Lưu trữ bất biến: Tên Admin thực hiện, Hành động, Đối tượng bị tác động, Thời gian chính xác đến từng mili-giây, Địa chỉ IP của Admin.",
            "• Thông tin minh bạch:"
          ),
          createBullet(
            "Phục vụ thanh tra, kiểm toán bảo mật và truy vết sự cố hệ thống.",
            "• Kiểm toán bảo mật:"
          ),

          new Paragraph({ spacing: { before: 200, after: 100 } }),

          // PHẦN 6: BẢO MẬT VÀ HIỆU NĂNG NỀN TẢNG
          createHeading1("6. CÁC TÍNH NĂNG BẢO MẬT & TỐI ƯU HIỆU NĂNG"),
          createParagraph(
            "Hệ thống VN.ITJobs được xây dựng theo các tiêu chuẩn kỹ thuật phần mềm doanh nghiệp nghiêm ngặt nhất:"
          ),
          createBullet(
            "Bảo vệ 100% các request POST/PUT/DELETE bằng Double Submit Cookie pattern, ngăn chặn hoàn toàn tấn công giả mạo yêu cầu từ trang khác.",
            "1. Chống tấn công CSRF (Cross-Site Request Forgery):"
          ),
          createBullet(
            "Giới hạn tần suất request trên các endpoint nhạy cảm (Đăng nhập, Đăng ký, Gửi OTP) chống brute-force và DDoS.",
            "2. Chống Brute-force & Spam Email (Rate Limiting):"
          ),
          createBullet(
            "Thiết lập Content Security Policy (CSP), chặn Clickjacking qua X-Frame-Options, ẩn công nghệ qua X-Powered-By.",
            "3. Bảo mật HTTP Headers (Helmet):"
          ),
          createBullet(
            "Tự động loại bỏ các toán tử độc hại ($gt, $where, v.v.) khỏi query và body trước khi vào controller.",
            "4. Chống NoSQL Injection (Express Mongo Sanitize):"
          ),
          createBullet(
            "Làm sạch nội dung HTML mô tả công việc bằng sanitize-html, Pug View tự động escape biến xuất ra màn hình.",
            "5. Chống tấn công XSS (Cross-Site Scripting):"
          ),
          createBullet(
            "Kiểm tra Magic Bytes định dạng tệp tải lên (PDF, Image), từ chối file thực thi độc hại giả mạo đuôi file.",
            "6. Bảo mật File Upload:"
          ),
          createBullet(
            "Toàn bộ mật khẩu và mã OTP đều được băm bằng thuật toán Bcrypt với Salt Rounds = 10, OTP tự hủy sau 10 phút.",
            "7. Mã hóa Mật khẩu & OTP:"
          ),
          createBullet(
            "Áp dụng In-memory Caching (NodeCache) cho Top Employers, Stats và Bộ từ điển; Song song hóa truy vấn Promise.all; Tối ưu Connection Pooling; Bật Pug View Cache; Cố định Sticky Footer chuẩn Flexbox.",
            "8. Tối ưu hóa Tốc độ Phản hồi:"
          ),

          new Paragraph({ spacing: { before: 300, after: 100 } }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: "Tài liệu được tổng hợp và xuất bản tự động bởi Antigravity Engine.",
                italics: true,
                size: 18,
                color: grayTextColor,
                font: "Arial",
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const docxPath = path.join(__dirname, "../../Tai_Lieu_Tong_Ket_Chuc_Nang_VN_ITJobs.docx");
  const docPath = path.join(__dirname, "../../Tai_Lieu_Tong_Ket_Chuc_Nang_VN_ITJobs.doc");

  fs.writeFileSync(docxPath, buffer);
  // Tạo thêm bản đuôi .doc để người dùng có thể mở bằng bất kỳ phiên bản Word cũ hoặc mới nào
  fs.writeFileSync(docPath, buffer);

  console.log(`✅ Đã xuất thành công file tài liệu Word:`);
  console.log(`   - ${docxPath}`);
  console.log(`   - ${docPath}`);
}

generateDocx().catch((err) => {
  console.error("❌ Lỗi khi sinh tài liệu Word:", err);
  process.exit(1);
});
