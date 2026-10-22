// public/assets/js/ai-features.js
// Quản lý tất cả tính năng AI (VN.ITJobs AI Suite)

function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta && meta.getAttribute('content')) {
    return meta.getAttribute('content');
  }
  const input = document.querySelector('input[name="_csrf"]');
  if (input && input.value) {
    return input.value;
  }
  return '';
}

// =========================================================================
// 1. Candidate: AI CV Match & Gap Analysis
// =========================================================================
window.initAiCvMatch = function (jobId) {
  const modal = document.getElementById('modalAiCvMatch');
  const openBtn = document.getElementById('btnOpenAiCvMatch');
  const closeBtn = document.getElementById('btnCloseAiCvMatch');
  const form = document.getElementById('formAiCvMatch');
  const loading = document.getElementById('aiCvMatchLoading');
  const resultDiv = document.getElementById('aiCvMatchResult');

  if (!modal || !openBtn) return;
  if (openBtn.dataset.boundAi === 'true') return;
  openBtn.dataset.boundAi = 'true';

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

      if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('cv', fileInput.files[0]);
      } else if (cvTextInput && cvTextInput.value.trim()) {
        formData.append('cvText', cvTextInput.value.trim());
      } else {
        alert('Vui lòng chọn 1 file PDF CV hoặc dán văn bản tóm tắt CV của bạn.');
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
      const list = match.advice || match.improvements || [];
      adviceEl.innerHTML = list
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

// =========================================================================
// 2. Candidate: AI Interview Prep
// =========================================================================
window.initAiInterviewPrep = function (jobId) {
  const modal = document.getElementById('modalAiInterview');
  const openBtn = document.getElementById('btnOpenAiInterview');
  const closeBtn = document.getElementById('btnCloseAiInterview');
  const loading = document.getElementById('aiInterviewLoading');
  const container = document.getElementById('aiInterviewQuestions');

  if (!modal || !openBtn) return;
  if (openBtn.dataset.boundAi === 'true') return;
  openBtn.dataset.boundAi = 'true';

  openBtn.addEventListener('click', async () => {
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (container && container.dataset.loaded !== 'true') {
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
    if (loading) loading.classList.remove('hidden');
    if (container) container.innerHTML = '';

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
      if (loading) loading.classList.add('hidden');

      if (!res.ok || !data.success) {
        if (container) container.innerHTML = `<div class="p-4 bg-red-50 text-red-700 text-sm rounded">Không thể tải bộ câu hỏi lúc này: ${data.message || ''}</div>`;
        return;
      }

      if (container) {
        container.dataset.loaded = 'true';
        const questions = Array.isArray(data.data) ? data.data : (data.data && data.data.questions) || [];
        renderQuestions(questions);
      }
    } catch (err) {
      console.error(err);
      if (loading) loading.classList.add('hidden');
      if (container) container.innerHTML = `<div class="p-4 bg-red-50 text-red-700 text-sm rounded">Lỗi kết nối khi tạo câu hỏi phỏng vấn.</div>`;
    }
  }

  function renderQuestions(questions) {
    if (!questions || !questions.length) {
      container.innerHTML = `<p class="text-sm text-gray-500">Chưa có câu hỏi phỏng vấn cho vị trí này.</p>`;
      return;
    }

    container.innerHTML = questions
      .map((item, index) => {
        const isTech = (item.type || '').toLowerCase() === 'technical';
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

// =========================================================================
// 3. Employer: AI Smart Job Description Generator
// =========================================================================
window.initAiJdGenerator = function () {
  const triggerBtn = document.getElementById('btnAiGenerateJd');
  const titleInput = document.getElementById('title');
  const positionSelect = document.getElementById('position');
  const skillsInput = document.getElementById('skills');
  const workingFormSelect = document.getElementById('workingForm');
  const descTextarea = document.getElementById('description');

  if (!triggerBtn || !descTextarea) return;
  if (triggerBtn.dataset.boundAi === 'true') return;
  triggerBtn.dataset.boundAi = 'true';

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
      const htmlContent = generated.descriptionHtml || generated.text || (typeof generated === 'string' ? generated : '');
      
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

// =========================================================================
// 4. Employer: AI CV Screening & Executive Summary
// =========================================================================
window.initAiCvScreening = function (applicationId) {
  const btn = document.getElementById('btnAiScreenCv');
  const resultCard = document.getElementById('aiScreenResultCard');
  const loading = document.getElementById('aiScreenLoading');

  if (!btn || !resultCard) return;
  if (btn.dataset.boundAi === 'true') return;
  btn.dataset.boundAi = 'true';

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.classList.add('opacity-75');
    if (loading) loading.classList.remove('hidden');
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
      if (loading) loading.classList.add('hidden');

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
      if (loading) loading.classList.add('hidden');
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

    if (summaryEl) summaryEl.innerText = screen.executiveSummary || screen.candidateSummary || '';

    const strengthsList = screen.strengths || screen.pros || [];
    if (strengthsEl) {
      strengthsEl.innerHTML = strengthsList
        .map(s => `<li class="flex items-start gap-2 text-sm text-gray-700"><i class="fa-solid fa-circle-check text-emerald-600 mt-1 shrink-0 text-xs"></i><span>${s}</span></li>`)
        .join('');
    }

    const concernsList = screen.concerns || screen.cons || [];
    if (concernsEl) {
      concernsEl.innerHTML = concernsList
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

// =========================================================================
// 5. Admin: AI Job Fraud & Policy Moderation Scan (GLOBAL)
// =========================================================================
function renderModResult(mod) {
  const badge = document.getElementById('aiModRiskBadge');
  const scoreEl = document.getElementById('aiModScore');
  const flagsDiv = document.getElementById('aiModFlags');
  const assessmentEl = document.getElementById('aiModAssessment');

  if (scoreEl) scoreEl.innerText = (mod.score !== undefined ? mod.score : 90) + ' / 100';

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

  if (assessmentEl) assessmentEl.innerText = mod.assessment || 'Nội dung phù hợp tiêu chuẩn tin tuyển dụng.';

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

async function executeAiJobScan(url, bodyPayload = null) {
  const modal = document.getElementById('modalAiJobModeration');
  const loading = document.getElementById('aiModLoading');
  const content = document.getElementById('aiModContent');

  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.style.display = 'flex';
  modal.style.display = 'flex';

  if (loading) loading.classList.remove('hidden');
  if (content) content.classList.add('hidden');

  try {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': getCsrfToken(),
      },
    };
    if (bodyPayload) {
      options.body = JSON.stringify(bodyPayload);
    }

    const res = await fetch(url, options);
    const data = await res.json();
    if (loading) loading.classList.add('hidden');

    if (!res.ok || !data.success) {
      alert(data.message || 'Lỗi phân tích AI.');
      return;
    }

    renderModResult(data.data);
    if (content) content.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    if (loading) loading.classList.add('hidden');
    alert('Lỗi kết nối khi quét an toàn tin tuyển dụng: ' + err.message);
  }
}

// Quét trực tiếp theo ID tin tuyển dụng (ở trang chi tiết công ty)
window.scanJobWithAi = async function (jobId) {
  console.log('[AI Job Moderation] Scanning job ID:', jobId);
  executeAiJobScan(`/api/ai/moderate-job/${jobId}`);
};

// Mở giao diện AI Quét Tin Nhanh từ Dashboard
window.openQuickAiJobScanner = function () {
  const modal = document.getElementById('modalAiJobModeration');
  if (!modal) {
    console.error('Không tìm thấy #modalAiJobModeration');
    return;
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.style.display = 'flex';
  modal.style.display = 'flex';

  // Tự động kích hoạt quét mẫu ngay lần đầu mở để quản trị viên thấy kết quả trực quan
  const titleInput = document.getElementById('aiModJobTitle');
  const descInput = document.getElementById('aiModJobDesc');
  const content = document.getElementById('aiModContent');

  if (content && content.classList.contains('hidden')) {
    const title = titleInput ? titleInput.value.trim() : 'Tuyển Lập Trình Viên Backend NodeJS';
    const description = descInput ? descInput.value.trim() : 'Lương 1500$ - 2500$, làm việc tại Hà Nội, không thu phí.';
    executeAiJobScan('/api/ai/moderate-job/custom', { title, description });
  }
};

// =========================================================================
// 6. Admin: AI Market Insights Report (GLOBAL)
// =========================================================================
window.openAiMarketInsights = async function () {
  console.log('[AI Market Insights] Opening report modal...');
  const modal = document.getElementById('modalAiMarketInsights');
  if (!modal) {
    console.error('Không tìm thấy #modalAiMarketInsights');
    alert('Không tìm thấy giao diện báo cáo thị trường AI.');
    return;
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.style.display = 'flex';

  const content = document.getElementById('aiMarketContent');
  const loading = document.getElementById('aiMarketLoading');

  if (content && content.dataset.loaded === 'true') {
    return;
  }

  if (loading) loading.classList.remove('hidden');
  if (content) content.classList.add('hidden');

  try {
    const res = await fetch('/api/ai/market-insights');
    const data = await res.json();
    if (loading) loading.classList.add('hidden');

    if (!res.ok || !data.success) {
      alert(data.message || 'Không thể tải báo cáo thị trường lúc này.');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      return;
    }

    if (content) content.dataset.loaded = 'true';
    renderInsights(data.data);
    if (content) content.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    if (loading) loading.classList.add('hidden');
    alert('Lỗi kết nối khi tải báo cáo thị trường AI.');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
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

// Tự động gắn sự kiện đóng modal chung khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  // Modal Market Insights
  const modalMarket = document.getElementById('modalAiMarketInsights');
  const closeBtnMarket = document.getElementById('btnCloseAiMarketInsights');
  if (closeBtnMarket && modalMarket) {
    closeBtnMarket.addEventListener('click', () => {
      modalMarket.classList.add('hidden');
      modalMarket.classList.remove('flex');
      modalMarket.style.display = 'none';
    });
    modalMarket.addEventListener('click', (e) => {
      if (e.target === modalMarket) {
        modalMarket.classList.add('hidden');
        modalMarket.classList.remove('flex');
        modalMarket.style.display = 'none';
      }
    });
  }

  const btnOpenMarket = document.getElementById('btnAiMarketInsights');
  if (btnOpenMarket) {
    btnOpenMarket.addEventListener('click', () => {
      window.openAiMarketInsights();
    });
  }

  // Modal Moderation Scan
  const modalMod = document.getElementById('modalAiJobModeration');
  const closeBtnMod = document.getElementById('btnCloseAiJobMod');
  if (closeBtnMod && modalMod) {
    closeBtnMod.addEventListener('click', () => {
      modalMod.classList.add('hidden');
      modalMod.classList.remove('flex');
      modalMod.style.display = 'none';
    });
    modalMod.addEventListener('click', (e) => {
      if (e.target === modalMod) {
        modalMod.classList.add('hidden');
        modalMod.classList.remove('flex');
        modalMod.style.display = 'none';
      }
    });
  }

  // Nút Thử tin IT chuẩn
  const btnSafe = document.getElementById('btnPresetSafeJob');
  if (btnSafe) {
    btnSafe.addEventListener('click', () => {
      const titleInput = document.getElementById('aiModJobTitle');
      const descInput = document.getElementById('aiModJobDesc');
      if (titleInput) titleInput.value = 'Tuyển Senior Backend NodeJS Developer';
      if (descInput) descInput.value = 'Mức lương thỏa thuận 1800$ - 3000$, làm việc tại Quận 1 TP.HCM hoặc Cầu Giấy Hà Nội. Chế độ bảo hiểm, khám sức khỏe cao cấp, thưởng dự án, không thu bất kỳ chi phí tuyển dụng nào.';
      executeAiJobScan('/api/ai/moderate-job/custom', {
        title: titleInput.value,
        description: descInput.value,
        companyName: 'FPT Software',
        salary: '1800$ - 3000$'
      });
    });
  }

  // Nút Thử tin lừa đảo cọc tiền
  const btnScam = document.getElementById('btnPresetScamJob');
  if (btnScam) {
    btnScam.addEventListener('click', () => {
      const titleInput = document.getElementById('aiModJobTitle');
      const descInput = document.getElementById('aiModJobDesc');
      if (titleInput) titleInput.value = 'Việc nhẹ lương cao làm việc online tại nhà';
      if (descInput) descInput.value = 'Công việc đơn giản gõ văn bản, thu nhập 2-5 triệu/ngày. Yêu cầu chuyển khoản nạp cọc 500k giữ chỗ làm nhiệm vụ, cam kết hoàn tiền trong 24h.';
      executeAiJobScan('/api/ai/moderate-job/custom', {
        title: titleInput.value,
        description: descInput.value,
        companyName: 'Công ty Đầu Tư Toàn Cầu',
        salary: '2 - 5 triệu/ngày'
      });
    });
  }

  // Nút Quét ngay bằng AI từ Form
  const btnRunScan = document.getElementById('btnRunAiModScan');
  if (btnRunScan) {
    btnRunScan.addEventListener('click', () => {
      const titleInput = document.getElementById('aiModJobTitle');
      const descInput = document.getElementById('aiModJobDesc');
      const title = titleInput ? titleInput.value.trim() : '';
      const description = descInput ? descInput.value.trim() : '';
      if (!title && !description) {
        alert('Vui lòng nhập tiêu đề hoặc nội dung tin tuyển dụng cần quét.');
        return;
      }
      executeAiJobScan('/api/ai/moderate-job/custom', { title, description });
    });
  }

  // Khởi tạo Smart JD Generator nếu trang có các input tương ứng
  if (document.getElementById('btnAiGenerateJd')) {
    window.initAiJdGenerator();
  }

  // Đóng modal bằng phím ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.fixed.inset-0.z-50.flex').forEach((m) => {
        m.classList.add('hidden');
        m.classList.remove('flex');
      });
    }
  });
});
