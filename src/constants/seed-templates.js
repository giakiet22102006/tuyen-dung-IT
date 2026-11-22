/**
 * Shared job templates, realistic salary ranges by position, and skill-matching helpers.
 * Reused across both full seeding (seed.js) and non-destructive DB sync (sync-seed-data.js).
 */

const JOB_TEMPLATES = [
  { title: "Frontend Engineer (ReactJS, NextJS)", skills: ["ReactJS", "NextJS", "TypeScript", "TailwindCSS"], positions: ["intern", "fresher", "junior", "middle"] },
  { title: "Backend Developer (NodeJS, Express)", skills: ["NodeJS", "TypeScript", "PostgreSQL", "Redis"], positions: ["fresher", "junior", "middle", "senior"] },
  { title: "Fullstack Developer (ReactJS, NodeJS)", skills: ["ReactJS", "NodeJS", "TypeScript", "MongoDB"], positions: ["junior", "middle", "senior"] },
  { title: "Java Backend Engineer (Spring Boot, Microservices)", skills: ["Java", "Spring Boot", "Microservices", "Kafka"], positions: ["junior", "middle", "senior"] },
  { title: "DevOps Engineer (AWS, Docker, K8s)", skills: ["AWS", "Docker", "Kubernetes", "CI/CD"], positions: ["junior", "middle", "senior"] },
  { title: "Mobile Developer (Flutter, Dart)", skills: ["Flutter", "REST API", "Git"], positions: ["intern", "fresher", "junior", "middle"] },
  { title: "iOS Engineer (Swift)", skills: ["iOS (Swift)", "REST API", "Git"], positions: ["fresher", "junior", "middle"] },
  { title: "Android Engineer (Kotlin)", skills: ["Android (Kotlin)", "REST API", "Git"], positions: ["fresher", "junior", "middle"] },
  { title: "Python Data Engineer", skills: ["Python", "SQL", "PostgreSQL", "Docker"], positions: ["fresher", "junior", "middle"] },
  { title: "Senior Golang Engineer", skills: ["Golang", "PostgreSQL", "Docker", "Microservices"], positions: ["senior", "manager"] },
  { title: "Automation QA/QC Engineer", skills: ["Unit Test", "Jest", "JavaScript", "CI/CD"], positions: ["intern", "fresher", "junior", "middle"] },
  { title: "Lead Frontend Architect", skills: ["ReactJS", "NextJS", "TypeScript", "GraphQL"], positions: ["manager"] },
  { title: "Software Engineer (.NET Core, C#)", skills: ["C#", ".NET Core", "PostgreSQL", "Docker"], positions: ["fresher", "junior", "middle", "senior"] },
  { title: "Cloud Solutions Architect (GCP/AWS)", skills: ["AWS", "GCP", "Kubernetes", "Docker"], positions: ["senior", "manager"] },
  { title: "Data Scientist / AI Engineer", skills: ["Python", "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow"], positions: ["junior", "middle", "senior"] },
];

// Realistic USD monthly salary ranges for Vietnam IT market
const SALARY_RANGES_BY_POSITION = {
  intern: { minBase: 250, minStep: 50, spread: 200 },
  fresher: { minBase: 450, minStep: 100, spread: 350 },
  junior: { minBase: 750, minStep: 150, spread: 450 },
  middle: { minBase: 1300, minStep: 200, spread: 700 },
  senior: { minBase: 2200, minStep: 300, spread: 1000 },
  manager: { minBase: 3200, minStep: 400, spread: 1500 },
};

// Acceptable USD bounds per position used to detect stale/unrealistic DB salary records
const SALARY_BOUNDS_BY_POSITION = {
  intern: { min: 150, max: 600 },
  fresher: { min: 350, max: 1000 },
  junior: { min: 600, max: 1600 },
  middle: { min: 1100, max: 2600 },
  senior: { min: 1800, max: 4200 },
  manager: { min: 2800, max: 6500 },
};

