// public/assets/js/ai-features.js
// Quản lý tất cả tương tác Client-side cho 6 tính năng AI của VN.ITJobs

function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') : '';
}

// -------------------------------------------------------------
// 1. Candidate: AI CV Match & Gap Analysis
// -------------------------------------------------------------
window.initAiCvMatch = function (jobId) {
  const modal = document.getElementById('modalAiCvMatch');
  const openBtn = document.getElementById('btnOpenAiCvMatch');
  const closeBtn = document.getElementById('btnCloseAiCvMatch');
  const form = document.getElementById('formAiCvMatch');
  const loading = document.getElementById('aiCvMatchLoading');
  const resultDiv = document.getElementById('aiCvMatchResult');

  if (!modal || !openBtn) return;

  openBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    });
  }

  // Đóng khi click ngoài modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('aiCvFileInput');
      const cvTextInput = document.getElementById('aiCvTextInput');

      const formData = new FormData();
      formData.append('jobId', jobId);

      if (fileInput && fileInput.files[0]) {
        formData.append('cv', fileInput.files[0]);
      } else if (cvTextInput && cvTextInput.value.trim()) {
        formData.append('cvText', cvTextInput.value.trim());
      } else {
        alert('Vui lòng chọn 1 file PDF CV hoặc dán văn bản CV của bạn.');
        return;
      }

      form.classList.add('hidden');
      loading.classList.remove('hidden');
      resultDiv.classList.add('hidden');

      try {
        const res = await fetch('/api/ai/match-cv', {
          method: 'POST',
          headers: {
            'x-csrf-token': getCsrfToken(),
          },
          body: formData,
        });

        const data = await res.json();
        loading.classList.add('hidden');

        if (!res.ok || !data.success) {
          alert(data.message || 'Không thể phân tích CV lúc này. Vui lòng thử lại.');
          form.classList.remove('hidden');
          return;
        }

        renderMatchResult(data.data);
        resultDiv.classList.remove('hidden');
      } catch (err) {
        console.error(err);
        loading.classList.add('hidden');
        alert('Lỗi kết nối máy chủ khi phân tích AI. Vui lòng thử lại.');
        form.classList.remove('hidden');
      }
    });
  }

  function renderMatchResult(match) {
    const scoreEl = document.getElementById('aiMatchScore');
    const summaryEl = document.getElementById('aiMatchSummary');
    const matchedSkillsEl = document.getElementById('aiMatchedSkills');
    const missingSkillsEl = document.getElementById('aiMissingSkills');
    const adviceEl = document.getElementById('aiMatchAdvice');

    const score = match.matchScore || 0;
    if (scoreEl) {
      scoreEl.innerText = score + '%';
      scoreEl.className = 'text-4xl font-black ' + (score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-blue-600' : 'text-amber-600');
    }

    if (summaryEl) summaryEl.innerText = match.summary || '';

    if (matchedSkillsEl) {
      matchedSkillsEl.innerHTML = (match.matchedSkills || [])
        .map(s => `<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold"><i class="fa-solid fa-check text-[10px]"></i> ${s}</span>`)
        .join(' ') || '<span class="text-xs text-gray-500">Chưa ghi nhận kỹ năng khớp trực tiếp</span>';
    }

    if (missingSkillsEl) {
      missingSkillsEl.innerHTML = (match.missingSkills || [])
        .map(s => `<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-semibold"><i class="fa-solid fa-triangle-exclamation text-[10px]"></i> ${s}</span>`)
        .join(' ') || '<span class="text-xs text-gray-500">CV đáp ứng đầy đủ yêu cầu chính</span>';
    }

    if (adviceEl) {
      adviceEl.innerHTML = (match.advice || [])
        .map(adv => `<li class="flex items-start gap-2 text-sm text-gray-700"><i class="fa-solid fa-lightbulb text-amber-500 mt-1 shrink-0"></i> <span>${adv}</span></li>`)
        .join('');
    }
  }

  const resetBtn = document.getElementById('btnResetAiCvMatch');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resultDiv.classList.add('hidden');
      form.classList.remove('hidden');
    });
  }
};

