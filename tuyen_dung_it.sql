-- ==================================================================
-- HỆ THỐNG TUYỂN DỤNG IT - VN.ITJOBS
-- Script Cơ Sở Dữ Liệu SQL (Exported from MongoDB Atlas)
-- Ngày tạo: 14:36:11 22/10/2026
-- Tương thích: MySQL 8.x / MariaDB / PostgreSQL / SQLite
-- ==================================================================

CREATE DATABASE IF NOT EXISTS `vn_itjobs` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `vn_itjobs`;

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------
-- Table: admins (Quản trị viên hệ thống)
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS `admins`;
CREATE TABLE `admins` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `full_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'superadmin') DEFAULT 'admin',
  `status` ENUM('active', 'inactive') DEFAULT 'active',
  `token_version` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `admins` (`id`, `full_name`, `email`, `password`, `role`, `status`, `token_version`, `created_at`, `updated_at`) VALUES
('6ad99cb3160059482dd41b9c', 'Super Administrator', 'kietgiyuu2006@gmail.com', NULL, 'superadmin', 'active', 0, '2026-10-22 05:18:43', '2026-10-22 06:44:54');

-- ------------------------------------------------------------------
-- Table: skills (Danh mục Kỹ năng IT)
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS `skills`;
CREATE TABLE `skills` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(100) NOT NULL UNIQUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `skills` (`id`, `name`, `slug`, `created_at`, `updated_at`) VALUES
('6ad99c8bf7f49d74eebab4fc', 'ReactJS', 'reactjs', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab4fd', 'NodeJS', 'nodejs', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab4fe', 'JavaScript', 'javascript', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab4ff', 'TypeScript', 'typescript', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab500', 'HTML5', 'html5', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab501', 'CSS3', 'css3', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab502', 'TailwindCSS', 'tailwindcss', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab503', 'NextJS', 'nextjs', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab504', 'VueJS', 'vuejs', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab505', 'Angular', 'angular', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab506', 'Python', 'python', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab507', 'Django', 'django', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab508', 'FastAPI', 'fastapi', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab509', 'Java', 'java', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab50a', 'Spring Boot', 'spring-boot', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab50b', 'Golang', 'golang', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab50c', 'C#', 'c', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab50d', '.NET Core', 'net-core', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab50e', 'PHP', 'php', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab50f', 'Laravel', 'laravel', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab510', 'Flutter', 'flutter', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab511', 'React Native', 'react-native', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab512', 'iOS (Swift)', 'ios-swift', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab513', 'Android (Kotlin)', 'android-kotlin', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab514', 'Docker', 'docker', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab515', 'Kubernetes', 'kubernetes', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab516', 'AWS', 'aws', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab517', 'GCP', 'gcp', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab518', 'Azure', 'azure', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab519', 'CI/CD', 'cicd', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab51a', 'PostgreSQL', 'postgresql', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab51b', 'MySQL', 'mysql', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab51c', 'MongoDB', 'mongodb', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab51d', 'Redis', 'redis', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab51e', 'Elasticsearch', 'elasticsearch', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab51f', 'GraphQL', 'graphql', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab520', 'REST API', 'rest-api', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab521', 'Kafka', 'kafka', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab522', 'RabbitMQ', 'rabbitmq', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab523', 'Microservices', 'microservices', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab524', 'Unit Test', 'unit-test', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab525', 'Jest', 'jest', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab526', 'Git', 'git', '2026-10-22 05:18:03', '2026-10-22 05:18:03'),
('6ad99c8bf7f49d74eebab527', 'Linux', 'linux', '2026-10-22 05:18:03', '2026-10-22 05:18:03');

-- ------------------------------------------------------------------
-- Table: candidates (Ứng viên)
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS `candidates`;
CREATE TABLE `candidates` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `full_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(30) DEFAULT NULL,
  `status` ENUM('active', 'inactive') DEFAULT 'active',
  `is_email_verified` BOOLEAN DEFAULT FALSE,
  `token_version` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `candidates` (`id`, `full_name`, `email`, `password`, `phone`, `status`, `is_email_verified`, `token_version`, `created_at`, `updated_at`) VALUES
