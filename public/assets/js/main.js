// public/assets/js/main.js
document.addEventListener("DOMContentLoaded", () => {
  // 1. Đồng bộ phân trang (pagination-select)
  const paginationSelects = document.querySelectorAll(".pagination-select");
  paginationSelects.forEach((select) => {
    select.addEventListener("change", (e) => {
      const page = e.target.value;
      if (!page) return;
      const url = new URL(window.location.href);
      url.searchParams.set("page", page);
      window.location.href = url.toString();
    });
  });

  // 2. Bộ lọc tìm kiếm nhanh Cấp bậc & Hình thức làm việc
  const filterPosition = document.getElementById("filterPosition");
  const filterWorkingForm = document.getElementById("filterWorkingForm");

  if (filterPosition) {
    filterPosition.addEventListener("change", (e) => {
      const val = e.target.value;
      const url = new URL(window.location.href);
      if (val) {
        url.searchParams.set("position", val);
      } else {
        url.searchParams.delete("position");
      }
      url.searchParams.delete("page"); // reset về trang 1
      window.location.href = url.toString();
    });
  }

  if (filterWorkingForm) {
    filterWorkingForm.addEventListener("change", (e) => {
      const val = e.target.value;
      const url = new URL(window.location.href);
      if (val) {
        url.searchParams.set("workingForm", val);
      } else {
        url.searchParams.delete("workingForm");
      }
      url.searchParams.delete("page"); // reset về trang 1
      window.location.href = url.toString();
    });
  }

  // 3. Mobile navigation menu toggle
  const mobileMenuBtn = document.querySelector("#mobileMenuBtn");
  const mobileNav = document.querySelector("#mobileNav");
  if (mobileMenuBtn && mobileNav) {
    mobileMenuBtn.addEventListener("click", () => {
      mobileNav.classList.toggle("hidden");
    });
  }
});