// -------------------------------------------------------------
// 2. Candidate: AI Interview Prep
// -------------------------------------------------------------
window.initAiInterviewPrep = function (jobId) {
  const modal = document.getElementById('modalAiInterview');
  const openBtn = document.getElementById('btnOpenAiInterview');
  const closeBtn = document.getElementById('btnCloseAiInterview');
  const loading = document.getElementById('aiInterviewLoading');
  const container = document.getElementById('aiInterviewQuestions');

  if (!modal || !openBtn) return;

  openBtn.addEventListener('click', async () => {
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Nếu chưa load câu hỏi thì tải ngay
    if (container.dataset.loaded !== 'true') {
      await loadQuestions();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  });

  async function loadQuestions() {
    loading.classList.remove('hidden');
    container.innerHTML = '';

    try {
      const res = await fetch('/api/ai/interview-prep', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
        body: JSON.stringify({ jobId }),
      });

      const data = await res.json();
      loading.classList.add('hidden');

      if (!res.ok || !data.success) {
        container.innerHTML = `<div class="p-4 bg-red-50 text-red-700 text-sm rounded">Không thể tải bộ câu hỏi lúc này: ${data.message || ''}</div>`;
        return;
      }

      container.dataset.loaded = 'true';
      const questions = data.data || [];
      renderQuestions(questions);
    } catch (err) {
      loading.classList.add('hidden');
      container.innerHTML = `<div class="p-4 bg-red-50 text-red-700 text-sm rounded">Lỗi kết nối khi tạo câu hỏi phỏng vấn.</div>`;
    }
  }

  function renderQuestions(questions) {
    if (!questions.length) {
      container.innerHTML = `<p class="text-sm text-gray-500">Chưa có câu hỏi phỏng vấn cho vị trí này.</p>`;
      return;
    }

    container.innerHTML = questions
      .map((item, index) => {
        const isTech = item.type === 'technical';
        const badgeColor = isTech ? 'bg-blue-50 text-[#0088FF] border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200';
        const badgeLabel = isTech ? 'Kỹ thuật (Technical)' : 'Hành vi (Behavioral)';

        return `
          <div class="border border-gray-200 rounded-lg p-4 bg-white shadow-xs">
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-xs font-bold text-gray-500 uppercase">Câu hỏi #${index + 1}</span>
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badgeColor}">${badgeLabel}</span>
            </div>
            <h4 class="font-bold text-gray-900 text-base mb-3 leading-snug">${item.question}</h4>
            
            <details class="group bg-gray-50 rounded-lg p-3 border border-gray-200/80 cursor-pointer">
              <summary class="flex items-center justify-between font-semibold text-xs text-[#0088FF] select-none">
                <span class="flex items-center gap-1.5"><i class="fa-solid fa-sparkles"></i> Gợi ý trả lời & Ý chính từ AI</span>
                <i class="fa-solid fa-chevron-down group-open:rotate-180 transition-transform"></i>
              </summary>
              <div class="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-700 leading-relaxed">
                <p class="font-medium text-gray-900 mb-1.5">💡 Định hướng câu trả lời:</p>
                <p class="text-gray-700 mb-3">${item.suggestedAnswer || ''}</p>
                ${
                  item.keyPoints && item.keyPoints.length
                    ? `<p class="font-medium text-gray-900 text-xs mb-1">Các ý chính cần làm nổi bật:</p>
                       <ul class="list-disc list-inside text-xs text-gray-600 space-y-1">
                         ${item.keyPoints.map(kp => `<li>${kp}</li>`).join('')}
                       </ul>`
                    : ''
                }
              </div>
            </details>
          </div>
        `;
      })
      .join('');
  }
};