const KEYWORD_SKILL_RULES = [
  { pattern: /\bflutter\b|\bdart\b/i, skills: ["Flutter", "REST API", "Git"] },
  { pattern: /\bios\b|\bswift\b/i, skills: ["iOS (Swift)", "REST API", "Git"] },
  { pattern: /\bandroid\b|\bkotlin\b/i, skills: ["Android (Kotlin)", "REST API", "Git"] },
  { pattern: /\.net|c#/i, skills: ["C#", ".NET Core", "PostgreSQL", "Docker"] },
  { pattern: /\bgolang\b|\bgo\b/i, skills: ["Golang", "PostgreSQL", "Docker", "Microservices"] },
  { pattern: /\bjava\b|\bspring/i, skills: ["Java", "Spring Boot", "Microservices", "Kafka"] },
  { pattern: /\bdevops\b|\bsre\b|\bk8s\b|\bkubernetes\b/i, skills: ["AWS", "Docker", "Kubernetes", "CI/CD"] },
  { pattern: /\bcloud\b|\baws\b|\bgcp\b|\bazure\b/i, skills: ["AWS", "GCP", "Kubernetes", "Docker"] },
  { pattern: /\bai\b|\bdata scientist\b|\bmachine learning\b/i, skills: ["Python", "Machine Learning", "Deep Learning", "PyTorch"] },
  { pattern: /\bdata engineer\b|\bpython\b/i, skills: ["Python", "SQL", "PostgreSQL", "Docker"] },
  { pattern: /\bqa\b|\bqc\b|\btest/i, skills: ["Unit Test", "Jest", "JavaScript", "CI/CD"] },
  { pattern: /\bfullstack\b/i, skills: ["ReactJS", "NodeJS", "TypeScript", "MongoDB"] },
  { pattern: /\bfrontend\b|\breact/i, skills: ["ReactJS", "NextJS", "TypeScript", "TailwindCSS"] },
  { pattern: /\bbackend\b|\bnode/i, skills: ["NodeJS", "TypeScript", "PostgreSQL", "Redis"] },
  { pattern: /\bdev web\b|\bweb dev/i, skills: ["HTML/CSS", "JavaScript", "ReactJS", "NodeJS"] },
];

/**
 * Strip optional `(Mã #123)` suffix from big-mode seeded titles and find matching template.
 */
function findJobTemplateByTitle(title) {
  if (!title) return null;
  const cleaned = String(title).replace(/\s*\(Mã #\d+\)\s*$/i, "").trim().toLowerCase();
  return JOB_TEMPLATES.find((t) => t.title.toLowerCase() === cleaned) || null;
}

/**
 * Infer accurate skill names for a job title (template first, keyword fallback second).
 */
function inferSkillsForJobTitle(title) {
  const tpl = findJobTemplateByTitle(title);
  if (tpl) return tpl.skills;

  for (const rule of KEYWORD_SKILL_RULES) {
    if (rule.pattern.test(String(title || ""))) {
      return rule.skills;
    }
  }
  return null;
}

/**
 * Check if a job's salary is unrealistic for its position and return normalized { salaryMin, salaryMax } if needed.
 */
function getNormalizedSalary(position, salaryMin, salaryMax, seedIndex = 0) {
  const pos = SALARY_RANGES_BY_POSITION[position] ? position : "junior";
  const bounds = SALARY_BOUNDS_BY_POSITION[pos];
  const minNum = Number(salaryMin) || 0;
  const maxNum = Number(salaryMax) || 0;

  const isValid =
    minNum >= bounds.min &&
    maxNum <= bounds.max &&
    maxNum >= minNum;

  if (isValid) {
    return { changed: false, salaryMin: minNum, salaryMax: maxNum };
  }

  const range = SALARY_RANGES_BY_POSITION[pos];
  const newMin = range.minBase + (seedIndex % 3) * range.minStep;
  const newMax = newMin + range.spread;
  return { changed: true, salaryMin: newMin, salaryMax: newMax };
}

/**
 * Return true if an employer's logo URL is a shared demo placeholder that does not belong to that company.
 */
function isDemoLogoMismatch(logoUrl, companyName) {
  if (!logoUrl) return false;
  const lowerUrl = String(logoUrl).toLowerCase();
  if (lowerUrl.includes("/assets/images/demo/demo4.png")) return true;
  if (
    lowerUrl.includes("/assets/images/demo/image1.png") &&
    (!companyName || !String(companyName).toLowerCase().includes("lg"))
  ) {
    return true;
  }
  return false;
}

module.exports = {
  JOB_TEMPLATES,
  SALARY_RANGES_BY_POSITION,
  SALARY_BOUNDS_BY_POSITION,
  findJobTemplateByTitle,
  inferSkillsForJobTitle,
  getNormalizedSalary,
  isDemoLogoMismatch,
};
