// src/services/fuzzySearch.service.js
const NodeCache = require("node-cache");
const normalizeVi = require("../utils/normalizeVi");
const { Skill, Job, Employer } = require("../models");
const { EMPLOYER_STATUS, JOB_MODERATION } = require("../config/constants");

const vocabCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
const VOCAB_CACHE_KEY = "itjobs_search_vocabulary";

/**
 * Danh từ điển công nghệ thông tin chuyên biệt
 */
const BASE_IT_VOCABULARY = [
  // Programming Languages
  "javascript", "typescript", "python", "golang", "java", "csharp", "c++", "cpp",
  "php", "ruby", "rust", "swift", "kotlin", "dart", "scala",

  // Frontend & Web
  "frontend", "front-end", "react", "reactjs", "vue", "vuejs", "angular", "nextjs",
  "nuxtjs", "html", "css", "tailwind", "tailwindcss", "bootstrap", "sass", "scss",
  "redux", "web", "ui/ux", "designer", "figma",

  // Backend & Frameworks
  "backend", "back-end", "nodejs", "node.js", "express", "expressjs", "nestjs",
  "django", "flask", "fastapi", "spring", "springboot", "laravel", "rails",
  "asp.net", ".net", "dotnet", "graphql", "rest api", "microservices",

  // Mobile
  "mobile", "ios", "android", "react native", "reactnative", "flutter",

  // DevOps & Cloud & SysAdmin
  "devops", "cloud", "docker", "kubernetes", "k8s", "aws", "azure", "gcp",
  "ci/cd", "cicd", "linux", "terraform", "jenkins", "ansible", "nginx", "kafka", "rabbitmq",

  // Databases
  "database", "sql", "mysql", "postgresql", "postgres", "mongodb", "redis",
  "oracle", "elasticsearch", "sqlite",

  // QA & Testing
  "tester", "qa", "qc", "automation test", "automation tester", "manual test",
  "manual tester", "selenium", "cypress", "playwright", "postman", "jmeter",

  // Data & AI
  "data", "data engineer", "data analyst", "data scientist", "machine learning",
  "deep learning", "ai", "artificial intelligence", "big data", "power bi", "tableau",

  // Roles & Levels
  "developer", "engineer", "programmer", "architect", "lead", "tech lead",
  "team lead", "manager", "project manager", "product manager", "scrum master",
  "product owner", "security", "intern", "fresher", "junior", "middle", "senior",
  "fullstack", "full-stack",

  // Vietnamese Terms
  "lap trinh vien", "lập trình viên",
  "ky su phan mem", "kỹ sư phần mềm",
  "chuyen vien", "chuyên viên",
  "thuc tap sinh", "thực tập sinh",
  "truong nhom", "trưởng nhóm",
  "quan ly", "quản lý",
  "tuyen dung", "tuyển dụng",
  "kiem thu", "kiểm thử"
];

/**
 * Tính khoảng cách Damerau-Levenshtein giữa 2 chuỗi
 * Hỗ trợ các phép: chèn, xóa, thay thế và hoán vị 2 ký tự liền kề (transposition)
 */
