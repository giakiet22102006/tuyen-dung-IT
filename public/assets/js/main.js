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

  // 2. Bộ lọc tìm kiếm nhanh Cấp bậc, Hình thức làm việc & Đãi ngộ IT
  const filterPosition = document.getElementById("filterPosition");
  const filterWorkingForm = document.getElementById("filterWorkingForm");
  const filterBenefit = document.getElementById("filterBenefit");

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

  if (filterBenefit) {
    filterBenefit.addEventListener("change", (e) => {
      const val = e.target.value;
      const url = new URL(window.location.href);
      if (val) {
        url.searchParams.set("benefit", val);
      } else {
        url.searchParams.delete("benefit");
      }
      url.searchParams.delete("page"); // reset về trang 1
      window.location.href = url.toString();
    });
  }

  // 2.1 Xử lý Bookmark / Lưu việc làm yêu thích (AJAX Toggle)
  document.querySelectorAll(".btn-bookmark-job").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const jobId = btn.getAttribute("data-job-id");
      if (!jobId) return;

      const csrfMeta = document.querySelector('meta[name="csrf-token"]');
      const csrfToken = csrfMeta ? csrfMeta.getAttribute("content") : "";

      try {
        btn.disabled = true;
        const res = await fetch(`/candidate/saved-jobs/${jobId}/toggle`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
        });

        if (res.status === 401 || res.status === 403) {
          if (confirm("Bạn cần đăng nhập tài khoản Ứng viên để lưu việc làm. Chuyển đến trang Đăng nhập ngay?")) {
            window.location.href = `/candidate/login?next=${encodeURIComponent(window.location.pathname)}`;
          }
          return;
        }

        const data = await res.json();
        if (data.success) {
          const icon = btn.querySelector("i");
          const textSpan = btn.querySelector("span");

          if (data.saved) {
            if (icon) {
              icon.className = "fa-solid fa-bookmark text-red-500 text-[14px]";
            }
            if (textSpan) {
              textSpan.textContent = "Đã lưu";
              textSpan.className = "hidden sm:inline text-red-600";
            }
          } else {
            if (icon) {
              icon.className = "fa-regular fa-bookmark text-[14px]";
            }
            if (textSpan) {
              textSpan.textContent = "Lưu tin";
              textSpan.className = "hidden sm:inline";
            }
          }
        } else {
          alert(data.message || "Không thể thực hiện thao tác lúc này.");
        }
      } catch (err) {
        console.error("Lỗi khi lưu việc làm:", err);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // 3. Mobile navigation menu toggle
  const mobileMenuBtn = document.querySelector("#mobileMenuBtn");
  const mobileNav = document.querySelector("#mobileNav");
  if (mobileMenuBtn && mobileNav) {
    mobileMenuBtn.addEventListener("click", () => {
      const isHidden = mobileNav.classList.toggle("hidden");
      const icon = mobileMenuBtn.querySelector("i");
      if (icon) {
        if (isHidden) {
          icon.className = "fa-solid fa-bars";
        } else {
          icon.className = "fa-solid fa-xmark";
        }
      }
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

  // 6. Interactive Hero Feature Carousel (Phương án A)
  const heroCarousel = document.getElementById("heroCarousel");
  if (heroCarousel) {
    const slides = heroCarousel.querySelectorAll(".hero-carousel-slide");
    const dots = heroCarousel.querySelectorAll(".carousel-dot");
    const prevBtn = document.getElementById("carouselPrevBtn");
    const nextBtn = document.getElementById("carouselNextBtn");
    let currentIndex = 0;
    let autoPlayTimer = null;
    const totalSlides = slides.length;

    const showSlide = (index) => {
      if (index < 0) {
        currentIndex = totalSlides - 1;
      } else if (index >= totalSlides) {
        currentIndex = 0;
      } else {
        currentIndex = index;
      }

      slides.forEach((slide, idx) => {
        if (idx === currentIndex) {
          slide.classList.add("active");
        } else {
          slide.classList.remove("active");
        }
      });

      dots.forEach((dot, idx) => {
        if (idx === currentIndex) {
          dot.classList.add("active");
          dot.classList.remove("bg-white/40");
          dot.setAttribute("aria-current", "true");
        } else {
          dot.classList.remove("active");
          dot.classList.add("bg-white/40");
          dot.removeAttribute("aria-current");
        }
      });
    };

    const nextSlide = () => {
      showSlide(currentIndex + 1);
    };

    const prevSlide = () => {
      showSlide(currentIndex - 1);
    };

    const startAutoPlay = () => {
      stopAutoPlay();
      autoPlayTimer = setInterval(nextSlide, 5500);
    };

    const stopAutoPlay = () => {
      if (autoPlayTimer) {
        clearInterval(autoPlayTimer);
        autoPlayTimer = null;
      }
    };

    // Navigation Buttons
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        nextSlide();
        startAutoPlay();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        prevSlide();
        startAutoPlay();
      });
    }

    // Dot indicators click
    dots.forEach((dot) => {
      dot.addEventListener("click", (e) => {
        const targetIndex = parseInt(e.currentTarget.getAttribute("data-index"), 10);
        if (!isNaN(targetIndex)) {
          showSlide(targetIndex);
          startAutoPlay();
        }
      });
    });

    // Pause auto-play on hover / focus
    heroCarousel.addEventListener("mouseenter", stopAutoPlay);
    heroCarousel.addEventListener("mouseleave", startAutoPlay);
    heroCarousel.addEventListener("focusin", stopAutoPlay);
    heroCarousel.addEventListener("focusout", startAutoPlay);

    // Touch Swipe Support for Mobile/Tablet
    let touchStartX = 0;
    let touchEndX = 0;

    heroCarousel.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.changedTouches[0].screenX;
        stopAutoPlay();
      },
      { passive: true }
    );

    heroCarousel.addEventListener(
      "touchend",
      (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const diffX = touchEndX - touchStartX;
        if (diffX > 45) {
          prevSlide(); // Vuốt sang phải -> Slide trước
        } else if (diffX < -45) {
          nextSlide(); // Vuốt sang trái -> Slide kế
        }
        startAutoPlay();
      },
      { passive: true }
    );

    // Khởi động chạy tự động
    startAutoPlay();
  }

  // 7. In-App Notification Bell System
  const notifBellBtn = document.getElementById("notifBellBtn");
  const notifDropdownMenu = document.getElementById("notifDropdownMenu");
  const notifBadge = document.getElementById("notifBadge");
  const notifListContainer = document.getElementById("notifListContainer");
  const notifMarkAllReadBtn = document.getElementById("notifMarkAllReadBtn");

  if (notifBellBtn && notifDropdownMenu) {
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = csrfMeta ? csrfMeta.getAttribute("content") : "";

    const formatRelativeTime = (dateStr) => {
      const now = new Date();
      const date = new Date(dateStr);
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSec < 60) return "Vừa xong";
      if (diffMin < 60) return `${diffMin} phút trước`;
      if (diffHours < 24) return `${diffHours} giờ trước`;
      if (diffDays < 7) return `${diffDays} ngày trước`;
      return date.toLocaleDateString("vi-VN");
    };

    const getIconForType = (type) => {
      switch (type) {
        case "application_new":
          return `<div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><i class="fa-solid fa-file-circle-check text-xs"></i></div>`;
        case "interview_invite":
        case "interview_schedule":
          return `<div class="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0"><i class="fa-solid fa-calendar-check text-xs"></i></div>`;
        case "status_change":
          return `<div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><i class="fa-solid fa-bell text-xs"></i></div>`;
        case "talent_invite":
          return `<div class="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><i class="fa-solid fa-handshake-angle text-xs"></i></div>`;
        default:
          return `<div class="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center shrink-0"><i class="fa-solid fa-circle-info text-xs"></i></div>`;
      }
    };

    const loadNotifications = async () => {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        // Cập nhật badge
        if (data.unreadCount > 0) {
          notifBadge.textContent = data.unreadCount > 99 ? "99+" : data.unreadCount;
          notifBadge.classList.remove("hidden");
        } else {
          notifBadge.classList.add("hidden");
        }

        if (!data.notifications || data.notifications.length === 0) {
          notifListContainer.innerHTML = `
            <div class="py-8 text-center text-gray-400 text-sm">
              <i class="fa-regular fa-bell-slash text-2xl mb-2 text-gray-300 block"></i>
              Bạn chưa có thông báo nào
            </div>
          `;
          return;
        }

        notifListContainer.innerHTML = data.notifications
          .map((n) => `
            <a href="${n.link || '#'}" class="notif-item flex items-start gap-3 p-3.5 hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-blue-50/50' : ''}" data-id="${n._id}">
              ${getIconForType(n.type)}
              <div class="flex-1 min-w-0">
                <div class="text-[13px] font-[600] text-gray-900 leading-snug flex items-center justify-between">
                  <span class="truncate">${n.title}</span>
                  ${!n.isRead ? '<span class="w-2 h-2 rounded-full bg-blue-600 shrink-0 ml-1"></span>' : ''}
                </div>
                <div class="text-[12px] text-gray-600 mt-0.5 line-clamp-2 leading-relaxed">${n.message}</div>
                <div class="text-[10.5px] text-gray-400 mt-1">${formatRelativeTime(n.createdAt)}</div>
              </div>
            </a>
          `)
          .join("");

        // Bắt sự kiện click vào từng thông báo để đánh dấu đã đọc
        notifListContainer.querySelectorAll(".notif-item").forEach((item) => {
          item.addEventListener("click", async (e) => {
            const notifId = item.getAttribute("data-id");
            if (notifId) {
              fetch(`/api/notifications/${notifId}/read`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
              }).catch(() => {});
            }
          });
        });
      } catch (err) {
        // im lặng nếu có lỗi mạng
      }
    };

    // Toggle dropdown
    notifBellBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = notifDropdownMenu.classList.contains("hidden");
      if (isHidden) {
        notifDropdownMenu.classList.remove("hidden");
        loadNotifications();
      } else {
        notifDropdownMenu.classList.add("hidden");
      }
    });

    // Click outside to close
    document.addEventListener("click", (e) => {
      if (!notifDropdownMenu.contains(e.target) && !notifBellBtn.contains(e.target)) {
        notifDropdownMenu.classList.add("hidden");
      }
    });

    // Mark all as read
    if (notifMarkAllReadBtn) {
      notifMarkAllReadBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await fetch("/api/notifications/read-all", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          });
          notifBadge.classList.add("hidden");
          loadNotifications();
        } catch (_) {}
      });
    }

    // Polling định kỳ mỗi 60s để nhận thông báo mới
    setInterval(() => {
      fetch("/api/notifications")
        .then((r) => r.json())
        .then((d) => {
          if (d.success && notifBadge) {
            if (d.unreadCount > 0) {
              notifBadge.textContent = d.unreadCount > 99 ? "99+" : d.unreadCount;
              notifBadge.classList.remove("hidden");
            } else {
              notifBadge.classList.add("hidden");
            }
          }
        })
        .catch(() => {});
    }, 60000);
  }
});