// -------------------------------------------------------------
// 3. Employer: AI Smart Job Description Generator
// -------------------------------------------------------------
window.initAiJdGenerator = function () {
  const triggerBtn = document.getElementById('btnAiGenerateJd');
  const titleInput = document.getElementById('title');
  const positionSelect = document.getElementById('position');
  const skillsInput = document.getElementById('skills');
  const workingFormSelect = document.getElementById('workingForm');
  const descTextarea = document.getElementById('description');

  if (!triggerBtn || !descTextarea) return;

  triggerBtn.addEventListener('click', async () => {
    const title = titleInput ? titleInput.value.trim() : '';
    if (!title) {
      alert('Vui lòng nhập "Tên công việc" trước khi nhờ AI tạo bản mô tả chi tiết.');
      if (titleInput) titleInput.focus();
      return;
    }

    const position = positionSelect ? positionSelect.value : 'middle';
    const skills = skillsInput ? skillsInput.value : '';
    const workingForm = workingFormSelect ? workingFormSelect.value : 'office';

    const originalBtnHtml = triggerBtn.innerHTML;
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> AI đang soạn thảo JD...`;

    try {
      const res = await fetch('/api/ai/generate-jd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
        body: JSON.stringify({ title, position, skills, workingForm }),
      });

      const data = await res.json();
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = originalBtnHtml;

      if (!res.ok || !data.success) {
        alert(data.message || 'Không thể tạo mô tả lúc này.');
        return;
      }

      const generated = data.data;
      const htmlContent = generated.descriptionHtml || generated.text || '';
      
      descTextarea.value = htmlContent;
      alert('✨ Đã sinh bản mô tả công việc (JD) chuyên nghiệp thành công! Bạn có thể chỉnh sửa lại theo ý muốn trước khi lưu.');
      descTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      console.error(err);
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = originalBtnHtml;
      alert('Lỗi kết nối khi gọi AI tạo mô tả.');
    }
  });
};

// -------------------------------------------------------------
// 4. Employer: AI CV Screening & Executive Summary
// -------------------------------------------------------------
window.initAiCvScreening = function (applicationId) {
  const btn = document.getElementById('btnAiScreenCv');
  const resultCard = document.getElementById('aiScreenResultCard');
  const loading = document.getElementById('aiScreenLoading');

  if (!btn || !resultCard) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.classList.add('opacity-75');
    loading.classList.remove('hidden');
    resultCard.classList.add('hidden');

    try {
      const res = await fetch(`/api/ai/screen-cv/${applicationId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
      });

      const data = await res.json();
      btn.disabled = false;
      btn.classList.remove('opacity-75');
      loading.classList.add('hidden');

      if (!res.ok || !data.success) {
        alert(data.message || 'Không thể sàng lọc hồ sơ bằng AI.');
        return;
      }

      const screen = data.data;
      renderScreenResult(screen);
      resultCard.classList.remove('hidden');
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.classList.remove('opacity-75');
      loading.classList.add('hidden');
      alert('Lỗi kết nối khi chạy AI sàng lọc CV.');
    }
  });

  function renderScreenResult(screen) {
    const scoreEl = document.getElementById('aiScreenScore');
    const summaryEl = document.getElementById('aiScreenSummary');
    const strengthsEl = document.getElementById('aiScreenStrengths');
    const concernsEl = document.getElementById('aiScreenConcerns');
    const recBadge = document.getElementById('aiScreenRecommendation');

    const score = screen.matchScore || 0;
    if (scoreEl) {
      scoreEl.innerText = score + '%';
      scoreEl.className = 'text-3xl font-black ' + (score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-blue-600' : 'text-amber-600');
    }

    if (summaryEl) summaryEl.innerText = screen.executiveSummary || '';

    if (strengthsEl) {
      strengthsEl.innerHTML = (screen.strengths || [])
        .map(s => `<li class="flex items-start gap-2 text-sm text-gray-700"><i class="fa-solid fa-circle-check text-emerald-600 mt-1 shrink-0 text-xs"></i><span>${s}</span></li>`)
        .join('');
    }

    if (concernsEl) {
      concernsEl.innerHTML = (screen.concerns || [])
        .map(c => `<li class="flex items-start gap-2 text-sm text-gray-700"><i class="fa-solid fa-circle-question text-amber-500 mt-1 shrink-0 text-xs"></i><span>${c}</span></li>`)
        .join('');
    }

    if (recBadge) {
      const rec = screen.recommendation;
      let badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
      let badgeText = 'Nên phỏng vấn';
      if (rec === 'hire_interview') {
        badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        badgeText = 'Khuyên nên phỏng vấn (Ưu tiên)';
      } else if (rec === 'consider') {
        badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
        badgeText = 'Cân nhắc / Dự phòng';
      } else if (rec === 'reject') {
        badgeClass = 'bg-red-50 text-red-700 border-red-200';
        badgeText = 'Không phù hợp yêu cầu';
      }
      recBadge.className = `inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${badgeClass}`;
      recBadge.innerText = badgeText;
    }
  }
};

