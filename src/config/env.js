require("dotenv").config();
const { z } = require("zod");

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  TRUST_PROXY: z.string().transform((v) => v === "true" || v === "1").default("false"),
  MONGODB_URI: z.string({
    required_error: "MONGODB_URI là biến môi trường bắt buộc",
  }).min(1, "MONGODB_URI không được để trống"),
  COOKIE_SECRET: z.string({
    required_error: "COOKIE_SECRET là biến môi trường bắt buộc",
  }).min(32, "COOKIE_SECRET phải có ít nhất 32 ký tự"),
  JWT_SECRET: z.string({
    required_error: "JWT_SECRET là biến môi trường bắt buộc",
  }).min(32, "JWT_SECRET phải có ít nhất 32 ký tự"),
  ADMIN_JWT_SECRET: z.string({
    required_error: "ADMIN_JWT_SECRET là biến môi trường bắt buộc",
  }).min(32, "ADMIN_JWT_SECRET phải có ít nhất 32 ký tự"),
  ADMIN_PATH: z.string().default("admin"),
  EMPLOYER_REQUIRE_APPROVAL: z.string().transform((v) => v === "true" || v === "1").default("true"),
  STORAGE_DRIVER: z.enum(["local", "cloudinary"]).default("local"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("VN.ITJobs <noreply@vnitjobs.vn>"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Lỗi cấu hình biến môi trường (.env):");
  console.error(parsed.error.format());
  process.exit(1);
}

module.exports = parsed.data;