function damerauLevenshtein(source, target) {
  if (source === target) return 0;
  if (!source || source.length === 0) return target ? target.length : 0;
  if (!target || target.length === 0) return source ? source.length : 0;

  const s = source.toLowerCase();
  const t = target.toLowerCase();
  const ls = s.length;
  const lt = t.length;

  const d = [];
  for (let i = 0; i <= ls; i++) {
    d[i] = [];
    d[i][0] = i;
  }
  for (let j = 0; j <= lt; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= ls; i++) {
    for (let j = 1; j <= lt; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,        // deletion
        d[i][j - 1] + 1,        // insertion
        d[i - 1][j - 1] + cost  // substitution
      );

      // Transposition
      if (
        i > 1 &&
        j > 1 &&
        s[i - 1] === t[j - 2] &&
        s[i - 2] === t[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[ls][lt];
}

/**
 * Ngưỡng khoảng cách cho phép dựa trên độ dài từ
 */
function getMaxAllowedDistance(wordLen) {
  if (wordLen <= 3) return 1;
  if (wordLen <= 6) return 1;
  if (wordLen <= 11) return 2;
  return 3;
}

/**
 * Lấy toàn bộ từ điển tìm kiếm (gồm từ điển gốc + động từ database)
 */
async function getVocabulary() {
  const cached = vocabCache.get(VOCAB_CACHE_KEY);
  if (cached) return cached;

  const vocabSet = new Set();
  const displayMap = new Map(); // normalized -> display form

  // Nạp từ điển gốc
  for (const term of BASE_IT_VOCABULARY) {
    const norm = normalizeVi(term);
    vocabSet.add(norm);
    if (!displayMap.has(norm)) {
      displayMap.set(norm, term);
    }
  }

  try {
    // 1. Kỹ năng từ bảng skills
    if (Skill) {
      const skills = await Skill.find({}).select("name slug").lean();
      skills.forEach((s) => {
        if (s.name) {
          const normName = normalizeVi(s.name);
          vocabSet.add(normName);
          displayMap.set(normName, s.name);
        }
        if (s.slug) {
          const normSlug = normalizeVi(s.slug);
          vocabSet.add(normSlug);
          if (!displayMap.has(normSlug)) displayMap.set(normSlug, s.name);
        }
      });
    }

    // 2. Tiêu đề công việc đang mở tuyển dụng
    if (Job) {
      const activeJobs = await Job.find({
        employerActive: true,
        moderation: JOB_MODERATION.VISIBLE,
        deletedAt: null,
      })
        .select("title skills")
        .limit(100)
        .lean();

      activeJobs.forEach((j) => {
        if (j.title) {
          const normTitle = normalizeVi(j.title);
          vocabSet.add(normTitle);
          displayMap.set(normTitle, j.title);

          // Tách các từ đơn trong tiêu đề
          const words = normTitle.split(/\s+/).filter((w) => w.length > 2);
          words.forEach((w) => vocabSet.add(w));
        }
        if (Array.isArray(j.skills)) {
          j.skills.forEach((sk) => {
            if (sk.name) {
              const normSk = normalizeVi(sk.name);
              vocabSet.add(normSk);
              displayMap.set(normSk, sk.name);
            }
          });
        }
      });
    }

    // 3. Tên công ty đang hoạt động
    if (Employer) {
      const activeEmployers = await Employer.find({
        status: EMPLOYER_STATUS.ACTIVE,
        deletedAt: null,
      })
        .select("companyName")
        .limit(100)
        .lean();

      activeEmployers.forEach((emp) => {
        if (emp.companyName) {
          const normEmp = normalizeVi(emp.companyName);
          vocabSet.add(normEmp);
          displayMap.set(normEmp, emp.companyName);
        }
      });
    }
  } catch (err) {
    // Fallback an toàn nếu DB đang khởi tạo hoặc kiểm thử đơn
  }

  const result = {
    terms: Array.from(vocabSet),
    displayMap,
  };

  vocabCache.set(VOCAB_CACHE_KEY, result);
  return result;
}

/**
 * Xóa cache từ điển khi có cập nhật job/skill mới
 */
function clearVocabCache() {
  vocabCache.del(VOCAB_CACHE_KEY);
}

/**
 * Tìm gợi ý sửa lỗi chính tả cho một từ đơn (Single word typo tolerance)
 */
function findClosestWord(word, vocabularyTerms) {
  const normWord = normalizeVi(word);
  if (!normWord || normWord.length < 2) return null;

  // Nếu từ đã nằm trong từ điển (chính xác), không cần sửa
  if (vocabularyTerms.includes(normWord)) {
    return { term: normWord, distance: 0 };
  }

  const maxDist = getMaxAllowedDistance(normWord.length);
  let bestMatch = null;
  let minDistance = Infinity;

  for (const term of vocabularyTerms) {
    // Bỏ qua nếu chênh lệch độ dài vượt quá maxDist
    if (Math.abs(term.length - normWord.length) > maxDist) continue;

    // Ưu tiên các từ có cùng ký tự đầu tiên
    const sameFirstChar = term[0] === normWord[0];
    const dist = damerauLevenshtein(normWord, term);

    if (dist <= maxDist && dist > 0) {
      // Đánh giá điểm ưu tiên: khoảng cách nhỏ hơn, hoặc cùng khoảng cách nhưng cùng ký tự đầu
      if (
        dist < minDistance ||
        (dist === minDistance && sameFirstChar && bestMatch && !bestMatch.sameFirstChar)
      ) {
        minDistance = dist;
        bestMatch = { term, distance: dist, sameFirstChar };
      }
    }
  }

  return bestMatch;
}

/**
 * Kiểm tra và đưa ra gợi ý "Có phải bạn muốn tìm..." (Did You Mean)
 * Hỗ trợ cả từ đơn và cụm nhiều từ (multi-word queries)
 */
async function findDidYouMean(rawQuery) {
  if (!rawQuery || typeof rawQuery !== "string") return null;
  const trimmed = rawQuery.trim();
  if (trimmed.length < 2) return null;

  const normQuery = normalizeVi(trimmed);
  const { terms, displayMap } = await getVocabulary();

  // 1. Kiểm tra xem cả cụm từ có khớp gần với cụm từ nào không
  const maxPhraseDist = getMaxAllowedDistance(normQuery.length);
  let bestPhraseMatch = null;
  let minPhraseDist = Infinity;

  for (const term of terms) {
    if (term.includes(" ")) {
      const dist = damerauLevenshtein(normQuery, term);
      if (dist <= maxPhraseDist && dist < minPhraseDist) {
        minPhraseDist = dist;
        bestPhraseMatch = term;
      }
    }
  }

  if (bestPhraseMatch && minPhraseDist > 0) {
    const display = displayMap.get(bestPhraseMatch) || bestPhraseMatch;
    return {
      original: trimmed,
      suggestion: bestPhraseMatch,
      displayText: display,
      distance: minPhraseDist,
    };
  }

  // 2. Xử lý từng từ trong cụm từ (Token-based correction)
  const tokens = normQuery.split(/\s+/).filter(Boolean);
  const correctedTokens = [];
  let hasCorrection = false;
  let totalDistance = 0;

  for (const token of tokens) {
    const match = findClosestWord(token, terms);
    if (match && match.distance > 0) {
      correctedTokens.push(match.term);
      hasCorrection = true;
      totalDistance += match.distance;
    } else {
      correctedTokens.push(token);
    }
  }

  if (hasCorrection) {
    const suggestedQuery = correctedTokens.join(" ");
    if (suggestedQuery !== normQuery) {
      // Tìm display text phù hợp nhất nếu có
      const display = displayMap.get(suggestedQuery) || suggestedQuery;
      return {
        original: trimmed,
        suggestion: suggestedQuery,
        displayText: display,
        distance: totalDistance,
      };
    }
  }

  return null;
}

/**
 * Gợi ý tìm kiếm tức thì cho Auto-complete dropdown (Search suggestions)
 */
async function getAutocompleteSuggestions(query, limit = 5) {
  if (!query || typeof query !== "string") {
    return { suggestions: [], didYouMean: null };
  }

  const normQuery = normalizeVi(query.trim());
  if (!normQuery) {
    return { suggestions: [], didYouMean: null };
  }

  const { terms, displayMap } = await getVocabulary();

  // 1. Tìm các từ bắt đầu bằng tiền tố query (Prefix matches)
  const prefixMatches = [];
  // 2. Tìm các từ chứa query (Substring matches)
  const containsMatches = [];

  for (const term of terms) {
    if (term === normQuery) continue; // trùng hoàn toàn không cần gợi ý dạng prefix
    if (term.startsWith(normQuery)) {
      const display = displayMap.get(term) || term;
      prefixMatches.push({ text: display, query: term, score: 10 });
    } else if (term.includes(normQuery)) {
      const display = displayMap.get(term) || term;
      containsMatches.push({ text: display, query: term, score: 5 });
    }
  }

  const results = [...prefixMatches, ...containsMatches].slice(0, limit);

  // 3. Tìm gợi ý "Có phải bạn muốn tìm..." nếu gõ sai chính tả
  const didYouMean = await findDidYouMean(query);

  return {
    query,
    suggestions: results,
    didYouMean,
  };
}

module.exports = {
  damerauLevenshtein,
  getVocabulary,
  clearVocabCache,
  findClosestWord,
  findDidYouMean,
  getAutocompleteSuggestions,
  BASE_IT_VOCABULARY,
};
