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

  // 4. Live Search Suggestions & Typo Tolerance ("Có phải bạn muốn tìm...")
  const searchInput = document.getElementById("searchKeywordInput");
  const suggestionsBox = document.getElementById("searchSuggestionsDropdown");
  const searchForm = document.getElementById("headerSearchForm");

  if (searchInput && suggestionsBox) {
    let debounceTimer = null;

    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value.trim();

      if (query.length < 2) {
        suggestionsBox.innerHTML = "";
        suggestionsBox.classList.add("hidden");
        return;
      }

      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`);
          if (!res.ok) return;
          const data = await res.json();

          const hasSuggestions = data.suggestions && data.suggestions.length > 0;
          const hasDidYouMean = data.didYouMean && data.didYouMean.displayText;

          if (!hasSuggestions && !hasDidYouMean) {
            suggestionsBox.innerHTML = "";
            suggestionsBox.classList.add("hidden");
            return;
          }

          let html = "";

          // Mục "Có phải bạn muốn tìm..." nếu gõ sai chính tả
          if (hasDidYouMean) {
            html += `
              <div class="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 cursor-pointer border-b border-gray-100 flex items-center gap-2 suggestion-item" data-query="${data.didYouMean.suggestion}">
                <i class="fa-regular fa-lightbulb text-amber-500 text-sm"></i>
                <div class="text-sm text-gray-700">
                  <span>Có phải bạn muốn tìm: </span>
                  <strong class="text-[#0088FF] font-semibold">${data.didYouMean.displayText}</strong>?
                </div>
              </div>
            `;
          }

          // Danh sách từ khóa khớp / bắt đầu bằng tiền tố
          if (hasSuggestions) {
            html += `<div class="py-1">`;
            data.suggestions.forEach((item) => {
              html += `
                <div class="px-4 py-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-sm text-gray-800 suggestion-item transition-colors" data-query="${item.text}">
                  <div class="flex items-center gap-2.5">
                    <i class="fa-solid fa-magnifying-glass text-gray-400 text-xs"></i>
                    <span>${item.text}</span>
                  </div>
                  <span class="text-xs text-gray-400">Tìm việc làm</span>
                </div>
              `;
            });
            html += `</div>`;
          }

          suggestionsBox.innerHTML = html;
          suggestionsBox.classList.remove("hidden");

          // Bắt sự kiện click vào từng gợi ý
          suggestionsBox.querySelectorAll(".suggestion-item").forEach((el) => {
            el.addEventListener("click", () => {
              const selectedQuery = el.getAttribute("data-query");
              searchInput.value = selectedQuery;
              suggestionsBox.classList.add("hidden");
              if (searchForm) {
                searchForm.submit();
              }
            });
          });
        } catch (err) {
          // im lặng khi có lỗi mạng
        }
      }, 200);
    });

    // Ẩn dropdown khi click ra ngoài
    document.addEventListener("click", (e) => {
      if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
        suggestionsBox.classList.add("hidden");
      }
    });

    // Hiện lại nếu người dùng focus vào ô đang có nội dung
    searchInput.addEventListener("focus", () => {
      if (suggestionsBox.innerHTML.trim() !== "") {
        suggestionsBox.classList.remove("hidden");
      }
    });
  }
});