('6ad99c8cf7f49d74eebab53c', 'Nguyễn Văn An', 'candidate1@gmail.com', NULL, '0339198035', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab53d', 'Trần Thị Mai', 'candidate2@gmail.com', NULL, '0379831289', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab53e', 'Lê Hoàng Long', 'candidate3@gmail.com', NULL, '0312564037', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab53f', 'Phạm Minh Đức', 'candidate4@gmail.com', NULL, '0338023039', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab540', 'Vũ Thị Thảo', 'candidate5@gmail.com', NULL, '0347300538', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab541', 'Hoàng Gia Huy', 'candidate6@gmail.com', NULL, '0310950018', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab542', 'Đặng Ngọc Ánh', 'candidate7@gmail.com', NULL, '0390238749', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab543', 'Bùi Quang Hải', 'candidate8@gmail.com', NULL, '0373524433', 'active', TRUE, 1, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab544', 'Đỗ Phương Linh', 'candidate9@gmail.com', NULL, '0380845032', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab545', 'Ngô Thành Nam', 'candidate10@gmail.com', NULL, '0313803066', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab546', 'Dương Quốc Bảo', 'candidate11@gmail.com', NULL, '0337729272', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab547', 'Hồ Bích Ngọc', 'candidate12@gmail.com', NULL, '0365057498', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab548', 'Lý Triều Vĩ', 'candidate13@gmail.com', NULL, '0322560666', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab549', 'Trịnh Thùy Trang', 'candidate14@gmail.com', NULL, '0339684038', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab54a', 'Đinh Hữu Phước', 'candidate15@gmail.com', NULL, '0397602432', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad9aa51bb45d598e7cdea8e', 'shinyd1xxx', 'testeternatus@gmail.com', NULL, '', 'active', TRUE, 0, '2026-10-22 06:16:49', '2026-10-22 06:43:13'),
('6ad9af1910658e0aebede72e', 'Gia Kiệt', 'testeternatus111@gmail.com', NULL, '', 'active', TRUE, 0, '2026-10-22 06:37:13', '2026-10-22 06:43:13');

-- ------------------------------------------------------------------
-- Table: employers (Nhà tuyển dụng / Doanh nghiệp)
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS `employers`;
CREATE TABLE `employers` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `company_name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `city` VARCHAR(100) DEFAULT NULL,
  `address` VARCHAR(500) DEFAULT NULL,
  `logo_url` VARCHAR(500) DEFAULT NULL,
  `description` LONGTEXT DEFAULT NULL,
  `status` ENUM('active', 'pending', 'inactive') DEFAULT 'pending',
  `is_email_verified` BOOLEAN DEFAULT FALSE,
  `token_version` INT DEFAULT 0,
  `approved_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `employers` (`id`, `company_name`, `slug`, `email`, `password`, `city`, `address`, `logo_url`, `description`, `status`, `is_email_verified`, `token_version`, `approved_at`, `created_at`, `updated_at`) VALUES
('6ad99c8cf7f49d74eebab530', 'LG CNS Việt Nam', 'lg-cns-viet-nam-9f867d', 'employer1@lg-cns-viet-nam.vn', NULL, 'ha-noi', 'Tầng 15, tòa Keangnam Landmark 72, Mễ Trì, Nam Từ Liêm, Hà Nội', '/assets/images/demo/image1.png', '<p>LG CNS là công ty hàng đầu Hàn Quốc cung cấp dịch vụ công nghệ thông tin và chuyển đổi số toàn diện. Tại Việt Nam, chúng tôi xây dựng các hệ thống giải pháp cốt lõi cho các đối tác toàn cầu.</p>', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab531', 'FPT Software', 'fpt-software-a8d281', 'employer2@fpt-software.vn', NULL, 'ha-noi', 'Tòa nhà FPT, Phố Duy Tân, Cầu Giấy, Hà Nội', '/assets/images/demo/demo4.png', '<p>FPT Software là công ty xuất khẩu phần mềm lớn nhất Đông Nam Á, hiện diện tại hơn 30 quốc gia trên thế giới với các dự án chuyển đổi số quy mô lớn.</p>', 'active', TRUE, 0, '2026-10-22 05:52:06', '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab532', 'VNG Corporation', 'vng-corporation-ad0244', 'employer3@vng-corporation.vn', NULL, 'ho-chi-minh', 'Z06 Đường số 13, Phường Tân Thuận Đông, Quận 7, TP. Hồ Chí Minh', '/assets/images/demo/image1.png', '<p>Kỳ lân công nghệ đầu tiên tại Việt Nam, sở hữu hệ sinh thái Zalo, Zing, VNG Games và ZaloPay phục vụ hàng chục triệu người dùng.</p>', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab533', 'MoMo (M-Service)', 'momo-m-service-5e52c0', 'employer4@momo-m-service.vn', NULL, 'ho-chi-minh', 'Tòa nhà Phú Mỹ Hưng, Hoàng Văn Thái, Quận 7, TP. Hồ Chí Minh', '/assets/images/demo/demo4.png', '<p>Siêu ứng dụng tài chính số 1 Việt Nam, mang đến trải nghiệm thanh toán và tài chính thông minh cho hơn 30 triệu người dùng.</p>', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab534', 'Techcombank', 'techcombank-d9df39', 'employer5@techcombank.vn', NULL, 'ha-noi', 'Số 6 Quang Trung, Trần Hưng Đạo, Hoàn Kiếm, Hà Nội', '/assets/images/demo/image1.png', '<p>Khối Công nghệ & Dữ liệu Techcombank đang tiên phong dẫn dắt quá trình chuyển đổi số ngân hàng với kiến trúc Cloud-first hiện đại.</p>', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab535', 'One Mount Group', 'one-mount-group-14a114', 'employer6@one-mount-group.vn', NULL, 'ha-noi', 'Tòa nhà T26, KĐT Times City, Hai Bà Trưng, Hà Nội', '/assets/images/demo/demo4.png', '<p>Xây dựng hệ sinh thái số tin cậy và tiện lợi lớn nhất Việt Nam qua các sản phẩm VinShop, VinID, OneHousing.</p>', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab536', 'Shopee Việt Nam', 'shopee-viet-nam-c4569b', 'employer7@shopee-viet-nam.vn', NULL, 'ho-chi-minh', 'Tòa nhà Saigon Centre, 67 Lê Lợi, Quận 1, TP. Hồ Chí Minh', '/assets/images/demo/image1.png', '<p>Sàn thương mại điện tử hàng đầu Đông Nam Á và Đài Loan, cung cấp nền tảng giao dịch trực tuyến tiện lợi và bảo mật.</p>', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab537', 'Viettel Solutions', 'viettel-solutions-9f8d32', 'employer8@viettel-solutions.vn', NULL, 'ha-noi', 'Tòa nhà Viettel, Số 1 Trần Hữu Dực, Nam Từ Liêm, Hà Nội', '/assets/images/demo/demo4.png', '<p>Thành viên của Tập đoàn Viettel, tiên phong xây dựng Chính phủ điện tử, thành phố thông minh và các giải pháp số cho doanh nghiệp.</p>', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab538', 'Enclave IT', 'enclave-it-5cf5a6', 'employer9@enclave-it.vn', NULL, 'da-nang', '453 Hải Phòng, Chính Gián, Thanh Khê, Đà Nẵng', '/assets/images/demo/image1.png', '<p>Công ty gia công phần mềm hàng đầu miền Trung, hợp tác lâu năm với các đối tác công nghệ tại Hoa Kỳ và Châu Âu.</p>', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad99c8cf7f49d74eebab539', 'KMS Technology', 'kms-technology-dc5c2b', 'employer10@kms-technology.vn', NULL, 'da-nang', 'Tòa nhà Bưu điện, 271 Nguyễn Văn Linh, Thanh Khê, Đà Nẵng', '/assets/images/demo/demo4.png', '<p>Tập đoàn dịch vụ phần mềm quốc tế được bình chọn là một trong những nơi làm việc tốt nhất Việt Nam nhiều năm liên tiếp.</p>', 'active', TRUE, 0, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 06:43:13'),
('6ad9b01310658e0aebede74f', 'CGV', 'cgv-e77606', 'kietgiyuu2006@gmail.com', NULL, 'ha-noi', '', '', '', 'active', TRUE, 0, '2026-10-22 06:44:48', '2026-10-22 06:41:23', '2026-10-22 07:23:22');

-- ------------------------------------------------------------------
-- Table: jobs (Tin tuyển dụng việc làm IT)
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS `jobs`;
CREATE TABLE `jobs` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `employer_id` VARCHAR(50) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `salary_min` INT DEFAULT NULL,
  `salary_max` INT DEFAULT NULL,
  `position` VARCHAR(50) NOT NULL,
  `working_form` VARCHAR(50) NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `address` VARCHAR(500) DEFAULT NULL,
  `description` LONGTEXT DEFAULT NULL,
  `employer_active` BOOLEAN DEFAULT TRUE,
  `moderation` ENUM('visible', 'hidden') DEFAULT 'visible',
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`employer_id`) REFERENCES `employers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------
-- Table: job_skills (Bảng trung gian N-N giữa Jobs và Skills)
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS `job_skills`;
CREATE TABLE `job_skills` (
  `job_id` VARCHAR(50) NOT NULL,
  `skill_name` VARCHAR(100) NOT NULL,
  `skill_slug` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`job_id`, `skill_slug`),
  FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `jobs` (`id`, `employer_id`, `title`, `slug`, `salary_min`, `salary_max`, `position`, `working_form`, `city`, `address`, `description`, `employer_active`, `moderation`, `deleted_at`, `created_at`, `updated_at`) VALUES
('6ad99c8cf7f49d74eebab54c', '6ad99c8cf7f49d74eebab530', 'Frontend Engineer (ReactJS, NextJS)', 'frontend-engineer-reactjs-nextjs-b9216f', 800, 1300, 'intern', 'office', 'ha-noi', 'Tầng 15, tòa Keangnam Landmark 72, Mễ Trì, Nam Từ Liêm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Frontend Engineer (ReactJS, NextJS)</strong> tại <strong>LG CNS Việt Nam</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: ReactJS NodeJS. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab552', '6ad99c8cf7f49d74eebab531', 'Senior Backend Developer (NodeJS, Express)', 'senior-backend-developer-nodejs-express-c5c26e', 1000, 1700, 'fresher', 'remote', 'ha-noi', 'Tòa nhà FPT, Phố Duy Tân, Cầu Giấy, Hà Nội', '<p>Tuyển dụng vị trí <strong>Senior Backend Developer (NodeJS, Express)</strong> tại <strong>FPT Software</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: TypeScript HTML5 CSS3. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:52:06'),
('6ad99c8cf7f49d74eebab559', '6ad99c8cf7f49d74eebab532', 'Fullstack Developer (ReactJS, NodeJS)', 'fullstack-developer-reactjs-nodejs-9e48d0', 1200, 2100, 'junior', 'flexible', 'ho-chi-minh', 'Z06 Đường số 13, Phường Tân Thuận Đông, Quận 7, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Fullstack Developer (ReactJS, NodeJS)</strong> tại <strong>VNG Corporation</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: TailwindCSS NextJS VueJS Angular. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab561', '6ad99c8cf7f49d74eebab533', 'Java Backend Engineer (Spring Boot, Microservices)', 'java-backend-engineer-spring-boot-microservices-cabdc3', 1400, 2500, 'middle', 'office', 'ho-chi-minh', 'Tòa nhà Phú Mỹ Hưng, Hoàng Văn Thái, Quận 7, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Java Backend Engineer (Spring Boot, Microservices)</strong> tại <strong>MoMo (M-Service)</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Angular Python. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab567', '6ad99c8cf7f49d74eebab534', 'DevOps Engineer (AWS, Docker, K8s)', 'devops-engineer-aws-docker-k8s-334a5f', 1600, 2900, 'senior', 'remote', 'ha-noi', 'Số 6 Quang Trung, Trần Hưng Đạo, Hoàn Kiếm, Hà Nội', '<p>Tuyển dụng vị trí <strong>DevOps Engineer (AWS, Docker, K8s)</strong> tại <strong>Techcombank</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: FastAPI Java Spring Boot. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab56e', '6ad99c8cf7f49d74eebab535', 'Mobile Developer (Flutter, Dart)', 'mobile-developer-flutter-dart-3a7ed1', 1800, 2300, 'manager', 'flexible', 'ha-noi', 'Tòa nhà T26, KĐT Times City, Hai Bà Trưng, Hà Nội', '<p>Tuyển dụng vị trí <strong>Mobile Developer (Flutter, Dart)</strong> tại <strong>One Mount Group</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Golang C# .NET Core PHP. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab576', '6ad99c8cf7f49d74eebab536', 'iOS Engineer (Swift)', 'ios-engineer-swift-11c273', 2000, 2700, 'intern', 'office', 'ho-chi-minh', 'Tòa nhà Saigon Centre, 67 Lê Lợi, Quận 1, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>iOS Engineer (Swift)</strong> tại <strong>Shopee Việt Nam</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: PHP Laravel. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab57c', '6ad99c8cf7f49d74eebab537', 'Android Engineer (Kotlin)', 'android-engineer-kotlin-9ddc58', 2200, 3100, 'fresher', 'remote', 'ha-noi', 'Tòa nhà Viettel, Số 1 Trần Hữu Dực, Nam Từ Liêm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Android Engineer (Kotlin)</strong> tại <strong>Viettel Solutions</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: React Native iOS (Swift) Android (Kotlin). Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab583', '6ad99c8cf7f49d74eebab538', 'Python Data Engineer', 'python-data-engineer-7b503c', 2400, 3500, 'junior', 'flexible', 'da-nang', '453 Hải Phòng, Chính Gián, Thanh Khê, Đà Nẵng', '<p>Tuyển dụng vị trí <strong>Python Data Engineer</strong> tại <strong>Enclave IT</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Docker Kubernetes AWS GCP. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab58b', '6ad99c8cf7f49d74eebab539', 'Senior Golang Engineer', 'senior-golang-engineer-df2e22', 2600, 3900, 'middle', 'office', 'da-nang', 'Tòa nhà Bưu điện, 271 Nguyễn Văn Linh, Thanh Khê, Đà Nẵng', '<p>Tuyển dụng vị trí <strong>Senior Golang Engineer</strong> tại <strong>KMS Technology</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: GCP Azure. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab591', '6ad99c8cf7f49d74eebab530', 'Automation QA/QC Engineer', 'automation-qaqc-engineer-5eddc6', 800, 1300, 'senior', 'remote', 'ha-noi', 'Tầng 15, tòa Keangnam Landmark 72, Mễ Trì, Nam Từ Liêm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Automation QA/QC Engineer</strong> tại <strong>LG CNS Việt Nam</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: PostgreSQL MySQL MongoDB. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab598', '6ad99c8cf7f49d74eebab531', 'Lead Frontend Architect', 'lead-frontend-architect-35944f', 1000, 1700, 'manager', 'flexible', 'ha-noi', 'Tòa nhà FPT, Phố Duy Tân, Cầu Giấy, Hà Nội', '<p>Tuyển dụng vị trí <strong>Lead Frontend Architect</strong> tại <strong>FPT Software</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Redis Elasticsearch GraphQL REST API. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:52:06'),
('6ad99c8cf7f49d74eebab5a0', '6ad99c8cf7f49d74eebab532', 'Software Engineer (.NET Core, C#)', 'software-engineer-net-core-c-116356', 1200, 2100, 'intern', 'office', 'ho-chi-minh', 'Z06 Đường số 13, Phường Tân Thuận Đông, Quận 7, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Software Engineer (.NET Core, C#)</strong> tại <strong>VNG Corporation</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: REST API Kafka. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5a6', '6ad99c8cf7f49d74eebab533', 'Cloud Solutions Architect (GCP/AWS)', 'cloud-solutions-architect-gcpaws-b03ccf', 1400, 2500, 'fresher', 'remote', 'ho-chi-minh', 'Tòa nhà Phú Mỹ Hưng, Hoàng Văn Thái, Quận 7, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Cloud Solutions Architect (GCP/AWS)</strong> tại <strong>MoMo (M-Service)</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Microservices Unit Test Jest. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5ad', '6ad99c8cf7f49d74eebab534', 'Data Scientist / AI Engineer', 'data-scientist-ai-engineer-95fb82', 1600, 2900, 'junior', 'flexible', 'ha-noi', 'Số 6 Quang Trung, Trần Hưng Đạo, Hoàn Kiếm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Data Scientist / AI Engineer</strong> tại <strong>Techcombank</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Git Linux ReactJS NodeJS. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5b5', '6ad99c8cf7f49d74eebab535', 'Frontend Engineer (ReactJS, NextJS)', 'frontend-engineer-reactjs-nextjs-d1a3b1', 1800, 2300, 'middle', 'office', 'ha-noi', 'Tòa nhà T26, KĐT Times City, Hai Bà Trưng, Hà Nội', '<p>Tuyển dụng vị trí <strong>Frontend Engineer (ReactJS, NextJS)</strong> tại <strong>One Mount Group</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: NodeJS JavaScript. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5bb', '6ad99c8cf7f49d74eebab536', 'Senior Backend Developer (NodeJS, Express)', 'senior-backend-developer-nodejs-express-af2b8f', 2000, 2700, 'senior', 'remote', 'ho-chi-minh', 'Tòa nhà Saigon Centre, 67 Lê Lợi, Quận 1, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Senior Backend Developer (NodeJS, Express)</strong> tại <strong>Shopee Việt Nam</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: HTML5 CSS3 TailwindCSS. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5c2', '6ad99c8cf7f49d74eebab537', 'Fullstack Developer (ReactJS, NodeJS)', 'fullstack-developer-reactjs-nodejs-275ad7', 2200, 3100, 'manager', 'flexible', 'ha-noi', 'Tòa nhà Viettel, Số 1 Trần Hữu Dực, Nam Từ Liêm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Fullstack Developer (ReactJS, NodeJS)</strong> tại <strong>Viettel Solutions</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: NextJS VueJS Angular Python. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5ca', '6ad99c8cf7f49d74eebab538', 'Java Backend Engineer (Spring Boot, Microservices)', 'java-backend-engineer-spring-boot-microservices-418a43', 2400, 3500, 'intern', 'office', 'da-nang', '453 Hải Phòng, Chính Gián, Thanh Khê, Đà Nẵng', '<p>Tuyển dụng vị trí <strong>Java Backend Engineer (Spring Boot, Microservices)</strong> tại <strong>Enclave IT</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Python Django. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5d0', '6ad99c8cf7f49d74eebab539', 'DevOps Engineer (AWS, Docker, K8s)', 'devops-engineer-aws-docker-k8s-10dbb7', 2600, 3900, 'fresher', 'remote', 'da-nang', 'Tòa nhà Bưu điện, 271 Nguyễn Văn Linh, Thanh Khê, Đà Nẵng', '<p>Tuyển dụng vị trí <strong>DevOps Engineer (AWS, Docker, K8s)</strong> tại <strong>KMS Technology</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Java Spring Boot Golang. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5d7', '6ad99c8cf7f49d74eebab530', 'Mobile Developer (Flutter, Dart)', 'mobile-developer-flutter-dart-4492c1', 800, 1300, 'junior', 'flexible', 'ha-noi', 'Tầng 15, tòa Keangnam Landmark 72, Mễ Trì, Nam Từ Liêm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Mobile Developer (Flutter, Dart)</strong> tại <strong>LG CNS Việt Nam</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: C# .NET Core PHP Laravel. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5df', '6ad99c8cf7f49d74eebab531', 'iOS Engineer (Swift)', 'ios-engineer-swift-c82d80', 1000, 1700, 'middle', 'office', 'ha-noi', 'Tòa nhà FPT, Phố Duy Tân, Cầu Giấy, Hà Nội', '<p>Tuyển dụng vị trí <strong>iOS Engineer (Swift)</strong> tại <strong>FPT Software</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Laravel Flutter. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:52:06'),
('6ad99c8cf7f49d74eebab5e5', '6ad99c8cf7f49d74eebab532', 'Android Engineer (Kotlin)', 'android-engineer-kotlin-0b1322', 1200, 2100, 'senior', 'remote', 'ho-chi-minh', 'Z06 Đường số 13, Phường Tân Thuận Đông, Quận 7, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Android Engineer (Kotlin)</strong> tại <strong>VNG Corporation</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: iOS (Swift) Android (Kotlin) Docker. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5ec', '6ad99c8cf7f49d74eebab533', 'Python Data Engineer', 'python-data-engineer-d44081', 1400, 2500, 'manager', 'flexible', 'ho-chi-minh', 'Tòa nhà Phú Mỹ Hưng, Hoàng Văn Thái, Quận 7, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Python Data Engineer</strong> tại <strong>MoMo (M-Service)</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Kubernetes AWS GCP Azure. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5f4', '6ad99c8cf7f49d74eebab534', 'Senior Golang Engineer', 'senior-golang-engineer-7f9380', 1600, 2900, 'intern', 'office', 'ha-noi', 'Số 6 Quang Trung, Trần Hưng Đạo, Hoàn Kiếm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Senior Golang Engineer</strong> tại <strong>Techcombank</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Azure CI/CD. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab5fa', '6ad99c8cf7f49d74eebab535', 'Automation QA/QC Engineer', 'automation-qaqc-engineer-90988f', 1800, 2300, 'fresher', 'remote', 'ha-noi', 'Tòa nhà T26, KĐT Times City, Hai Bà Trưng, Hà Nội', '<p>Tuyển dụng vị trí <strong>Automation QA/QC Engineer</strong> tại <strong>One Mount Group</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: MySQL MongoDB Redis. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab601', '6ad99c8cf7f49d74eebab536', 'Lead Frontend Architect', 'lead-frontend-architect-fadd2d', 2000, 2700, 'junior', 'flexible', 'ho-chi-minh', 'Tòa nhà Saigon Centre, 67 Lê Lợi, Quận 1, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Lead Frontend Architect</strong> tại <strong>Shopee Việt Nam</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Elasticsearch GraphQL REST API Kafka. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab609', '6ad99c8cf7f49d74eebab537', 'Software Engineer (.NET Core, C#)', 'software-engineer-net-core-c-52313d', 2200, 3100, 'middle', 'office', 'ha-noi', 'Tòa nhà Viettel, Số 1 Trần Hữu Dực, Nam Từ Liêm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Software Engineer (.NET Core, C#)</strong> tại <strong>Viettel Solutions</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Kafka RabbitMQ. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab60f', '6ad99c8cf7f49d74eebab538', 'Cloud Solutions Architect (GCP/AWS)', 'cloud-solutions-architect-gcpaws-1ca600', 2400, 3500, 'senior', 'remote', 'da-nang', '453 Hải Phòng, Chính Gián, Thanh Khê, Đà Nẵng', '<p>Tuyển dụng vị trí <strong>Cloud Solutions Architect (GCP/AWS)</strong> tại <strong>Enclave IT</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Unit Test Jest Git. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab616', '6ad99c8cf7f49d74eebab539', 'Data Scientist / AI Engineer', 'data-scientist-ai-engineer-0957c2', 2600, 3900, 'manager', 'flexible', 'da-nang', 'Tòa nhà Bưu điện, 271 Nguyễn Văn Linh, Thanh Khê, Đà Nẵng', '<p>Tuyển dụng vị trí <strong>Data Scientist / AI Engineer</strong> tại <strong>KMS Technology</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Linux ReactJS NodeJS JavaScript. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab61e', '6ad99c8cf7f49d74eebab530', 'Frontend Engineer (ReactJS, NextJS)', 'frontend-engineer-reactjs-nextjs-d47d74', 800, 1300, 'intern', 'office', 'ha-noi', 'Tầng 15, tòa Keangnam Landmark 72, Mễ Trì, Nam Từ Liêm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Frontend Engineer (ReactJS, NextJS)</strong> tại <strong>LG CNS Việt Nam</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: JavaScript TypeScript. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab624', '6ad99c8cf7f49d74eebab531', 'Senior Backend Developer (NodeJS, Express)', 'senior-backend-developer-nodejs-express-4cd801', 1000, 1700, 'fresher', 'remote', 'ha-noi', 'Tòa nhà FPT, Phố Duy Tân, Cầu Giấy, Hà Nội', '<p>Tuyển dụng vị trí <strong>Senior Backend Developer (NodeJS, Express)</strong> tại <strong>FPT Software</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: CSS3 TailwindCSS NextJS. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:52:06'),
('6ad99c8cf7f49d74eebab62b', '6ad99c8cf7f49d74eebab532', 'Fullstack Developer (ReactJS, NodeJS)', 'fullstack-developer-reactjs-nodejs-7b26ab', 1200, 2100, 'junior', 'flexible', 'ho-chi-minh', 'Z06 Đường số 13, Phường Tân Thuận Đông, Quận 7, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Fullstack Developer (ReactJS, NodeJS)</strong> tại <strong>VNG Corporation</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: VueJS Angular Python Django. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab633', '6ad99c8cf7f49d74eebab533', 'Java Backend Engineer (Spring Boot, Microservices)', 'java-backend-engineer-spring-boot-microservices-1239b1', 1400, 2500, 'middle', 'office', 'ho-chi-minh', 'Tòa nhà Phú Mỹ Hưng, Hoàng Văn Thái, Quận 7, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Java Backend Engineer (Spring Boot, Microservices)</strong> tại <strong>MoMo (M-Service)</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Django FastAPI. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab639', '6ad99c8cf7f49d74eebab534', 'DevOps Engineer (AWS, Docker, K8s)', 'devops-engineer-aws-docker-k8s-831675', 1600, 2900, 'senior', 'remote', 'ha-noi', 'Số 6 Quang Trung, Trần Hưng Đạo, Hoàn Kiếm, Hà Nội', '<p>Tuyển dụng vị trí <strong>DevOps Engineer (AWS, Docker, K8s)</strong> tại <strong>Techcombank</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Spring Boot Golang C#. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab640', '6ad99c8cf7f49d74eebab535', 'Mobile Developer (Flutter, Dart)', 'mobile-developer-flutter-dart-4c5eca', 1800, 2300, 'manager', 'flexible', 'ha-noi', 'Tòa nhà T26, KĐT Times City, Hai Bà Trưng, Hà Nội', '<p>Tuyển dụng vị trí <strong>Mobile Developer (Flutter, Dart)</strong> tại <strong>One Mount Group</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: .NET Core PHP Laravel Flutter. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab648', '6ad99c8cf7f49d74eebab536', 'iOS Engineer (Swift)', 'ios-engineer-swift-6f4ce4', 2000, 2700, 'intern', 'office', 'ho-chi-minh', 'Tòa nhà Saigon Centre, 67 Lê Lợi, Quận 1, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>iOS Engineer (Swift)</strong> tại <strong>Shopee Việt Nam</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Flutter React Native. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab64e', '6ad99c8cf7f49d74eebab537', 'Android Engineer (Kotlin)', 'android-engineer-kotlin-3bc14e', 2200, 3100, 'fresher', 'remote', 'ha-noi', 'Tòa nhà Viettel, Số 1 Trần Hữu Dực, Nam Từ Liêm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Android Engineer (Kotlin)</strong> tại <strong>Viettel Solutions</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Android (Kotlin) Docker Kubernetes. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab655', '6ad99c8cf7f49d74eebab538', 'Python Data Engineer', 'python-data-engineer-66c116', 2400, 3500, 'junior', 'flexible', 'da-nang', '453 Hải Phòng, Chính Gián, Thanh Khê, Đà Nẵng', '<p>Tuyển dụng vị trí <strong>Python Data Engineer</strong> tại <strong>Enclave IT</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: AWS GCP Azure CI/CD. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab65d', '6ad99c8cf7f49d74eebab539', 'Senior Golang Engineer', 'senior-golang-engineer-7d1059', 2600, 3900, 'middle', 'office', 'da-nang', 'Tòa nhà Bưu điện, 271 Nguyễn Văn Linh, Thanh Khê, Đà Nẵng', '<p>Tuyển dụng vị trí <strong>Senior Golang Engineer</strong> tại <strong>KMS Technology</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: CI/CD PostgreSQL. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab663', '6ad99c8cf7f49d74eebab530', 'Automation QA/QC Engineer', 'automation-qaqc-engineer-a6b015', 800, 1300, 'senior', 'remote', 'ha-noi', 'Tầng 15, tòa Keangnam Landmark 72, Mễ Trì, Nam Từ Liêm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Automation QA/QC Engineer</strong> tại <strong>LG CNS Việt Nam</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: MongoDB Redis Elasticsearch. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab66a', '6ad99c8cf7f49d74eebab531', 'Lead Frontend Architect', 'lead-frontend-architect-00d7cb', 1000, 1700, 'manager', 'flexible', 'ha-noi', 'Tòa nhà FPT, Phố Duy Tân, Cầu Giấy, Hà Nội', '<p>Tuyển dụng vị trí <strong>Lead Frontend Architect</strong> tại <strong>FPT Software</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: GraphQL REST API Kafka RabbitMQ. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:52:06'),
('6ad99c8cf7f49d74eebab672', '6ad99c8cf7f49d74eebab532', 'Software Engineer (.NET Core, C#)', 'software-engineer-net-core-c-3f1618', 1200, 2100, 'intern', 'office', 'ho-chi-minh', 'Z06 Đường số 13, Phường Tân Thuận Đông, Quận 7, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Software Engineer (.NET Core, C#)</strong> tại <strong>VNG Corporation</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: RabbitMQ Microservices. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab678', '6ad99c8cf7f49d74eebab533', 'Cloud Solutions Architect (GCP/AWS)', 'cloud-solutions-architect-gcpaws-884474', 1400, 2500, 'fresher', 'remote', 'ho-chi-minh', 'Tòa nhà Phú Mỹ Hưng, Hoàng Văn Thái, Quận 7, TP. Hồ Chí Minh', '<p>Tuyển dụng vị trí <strong>Cloud Solutions Architect (GCP/AWS)</strong> tại <strong>MoMo (M-Service)</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: Jest Git Linux. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab67f', '6ad99c8cf7f49d74eebab534', 'Data Scientist / AI Engineer', 'data-scientist-ai-engineer-6a88b1', 1600, 2900, 'junior', 'flexible', 'ha-noi', 'Số 6 Quang Trung, Trần Hưng Đạo, Hoàn Kiếm, Hà Nội', '<p>Tuyển dụng vị trí <strong>Data Scientist / AI Engineer</strong> tại <strong>Techcombank</strong>.</p><p>Yêu cầu thành thạo các kỹ năng: ReactJS NodeJS JavaScript TypeScript. Môi trường làm việc năng động, chuyên nghiệp với chế độ đãi ngộ hấp dẫn.</p>', TRUE, 'visible', NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04');

INSERT INTO `job_skills` (`job_id`, `skill_name`, `skill_slug`) VALUES
('6ad99c8cf7f49d74eebab54c', 'ReactJS', 'reactjs'),
('6ad99c8cf7f49d74eebab54c', 'NodeJS', 'nodejs'),
('6ad99c8cf7f49d74eebab552', 'TypeScript', 'typescript'),
('6ad99c8cf7f49d74eebab552', 'HTML5', 'html5'),
('6ad99c8cf7f49d74eebab552', 'CSS3', 'css3'),
('6ad99c8cf7f49d74eebab559', 'TailwindCSS', 'tailwindcss'),
('6ad99c8cf7f49d74eebab559', 'NextJS', 'nextjs'),
('6ad99c8cf7f49d74eebab559', 'VueJS', 'vuejs'),
('6ad99c8cf7f49d74eebab559', 'Angular', 'angular'),
('6ad99c8cf7f49d74eebab561', 'Angular', 'angular'),
('6ad99c8cf7f49d74eebab561', 'Python', 'python'),
('6ad99c8cf7f49d74eebab567', 'FastAPI', 'fastapi'),
('6ad99c8cf7f49d74eebab567', 'Java', 'java'),
('6ad99c8cf7f49d74eebab567', 'Spring Boot', 'spring-boot'),
('6ad99c8cf7f49d74eebab56e', 'Golang', 'golang'),
('6ad99c8cf7f49d74eebab56e', 'C#', 'c'),
('6ad99c8cf7f49d74eebab56e', '.NET Core', 'net-core'),
('6ad99c8cf7f49d74eebab56e', 'PHP', 'php'),
('6ad99c8cf7f49d74eebab576', 'PHP', 'php'),
('6ad99c8cf7f49d74eebab576', 'Laravel', 'laravel'),
('6ad99c8cf7f49d74eebab57c', 'React Native', 'react-native'),
('6ad99c8cf7f49d74eebab57c', 'iOS (Swift)', 'ios-swift'),
('6ad99c8cf7f49d74eebab57c', 'Android (Kotlin)', 'android-kotlin'),
('6ad99c8cf7f49d74eebab583', 'Docker', 'docker'),
('6ad99c8cf7f49d74eebab583', 'Kubernetes', 'kubernetes'),
('6ad99c8cf7f49d74eebab583', 'AWS', 'aws'),
('6ad99c8cf7f49d74eebab583', 'GCP', 'gcp'),
('6ad99c8cf7f49d74eebab58b', 'GCP', 'gcp'),
('6ad99c8cf7f49d74eebab58b', 'Azure', 'azure'),
('6ad99c8cf7f49d74eebab591', 'PostgreSQL', 'postgresql'),
('6ad99c8cf7f49d74eebab591', 'MySQL', 'mysql'),
('6ad99c8cf7f49d74eebab591', 'MongoDB', 'mongodb'),
('6ad99c8cf7f49d74eebab598', 'Redis', 'redis'),
('6ad99c8cf7f49d74eebab598', 'Elasticsearch', 'elasticsearch'),
('6ad99c8cf7f49d74eebab598', 'GraphQL', 'graphql'),
('6ad99c8cf7f49d74eebab598', 'REST API', 'rest-api'),
('6ad99c8cf7f49d74eebab5a0', 'REST API', 'rest-api'),
('6ad99c8cf7f49d74eebab5a0', 'Kafka', 'kafka'),
('6ad99c8cf7f49d74eebab5a6', 'Microservices', 'microservices'),
('6ad99c8cf7f49d74eebab5a6', 'Unit Test', 'unit-test'),
('6ad99c8cf7f49d74eebab5a6', 'Jest', 'jest'),
('6ad99c8cf7f49d74eebab5ad', 'Git', 'git'),
('6ad99c8cf7f49d74eebab5ad', 'Linux', 'linux'),
('6ad99c8cf7f49d74eebab5ad', 'ReactJS', 'reactjs'),
('6ad99c8cf7f49d74eebab5ad', 'NodeJS', 'nodejs'),
('6ad99c8cf7f49d74eebab5b5', 'NodeJS', 'nodejs'),
('6ad99c8cf7f49d74eebab5b5', 'JavaScript', 'javascript'),
('6ad99c8cf7f49d74eebab5bb', 'HTML5', 'html5'),
('6ad99c8cf7f49d74eebab5bb', 'CSS3', 'css3'),
('6ad99c8cf7f49d74eebab5bb', 'TailwindCSS', 'tailwindcss'),
('6ad99c8cf7f49d74eebab5c2', 'NextJS', 'nextjs'),
('6ad99c8cf7f49d74eebab5c2', 'VueJS', 'vuejs'),
('6ad99c8cf7f49d74eebab5c2', 'Angular', 'angular'),
('6ad99c8cf7f49d74eebab5c2', 'Python', 'python'),
('6ad99c8cf7f49d74eebab5ca', 'Python', 'python'),
('6ad99c8cf7f49d74eebab5ca', 'Django', 'django'),
('6ad99c8cf7f49d74eebab5d0', 'Java', 'java'),
('6ad99c8cf7f49d74eebab5d0', 'Spring Boot', 'spring-boot'),
('6ad99c8cf7f49d74eebab5d0', 'Golang', 'golang'),
('6ad99c8cf7f49d74eebab5d7', 'C#', 'c'),
('6ad99c8cf7f49d74eebab5d7', '.NET Core', 'net-core'),
('6ad99c8cf7f49d74eebab5d7', 'PHP', 'php'),
('6ad99c8cf7f49d74eebab5d7', 'Laravel', 'laravel'),
('6ad99c8cf7f49d74eebab5df', 'Laravel', 'laravel'),
('6ad99c8cf7f49d74eebab5df', 'Flutter', 'flutter'),
('6ad99c8cf7f49d74eebab5e5', 'iOS (Swift)', 'ios-swift'),
('6ad99c8cf7f49d74eebab5e5', 'Android (Kotlin)', 'android-kotlin'),
('6ad99c8cf7f49d74eebab5e5', 'Docker', 'docker'),
('6ad99c8cf7f49d74eebab5ec', 'Kubernetes', 'kubernetes'),
('6ad99c8cf7f49d74eebab5ec', 'AWS', 'aws'),
('6ad99c8cf7f49d74eebab5ec', 'GCP', 'gcp'),
('6ad99c8cf7f49d74eebab5ec', 'Azure', 'azure'),
('6ad99c8cf7f49d74eebab5f4', 'Azure', 'azure'),
('6ad99c8cf7f49d74eebab5f4', 'CI/CD', 'cicd'),
('6ad99c8cf7f49d74eebab5fa', 'MySQL', 'mysql'),
('6ad99c8cf7f49d74eebab5fa', 'MongoDB', 'mongodb'),
('6ad99c8cf7f49d74eebab5fa', 'Redis', 'redis'),
('6ad99c8cf7f49d74eebab601', 'Elasticsearch', 'elasticsearch'),
('6ad99c8cf7f49d74eebab601', 'GraphQL', 'graphql'),
('6ad99c8cf7f49d74eebab601', 'REST API', 'rest-api'),
('6ad99c8cf7f49d74eebab601', 'Kafka', 'kafka'),
('6ad99c8cf7f49d74eebab609', 'Kafka', 'kafka'),
('6ad99c8cf7f49d74eebab609', 'RabbitMQ', 'rabbitmq'),
('6ad99c8cf7f49d74eebab60f', 'Unit Test', 'unit-test'),
('6ad99c8cf7f49d74eebab60f', 'Jest', 'jest'),
('6ad99c8cf7f49d74eebab60f', 'Git', 'git'),
('6ad99c8cf7f49d74eebab616', 'Linux', 'linux'),
('6ad99c8cf7f49d74eebab616', 'ReactJS', 'reactjs'),
('6ad99c8cf7f49d74eebab616', 'NodeJS', 'nodejs'),
('6ad99c8cf7f49d74eebab616', 'JavaScript', 'javascript'),
('6ad99c8cf7f49d74eebab61e', 'JavaScript', 'javascript'),
('6ad99c8cf7f49d74eebab61e', 'TypeScript', 'typescript'),
('6ad99c8cf7f49d74eebab624', 'CSS3', 'css3'),
('6ad99c8cf7f49d74eebab624', 'TailwindCSS', 'tailwindcss'),
('6ad99c8cf7f49d74eebab624', 'NextJS', 'nextjs'),
('6ad99c8cf7f49d74eebab62b', 'VueJS', 'vuejs'),
('6ad99c8cf7f49d74eebab62b', 'Angular', 'angular'),
('6ad99c8cf7f49d74eebab62b', 'Python', 'python'),
('6ad99c8cf7f49d74eebab62b', 'Django', 'django'),
('6ad99c8cf7f49d74eebab633', 'Django', 'django'),
('6ad99c8cf7f49d74eebab633', 'FastAPI', 'fastapi'),
('6ad99c8cf7f49d74eebab639', 'Spring Boot', 'spring-boot'),
('6ad99c8cf7f49d74eebab639', 'Golang', 'golang'),
('6ad99c8cf7f49d74eebab639', 'C#', 'c'),
('6ad99c8cf7f49d74eebab640', '.NET Core', 'net-core'),
('6ad99c8cf7f49d74eebab640', 'PHP', 'php'),
('6ad99c8cf7f49d74eebab640', 'Laravel', 'laravel'),
('6ad99c8cf7f49d74eebab640', 'Flutter', 'flutter'),
('6ad99c8cf7f49d74eebab648', 'Flutter', 'flutter'),
('6ad99c8cf7f49d74eebab648', 'React Native', 'react-native'),
('6ad99c8cf7f49d74eebab64e', 'Android (Kotlin)', 'android-kotlin'),
('6ad99c8cf7f49d74eebab64e', 'Docker', 'docker'),
('6ad99c8cf7f49d74eebab64e', 'Kubernetes', 'kubernetes'),
('6ad99c8cf7f49d74eebab655', 'AWS', 'aws'),
('6ad99c8cf7f49d74eebab655', 'GCP', 'gcp'),
('6ad99c8cf7f49d74eebab655', 'Azure', 'azure'),
('6ad99c8cf7f49d74eebab655', 'CI/CD', 'cicd'),
('6ad99c8cf7f49d74eebab65d', 'CI/CD', 'cicd'),
('6ad99c8cf7f49d74eebab65d', 'PostgreSQL', 'postgresql'),
('6ad99c8cf7f49d74eebab663', 'MongoDB', 'mongodb'),
('6ad99c8cf7f49d74eebab663', 'Redis', 'redis'),
('6ad99c8cf7f49d74eebab663', 'Elasticsearch', 'elasticsearch'),
('6ad99c8cf7f49d74eebab66a', 'GraphQL', 'graphql'),
('6ad99c8cf7f49d74eebab66a', 'REST API', 'rest-api'),
('6ad99c8cf7f49d74eebab66a', 'Kafka', 'kafka'),
('6ad99c8cf7f49d74eebab66a', 'RabbitMQ', 'rabbitmq'),
('6ad99c8cf7f49d74eebab672', 'RabbitMQ', 'rabbitmq'),
('6ad99c8cf7f49d74eebab672', 'Microservices', 'microservices'),
('6ad99c8cf7f49d74eebab678', 'Jest', 'jest'),
('6ad99c8cf7f49d74eebab678', 'Git', 'git'),
('6ad99c8cf7f49d74eebab678', 'Linux', 'linux'),
('6ad99c8cf7f49d74eebab67f', 'ReactJS', 'reactjs'),
('6ad99c8cf7f49d74eebab67f', 'NodeJS', 'nodejs'),
('6ad99c8cf7f49d74eebab67f', 'JavaScript', 'javascript'),
('6ad99c8cf7f49d74eebab67f', 'TypeScript', 'typescript');

-- ------------------------------------------------------------------
-- Table: applications (Hồ sơ đơn nộp CV ứng tuyển)
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS `applications`;
CREATE TABLE `applications` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `job_id` VARCHAR(50) NOT NULL,
  `employer_id` VARCHAR(50) NOT NULL,
  `candidate_id` VARCHAR(50) NOT NULL,
  `full_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `cv_file_key` VARCHAR(255) DEFAULT NULL,
  `cv_original_name` VARCHAR(255) DEFAULT NULL,
  `status` ENUM('pending', 'reviewed', 'interviewed', 'accepted', 'rejected') DEFAULT 'pending',
  `viewed` BOOLEAN DEFAULT FALSE,
  `hidden_by_candidate` BOOLEAN DEFAULT FALSE,
  `hidden_by_employer` BOOLEAN DEFAULT FALSE,
  `reviewed_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_job_candidate` (`job_id`, `candidate_id`),
  FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`employer_id`) REFERENCES `employers` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `applications` (`id`, `job_id`, `employer_id`, `candidate_id`, `full_name`, `email`, `phone`, `cv_file_key`, `cv_original_name`, `status`, `viewed`, `hidden_by_candidate`, `hidden_by_employer`, `reviewed_at`, `created_at`, `updated_at`) VALUES
