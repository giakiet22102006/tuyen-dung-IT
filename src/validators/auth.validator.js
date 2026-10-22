// src/validators/auth.validator.js
const { z } = require("zod");

// Password rule: tối thiểu 8 ký tự, phải chứa ít nhất 1 chữ cái và 1 chữ số
const passwordSchema = z
  .string({ required_error: "Mật khẩu không được để trống" })
  .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
  .regex(/[A-Za-z]/, "Mật khẩu phải chứa ít nhất một chữ cái")
  .regex(/[0-9]/, "Mật khẩu phải chứa ít nhất một chữ số");

const candidateSignupSchema = z.object({
  fullName: z
    .string({ required_error: "Họ tên không được để trống" })
    .trim()
    .min(2, "Họ tên phải từ 2 ký tự trở lên"),
  email: z
    .string({ required_error: "Email không được để trống" })
    .trim()
    .email("Email không đúng định dạng")
    .toLowerCase(),
  password: passwordSchema,
});

const employerSignupSchema = z.object({
  companyName: z
    .string({ required_error: "Tên công ty không được để trống" })
    .trim()
    .min(2, "Tên công ty phải từ 2 ký tự trở lên"),
  email: z
    .string({ required_error: "Email không được để trống" })
    .trim()
    .email("Email không đúng định dạng")
    .toLowerCase(),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z
    .string({ required_error: "Email không được để trống" })
    .trim()
    .email("Email không đúng định dạng")
    .toLowerCase(),
  password: z
    .string({ required_error: "Mật khẩu không được để trống" })
    .min(1, "Mật khẩu không được để trống"),
});

const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: "Mật khẩu hiện tại không được để trống" })
      .min(1, "Mật khẩu hiện tại không được để trống"),
    newPassword: passwordSchema,
    confirmPassword: z
      .string({ required_error: "Xác nhận mật khẩu không được để trống" })
      .min(1, "Vui lòng xác nhận mật khẩu mới"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "Mật khẩu mới không được trùng với mật khẩu hiện tại",
    path: ["newPassword"],
  });

module.exports = {
  candidateSignupSchema,
  employerSignupSchema,
  loginSchema,
  changePasswordSchema,
};