// -------------------------------------------------------------
// 5. Admin: AI Job Fraud & Policy Moderation Scan
// -------------------------------------------------------------
window.initAiJobModeration = function () {
  const modal = document.getElementById('modalAiJobModeration');
  const closeBtn = document.getElementById('btnCloseAiJobMod');

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    });
  }

  window.scanJobWithAi = async function (jobId) {
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const loading = document.getElementById('aiModLoading');
    const content = document.getElementById('aiModContent');

    loading.classList.remove('hidden');
    content.classList.add('hidden');

    try {
      const res = await fetch(`/api/ai/moderate-job/${jobId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
      });

      const data = await res.json();
      loading.classList.add('hidden');

      if (!res.ok || !data.success) {
        alert(data.message || 'Lỗi quét AI tin tuyển dụng.');
        modal.classList.add('hidden');
        return;
      }

      renderModResult(data.data);
      content.classList.remove('hidden');
    } catch (err) {
      loading.classList.add('hidden');
      alert('Lỗi kết nối khi quét an toàn tin tuyển dụng.');
      modal.classList.add('hidden');
    }
  };

  function renderModResult(mod) {
    const badge = document.getElementById('aiModRiskBadge');
    const scoreEl = document.getElementById('aiModScore');
    const flagsDiv = document.getElementById('aiModFlags');
    const assessmentEl = document.getElementById('aiModAssessment');

    if (scoreEl) scoreEl.innerText = (mod.score || 0) + ' / 100';

    if (badge) {
      if (mod.riskLevel === 'safe') {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300';
        badge.innerHTML = '<i class="fa-solid fa-shield-check mr-1"></i> An toàn (Safe)';
      } else if (mod.riskLevel === 'warning') {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-300';
        badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Cảnh báo (Warning)';
      } else {
        badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-300';
        badge.innerHTML = '<i class="fa-solid fa-ban mr-1"></i> Rủi ro cao / Gian lận (Danger)';
      }
    }

    if (assessmentEl) assessmentEl.innerText = mod.assessment || '';

    if (flagsDiv) {
      if (mod.flags && mod.flags.length) {
        flagsDiv.innerHTML = mod.flags
          .map(f => `<span class="inline-block px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-medium mr-2 mb-2"><i class="fa-solid fa-flag mr-1"></i> ${f}</span>`)
          .join('');
      } else {
        flagsDiv.innerHTML = '<span class="text-xs text-emerald-700 font-medium"><i class="fa-solid fa-circle-check mr-1"></i> Không phát hiện từ khóa lừa đảo hoặc dấu hiệu bất thường.</span>';
      }
    }
  }
};

// -------------------------------------------------------------
// 6. Admin: AI Market Insights Report
// -------------------------------------------------------------
window.initAiMarketInsights = function () {
  const openBtn = document.getElementById('btnAiMarketInsights');
  const modal = document.getElementById('modalAiMarketInsights');
  const closeBtn = document.getElementById('btnCloseAiMarketInsights');
  const loading = document.getElementById('aiMarketLoading');
  const content = document.getElementById('aiMarketContent');

  if (!openBtn || !modal) return;

  openBtn.addEventListener('click', async () => {
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (content.dataset.loaded !== 'true') {
      await loadInsights();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  });

  async function loadInsights() {
    loading.classList.remove('hidden');
    content.classList.add('hidden');

    try {
      const res = await fetch('/api/ai/market-insights');
      const data = await res.json();
      loading.classList.add('hidden');

      if (!res.ok || !data.success) {
        alert(data.message || 'Không thể tải báo cáo thị trường.');
        modal.classList.add('hidden');
        return;
      }

      content.dataset.loaded = 'true';
      renderInsights(data.data);
      content.classList.remove('hidden');
    } catch (err) {
      loading.classList.add('hidden');
      alert('Lỗi kết nối khi tải báo cáo thị trường AI.');
      modal.classList.add('hidden');
    }
  }

  function renderInsights(marketData) {
    const { stats, insights } = marketData;

    const hotSkillsDiv = document.getElementById('aiMarketHotSkills');
    const salaryEl = document.getElementById('aiMarketSalary');
    const demandEl = document.getElementById('aiMarketDemand');
    const adviceEl = document.getElementById('aiMarketAdvice');

    if (hotSkillsDiv) {
      const skills = Array.isArray(insights.hotSkills) ? insights.hotSkills : [];
      hotSkillsDiv.innerHTML = skills
        .map(sk => `<span class="px-3 py-1 rounded-full bg-blue-50 text-[#0088FF] border border-blue-200 text-xs font-bold inline-flex items-center gap-1.5"><i class="fa-solid fa-fire text-amber-500"></i> ${sk}</span>`)
        .join(' ');
    }

    if (salaryEl) salaryEl.innerText = insights.salaryTrends || '';
    if (demandEl) demandEl.innerText = insights.hiringDemand || '';
    if (adviceEl) adviceEl.innerText = insights.strategicAdvice || '';
  }
};