('6ad99c8cf7f49d74eebab68b', '6ad99c8cf7f49d74eebab54c', '6ad99c8cf7f49d74eebab530', '6ad99c8cf7f49d74eebab53c', 'Nguyễn Văn An', 'candidate1@gmail.com', '0339198035', 'cv-6ad99c8cf7f49d74eebab53c-6ad99c8cf7f49d74eebab54c.pdf', 'CV_nguyen-van-an.pdf', 'pending', TRUE, FALSE, FALSE, NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab68c', '6ad99c8cf7f49d74eebab552', '6ad99c8cf7f49d74eebab531', '6ad99c8cf7f49d74eebab53d', 'Trần Thị Mai', 'candidate2@gmail.com', '0379831289', 'cv-6ad99c8cf7f49d74eebab53d-6ad99c8cf7f49d74eebab552.pdf', 'CV_tran-thi-mai.pdf', 'approved', FALSE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab68d', '6ad99c8cf7f49d74eebab559', '6ad99c8cf7f49d74eebab532', '6ad99c8cf7f49d74eebab53e', 'Lê Hoàng Long', 'candidate3@gmail.com', '0312564037', 'cv-6ad99c8cf7f49d74eebab53e-6ad99c8cf7f49d74eebab559.pdf', 'CV_le-hoang-long.pdf', 'rejected', TRUE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab68e', '6ad99c8cf7f49d74eebab561', '6ad99c8cf7f49d74eebab533', '6ad99c8cf7f49d74eebab53f', 'Phạm Minh Đức', 'candidate4@gmail.com', '0338023039', 'cv-6ad99c8cf7f49d74eebab53f-6ad99c8cf7f49d74eebab561.pdf', 'CV_pham-minh-duc.pdf', 'pending', FALSE, FALSE, FALSE, NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab68f', '6ad99c8cf7f49d74eebab567', '6ad99c8cf7f49d74eebab534', '6ad99c8cf7f49d74eebab540', 'Vũ Thị Thảo', 'candidate5@gmail.com', '0347300538', 'cv-6ad99c8cf7f49d74eebab540-6ad99c8cf7f49d74eebab567.pdf', 'CV_vu-thi-thao.pdf', 'approved', TRUE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab690', '6ad99c8cf7f49d74eebab56e', '6ad99c8cf7f49d74eebab535', '6ad99c8cf7f49d74eebab541', 'Hoàng Gia Huy', 'candidate6@gmail.com', '0310950018', 'cv-6ad99c8cf7f49d74eebab541-6ad99c8cf7f49d74eebab56e.pdf', 'CV_hoang-gia-huy.pdf', 'rejected', FALSE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab691', '6ad99c8cf7f49d74eebab576', '6ad99c8cf7f49d74eebab536', '6ad99c8cf7f49d74eebab542', 'Đặng Ngọc Ánh', 'candidate7@gmail.com', '0390238749', 'cv-6ad99c8cf7f49d74eebab542-6ad99c8cf7f49d74eebab576.pdf', 'CV_dang-ngoc-anh.pdf', 'pending', TRUE, FALSE, FALSE, NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab692', '6ad99c8cf7f49d74eebab57c', '6ad99c8cf7f49d74eebab537', '6ad99c8cf7f49d74eebab543', 'Bùi Quang Hải', 'candidate8@gmail.com', '0373524433', 'cv-6ad99c8cf7f49d74eebab543-6ad99c8cf7f49d74eebab57c.pdf', 'CV_bui-quang-hai.pdf', 'approved', FALSE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab693', '6ad99c8cf7f49d74eebab583', '6ad99c8cf7f49d74eebab538', '6ad99c8cf7f49d74eebab544', 'Đỗ Phương Linh', 'candidate9@gmail.com', '0380845032', 'cv-6ad99c8cf7f49d74eebab544-6ad99c8cf7f49d74eebab583.pdf', 'CV_do-phuong-linh.pdf', 'rejected', TRUE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab694', '6ad99c8cf7f49d74eebab58b', '6ad99c8cf7f49d74eebab539', '6ad99c8cf7f49d74eebab545', 'Ngô Thành Nam', 'candidate10@gmail.com', '0313803066', 'cv-6ad99c8cf7f49d74eebab545-6ad99c8cf7f49d74eebab58b.pdf', 'CV_ngo-thanh-nam.pdf', 'pending', FALSE, FALSE, FALSE, NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab695', '6ad99c8cf7f49d74eebab591', '6ad99c8cf7f49d74eebab530', '6ad99c8cf7f49d74eebab546', 'Dương Quốc Bảo', 'candidate11@gmail.com', '0337729272', 'cv-6ad99c8cf7f49d74eebab546-6ad99c8cf7f49d74eebab591.pdf', 'CV_duong-quoc-bao.pdf', 'approved', TRUE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab696', '6ad99c8cf7f49d74eebab598', '6ad99c8cf7f49d74eebab531', '6ad99c8cf7f49d74eebab547', 'Hồ Bích Ngọc', 'candidate12@gmail.com', '0365057498', 'cv-6ad99c8cf7f49d74eebab547-6ad99c8cf7f49d74eebab598.pdf', 'CV_ho-bich-ngoc.pdf', 'rejected', FALSE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab697', '6ad99c8cf7f49d74eebab5a0', '6ad99c8cf7f49d74eebab532', '6ad99c8cf7f49d74eebab548', 'Lý Triều Vĩ', 'candidate13@gmail.com', '0322560666', 'cv-6ad99c8cf7f49d74eebab548-6ad99c8cf7f49d74eebab5a0.pdf', 'CV_ly-trieu-vi.pdf', 'pending', TRUE, FALSE, FALSE, NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab698', '6ad99c8cf7f49d74eebab5a6', '6ad99c8cf7f49d74eebab533', '6ad99c8cf7f49d74eebab549', 'Trịnh Thùy Trang', 'candidate14@gmail.com', '0339684038', 'cv-6ad99c8cf7f49d74eebab549-6ad99c8cf7f49d74eebab5a6.pdf', 'CV_trinh-thuy-trang.pdf', 'approved', FALSE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab699', '6ad99c8cf7f49d74eebab5ad', '6ad99c8cf7f49d74eebab534', '6ad99c8cf7f49d74eebab54a', 'Đinh Hữu Phước', 'candidate15@gmail.com', '0397602432', 'cv-6ad99c8cf7f49d74eebab54a-6ad99c8cf7f49d74eebab5ad.pdf', 'CV_dinh-huu-phuoc.pdf', 'rejected', TRUE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab69a', '6ad99c8cf7f49d74eebab5b5', '6ad99c8cf7f49d74eebab535', '6ad99c8cf7f49d74eebab53c', 'Nguyễn Văn An', 'candidate1@gmail.com', '0339198035', 'cv-6ad99c8cf7f49d74eebab53c-6ad99c8cf7f49d74eebab5b5.pdf', 'CV_nguyen-van-an.pdf', 'pending', FALSE, FALSE, FALSE, NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab69b', '6ad99c8cf7f49d74eebab5bb', '6ad99c8cf7f49d74eebab536', '6ad99c8cf7f49d74eebab53d', 'Trần Thị Mai', 'candidate2@gmail.com', '0379831289', 'cv-6ad99c8cf7f49d74eebab53d-6ad99c8cf7f49d74eebab5bb.pdf', 'CV_tran-thi-mai.pdf', 'approved', TRUE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab69c', '6ad99c8cf7f49d74eebab5c2', '6ad99c8cf7f49d74eebab537', '6ad99c8cf7f49d74eebab53e', 'Lê Hoàng Long', 'candidate3@gmail.com', '0312564037', 'cv-6ad99c8cf7f49d74eebab53e-6ad99c8cf7f49d74eebab5c2.pdf', 'CV_le-hoang-long.pdf', 'rejected', FALSE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab69d', '6ad99c8cf7f49d74eebab5ca', '6ad99c8cf7f49d74eebab538', '6ad99c8cf7f49d74eebab53f', 'Phạm Minh Đức', 'candidate4@gmail.com', '0338023039', 'cv-6ad99c8cf7f49d74eebab53f-6ad99c8cf7f49d74eebab5ca.pdf', 'CV_pham-minh-duc.pdf', 'pending', TRUE, FALSE, FALSE, NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab69e', '6ad99c8cf7f49d74eebab5d0', '6ad99c8cf7f49d74eebab539', '6ad99c8cf7f49d74eebab540', 'Vũ Thị Thảo', 'candidate5@gmail.com', '0347300538', 'cv-6ad99c8cf7f49d74eebab540-6ad99c8cf7f49d74eebab5d0.pdf', 'CV_vu-thi-thao.pdf', 'approved', FALSE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab69f', '6ad99c8cf7f49d74eebab5d7', '6ad99c8cf7f49d74eebab530', '6ad99c8cf7f49d74eebab541', 'Hoàng Gia Huy', 'candidate6@gmail.com', '0310950018', 'cv-6ad99c8cf7f49d74eebab541-6ad99c8cf7f49d74eebab5d7.pdf', 'CV_hoang-gia-huy.pdf', 'rejected', TRUE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab6a0', '6ad99c8cf7f49d74eebab5df', '6ad99c8cf7f49d74eebab531', '6ad99c8cf7f49d74eebab542', 'Đặng Ngọc Ánh', 'candidate7@gmail.com', '0390238749', 'cv-6ad99c8cf7f49d74eebab542-6ad99c8cf7f49d74eebab5df.pdf', 'CV_dang-ngoc-anh.pdf', 'pending', FALSE, FALSE, FALSE, NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab6a1', '6ad99c8cf7f49d74eebab5e5', '6ad99c8cf7f49d74eebab532', '6ad99c8cf7f49d74eebab543', 'Bùi Quang Hải', 'candidate8@gmail.com', '0373524433', 'cv-6ad99c8cf7f49d74eebab543-6ad99c8cf7f49d74eebab5e5.pdf', 'CV_bui-quang-hai.pdf', 'approved', TRUE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab6a2', '6ad99c8cf7f49d74eebab5ec', '6ad99c8cf7f49d74eebab533', '6ad99c8cf7f49d74eebab544', 'Đỗ Phương Linh', 'candidate9@gmail.com', '0380845032', 'cv-6ad99c8cf7f49d74eebab544-6ad99c8cf7f49d74eebab5ec.pdf', 'CV_do-phuong-linh.pdf', 'rejected', FALSE, FALSE, FALSE, '2026-10-22 05:18:04', '2026-10-22 05:18:04', '2026-10-22 05:18:04'),
('6ad99c8cf7f49d74eebab6a3', '6ad99c8cf7f49d74eebab5f4', '6ad99c8cf7f49d74eebab534', '6ad99c8cf7f49d74eebab545', 'Ngô Thành Nam', 'candidate10@gmail.com', '0313803066', 'cv-6ad99c8cf7f49d74eebab545-6ad99c8cf7f49d74eebab5f4.pdf', 'CV_ngo-thanh-nam.pdf', 'pending', TRUE, FALSE, FALSE, NULL, '2026-10-22 05:18:04', '2026-10-22 05:18:04');

-- ------------------------------------------------------------------
-- Table: audit_logs (Nhật ký kiểm toán hệ thống)
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `admin_id` VARCHAR(50) DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `target_type` VARCHAR(100) DEFAULT NULL,
  `target_id` VARCHAR(50) DEFAULT NULL,
  `ip` VARCHAR(50) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `audit_logs` (`id`, `admin_id`, `action`, `target_type`, `target_id`, `ip`, `created_at`) VALUES
('6ad9a42de357a45c359d21e5', '6ad99cb3160059482dd41b9c', 'admin.login', 'System', '6ad99cb3160059482dd41b9c', '1.55.80.11', '2026-10-22 05:50:37'),
('6ad9a486e357a45c359d2212', '6ad99cb3160059482dd41b9c', 'employer.approve', 'Employer', '6ad99c8cf7f49d74eebab531', '1.55.80.11', '2026-10-22 05:52:06'),
('6ad9a8e01edcbcca60690a4c', '6ad99cb3160059482dd41b9c', 'candidate.bulkBan', 'Candidate', 'bulk', '1.55.80.11', '2026-10-22 06:10:40'),
('6ad9a8fb1edcbcca60690a5d', '6ad99cb3160059482dd41b9c', 'candidate.unban', 'Candidate', '6ad99c8cf7f49d74eebab543', '1.55.80.11', '2026-10-22 06:11:07'),
('6ad9b0e010658e0aebede797', '6ad99cb3160059482dd41b9c', 'employer.bulkApprove', 'Employer', 'bulk', '1.55.80.11', '2026-10-22 06:44:48'),
('6ad9b0e6564e11988b05952c', '6ad99cb3160059482dd41b9c', 'admin.login', 'System', '6ad99cb3160059482dd41b9c', '1.55.80.11', '2026-10-22 06:44:54');

SET FOREIGN_KEY_CHECKS = 1;
-- ==================================================================
-- KẾT THÚC FILE SQL
-- ==================================================================
