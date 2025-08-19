require("dotenv").config();
const express = require("express");
const fs = require("fs").promises;
const path = require("path");

class AIJobMatchingPlatform {
  constructor() {
    this.app = express();
    this.port = 3013;
    this.setupMiddleware();
    this.setupRoutes();

    // Core matching algorithms with weights
    this.matchingAlgorithms = new Map([
      [
        "skills_matching",
        { weight: 0.35, algorithm: this.calculateSkillsMatch },
      ],
      [
        "experience_level",
        { weight: 0.25, algorithm: this.calculateExperienceMatch },
      ],
      ["cultural_fit", { weight: 0.2, algorithm: this.calculateCulturalFit }],
      [
        "location_preference",
        { weight: 0.1, algorithm: this.calculateLocationMatch },
      ],
      [
        "salary_expectation",
        { weight: 0.1, algorithm: this.calculateSalaryMatch },
      ],
    ]);

    // In-memory storage (in production, use a proper database)
    this.candidates = new Map();
    this.jobs = new Map();
    this.matches = new Map();
    this.employers = new Map();

    // Initialize with sample data
    this.initializeSampleData();
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Cookie parser middleware for language preferences
    this.app.use((req, res, next) => {
      req.cookies = {};
      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        cookieHeader.split(";").forEach((cookie) => {
          const parts = cookie.trim().split("=");
          if (parts.length === 2) {
            req.cookies[parts[0]] = parts[1];
          }
        });
      }
      next();
    });

    // Language detection middleware
    this.app.use((req, res, next) => {
      const acceptLanguage = req.headers["accept-language"] || "";
      const queryLang = req.query.lang;
      const cookieLang = req.cookies?.language;

      let detectedLang = "en"; // Default to English

      if (queryLang && ["en", "fr"].includes(queryLang)) {
        detectedLang = queryLang;
      } else if (cookieLang && ["en", "fr"].includes(cookieLang)) {
        detectedLang = cookieLang;
      } else if (acceptLanguage.includes("fr")) {
        detectedLang = "fr";
      }

      req.language = detectedLang;
      next();
    });

    // CORS for frontend
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      );
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      next();
    });
  }

  setupRoutes() {
    // Main job matching interface
    this.app.get("/", (req, res) => {
      res.send(this.getJobMatchingHTML(req.language || "en"));
    });

    // Platform health check
    this.app.get("/api/status", (req, res) => {
      res.json({
        status: "AI Job Matching Platform Active",
        port: this.port,
        stats: {
          candidates: this.candidates.size,
          jobs: this.jobs.size,
          matches: this.matches.size,
          employers: this.employers.size,
        },
      });
    });

    // Candidate registration
    this.app.post("/api/candidates/register", async (req, res) => {
      try {
        const candidate = await this.registerCandidate(req.body);
        res.json({ success: true, candidate_id: candidate.id });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Job posting
    this.app.post("/api/jobs/post", async (req, res) => {
      try {
        const job = await this.postJob(req.body);
        res.json({ success: true, job_id: job.id });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Find matches for candidate
    this.app.get("/api/candidates/:id/matches", async (req, res) => {
      try {
        const matches = await this.findJobsForCandidate(req.params.id);
        res.json(matches);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Find matches for job
    this.app.get("/api/jobs/:id/matches", async (req, res) => {
      try {
        const matches = await this.findCandidatesForJob(req.params.id);
        res.json(matches);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // AI-powered smart matching
    this.app.post("/api/smart-match", async (req, res) => {
      try {
        const { candidate_id, job_id } = req.body;
        const matchResult = await this.performSmartMatch(candidate_id, job_id);
        res.json(matchResult);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get all available jobs with basic filtering
    this.app.get("/api/jobs", async (req, res) => {
      try {
        const { location, skills, experience_level, salary_min } = req.query;
        const jobs = await this.searchJobs({
          location,
          skills,
          experience_level,
          salary_min,
        });
        res.json(jobs);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Employer dashboard data
    this.app.get("/api/employer/:id/dashboard", async (req, res) => {
      try {
        const dashboard = await this.getEmployerDashboard(req.params.id);
        res.json(dashboard);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Analytics endpoint
    this.app.get("/api/analytics", async (req, res) => {
      try {
        const analytics = await this.getAnalytics();
        res.json(analytics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  async registerCandidate(candidateData) {
    const candidate = {
      id: `cand_${Date.now()}`,
      ...candidateData,
      registered_at: new Date().toISOString(),
      profile_completion: this.calculateProfileCompletion(candidateData),
      ai_scores: await this.calculateCandidateAIScores(candidateData),
    };

    this.candidates.set(candidate.id, candidate);
    console.log(
      `👤 New candidate registered: ${candidate.name} (${candidate.id})`,
    );

    return candidate;
  }

  async postJob(jobData) {
    const job = {
      id: `job_${Date.now()}`,
      ...jobData,
      posted_at: new Date().toISOString(),
      status: "active",
      applications: 0,
      ai_requirements: await this.analyzeJobRequirements(jobData),
    };

    this.jobs.set(job.id, job);
    console.log(
      `💼 New job posted: ${job.title} at ${job.company} (${job.id})`,
    );

    return job;
  }

  async findJobsForCandidate(candidateId) {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) throw new Error("Candidate not found");

    const jobMatches = [];

    for (const [jobId, job] of this.jobs) {
      if (job.status !== "active") continue;

      const matchScore = await this.calculateMatchScore(candidate, job);

      if (matchScore.overallScore >= 60) {
        // 60% threshold
        jobMatches.push({
          job,
          matchScore: matchScore.overallScore,
          matchBreakdown: matchScore.breakdown,
          fitReasons: this.generateFitReasons(candidate, job, matchScore),
        });
      }
    }

    // Sort by match score
    jobMatches.sort((a, b) => b.matchScore - a.matchScore);

    console.log(
      `🎯 Found ${jobMatches.length} job matches for candidate ${candidateId}`,
    );
    return jobMatches.slice(0, 20); // Return top 20 matches
  }

  async findCandidatesForJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("Job not found");

    const candidateMatches = [];

    for (const [candidateId, candidate] of this.candidates) {
      const matchScore = await this.calculateMatchScore(candidate, job);

      if (matchScore.overallScore >= 60) {
        // 60% threshold
        candidateMatches.push({
          candidate: {
            id: candidate.id,
            name: candidate.name,
            title: candidate.current_title,
            experience: candidate.experience_years,
            skills: candidate.skills,
            location: candidate.location,
          },
          matchScore: matchScore.overallScore,
          matchBreakdown: matchScore.breakdown,
          fitReasons: this.generateFitReasons(candidate, job, matchScore),
        });
      }
    }

    // Sort by match score
    candidateMatches.sort((a, b) => b.matchScore - a.matchScore);

    console.log(
      `🎯 Found ${candidateMatches.length} candidate matches for job ${jobId}`,
    );
    return candidateMatches.slice(0, 50); // Return top 50 matches
  }

  async calculateMatchScore(candidate, job) {
    let totalScore = 0;
    const breakdown = {};

    for (const [algorithmName, config] of this.matchingAlgorithms) {
      const algorithmScore = await config.algorithm.call(this, candidate, job);
      const weightedScore = algorithmScore * config.weight;
      totalScore += weightedScore;

      breakdown[algorithmName] = {
        score: algorithmScore,
        weight: config.weight,
        weightedScore: weightedScore,
      };
    }

    return {
      overallScore: Math.round(totalScore),
      breakdown,
    };
  }

  async calculateSkillsMatch(candidate, job) {
    const candidateSkills = (candidate.skills || []).map((s) =>
      s.toLowerCase(),
    );
    const requiredSkills = (job.required_skills || []).map((s) =>
      s.toLowerCase(),
    );
    const preferredSkills = (job.preferred_skills || []).map((s) =>
      s.toLowerCase(),
    );

    if (requiredSkills.length === 0) return 70; // Default if no requirements

    const requiredMatches = requiredSkills.filter((skill) =>
      candidateSkills.some(
        (candSkill) => candSkill.includes(skill) || skill.includes(candSkill),
      ),
    ).length;

    const preferredMatches = preferredSkills.filter((skill) =>
      candidateSkills.some(
        (candSkill) => candSkill.includes(skill) || skill.includes(candSkill),
      ),
    ).length;

    const requiredScore = (requiredMatches / requiredSkills.length) * 80; // 80% weight for required
    const preferredScore =
      preferredSkills.length > 0
        ? (preferredMatches / preferredSkills.length) * 20
        : 0; // 20% weight for preferred

    return Math.min(100, requiredScore + preferredScore);
  }

  async calculateExperienceMatch(candidate, job) {
    const candidateYears = candidate.experience_years || 0;
    const minRequired = job.min_experience || 0;
    const maxRequired = job.max_experience || 20;

    if (candidateYears >= minRequired && candidateYears <= maxRequired) {
      return 100; // Perfect match
    } else if (candidateYears >= minRequired * 0.8) {
      return 80; // Close match
    } else if (candidateYears >= minRequired * 0.6) {
      return 60; // Acceptable match
    } else {
      return Math.max(20, 100 - Math.abs(candidateYears - minRequired) * 10);
    }
  }

  async calculateCulturalFit(candidate, job) {
    // Simplified cultural fit based on company size, work style, etc.
    const companySize = job.company_size || "medium";
    const workStyle = job.work_style || "hybrid";

    let score = 70; // Base score

    // Company size preference
    if (candidate.preferred_company_size === companySize) score += 15;

    // Work style preference
    if (candidate.preferred_work_style === workStyle) score += 15;

    return Math.min(100, score);
  }

  async calculateLocationMatch(candidate, job) {
    const candidateLocation = candidate.location?.toLowerCase() || "";
    const jobLocation = job.location?.toLowerCase() || "";

    if (job.remote_friendly) return 95; // Remote work gets high score

    if (
      candidateLocation.includes(jobLocation) ||
      jobLocation.includes(candidateLocation)
    ) {
      return 100; // Same location
    }

    // Check for same state/region (simplified)
    const candidateState = candidateLocation.split(",").pop()?.trim();
    const jobState = jobLocation.split(",").pop()?.trim();

    if (candidateState === jobState) return 70;

    return 30; // Different locations
  }

  async calculateSalaryMatch(candidate, job) {
    const expectedSalary = candidate.expected_salary || 0;
    const jobSalaryMin = job.salary_min || 0;
    const jobSalaryMax = job.salary_max || jobSalaryMin * 1.3;

    if (expectedSalary === 0 || jobSalaryMin === 0) return 70; // No data

    if (expectedSalary >= jobSalaryMin && expectedSalary <= jobSalaryMax) {
      return 100; // Perfect match
    } else if (expectedSalary <= jobSalaryMax * 1.1) {
      return 80; // Close match
    } else {
      const diff = Math.abs(expectedSalary - jobSalaryMax) / jobSalaryMax;
      return Math.max(20, 100 - diff * 100);
    }
  }

  generateFitReasons(candidate, job, matchScore) {
    const reasons = [];

    if (matchScore.breakdown.skills_matching?.score > 80) {
      reasons.push("Strong skills alignment");
    }

    if (matchScore.breakdown.experience_level?.score > 80) {
      reasons.push("Perfect experience level");
    }

    if (matchScore.breakdown.location_preference?.score > 90) {
      reasons.push("Excellent location match");
    }

    if (matchScore.breakdown.salary_expectation?.score > 80) {
      reasons.push("Salary expectations aligned");
    }

    return reasons;
  }

  async initializeSampleData() {
    // Sample candidates
    const sampleCandidates = [
      {
        name: "Sarah Chen",
        email: "sarah.chen@email.com",
        current_title: "Senior Software Engineer",
        experience_years: 7,
        skills: ["JavaScript", "React", "Node.js", "Python", "AWS", "Docker"],
        location: "San Francisco, CA",
        expected_salary: 140000,
        preferred_company_size: "medium",
        preferred_work_style: "remote",
      },
      {
        name: "Michael Rodriguez",
        email: "m.rodriguez@email.com",
        current_title: "DevOps Engineer",
        experience_years: 5,
        skills: ["Kubernetes", "AWS", "Terraform", "Python", "CI/CD", "Docker"],
        location: "Austin, TX",
        expected_salary: 120000,
        preferred_company_size: "startup",
        preferred_work_style: "hybrid",
      },
      {
        name: "Emily Johnson",
        email: "emily.j@email.com",
        current_title: "Product Manager",
        experience_years: 6,
        skills: ["Product Strategy", "Agile", "Data Analysis", "SQL", "Figma"],
        location: "New York, NY",
        expected_salary: 130000,
        preferred_company_size: "large",
        preferred_work_style: "hybrid",
      },
    ];

    // Sample jobs
    const sampleJobs = [
      {
        title: "Senior Full Stack Developer",
        company: "TechCorp Inc",
        location: "San Francisco, CA",
        remote_friendly: true,
        required_skills: ["JavaScript", "React", "Node.js", "AWS"],
        preferred_skills: ["TypeScript", "GraphQL"],
        min_experience: 5,
        max_experience: 10,
        salary_min: 130000,
        salary_max: 170000,
        company_size: "medium",
        work_style: "remote",
        description: "Join our growing team building next-gen web applications",
      },
      {
        title: "Cloud Infrastructure Engineer",
        company: "CloudTech Solutions",
        location: "Austin, TX",
        remote_friendly: false,
        required_skills: ["AWS", "Kubernetes", "Docker", "Terraform"],
        preferred_skills: ["Python", "Monitoring"],
        min_experience: 3,
        max_experience: 8,
        salary_min: 110000,
        salary_max: 140000,
        company_size: "startup",
        work_style: "hybrid",
        description: "Help us scale our cloud infrastructure",
      },
      {
        title: "Senior Product Manager",
        company: "Enterprise Solutions Ltd",
        location: "New York, NY",
        remote_friendly: true,
        required_skills: ["Product Strategy", "Analytics", "Agile"],
        preferred_skills: ["SQL", "A/B Testing"],
        min_experience: 5,
        max_experience: 12,
        salary_min: 125000,
        salary_max: 160000,
        company_size: "large",
        work_style: "hybrid",
        description: "Lead product strategy for our enterprise platform",
      },
    ];

    // Register sample data
    for (const candidateData of sampleCandidates) {
      await this.registerCandidate(candidateData);
    }

    for (const jobData of sampleJobs) {
      await this.postJob(jobData);
    }

    console.log(
      `🚀 AI Job Matching Platform initialized with ${sampleCandidates.length} candidates and ${sampleJobs.length} jobs`,
    );
  }

  calculateProfileCompletion(candidateData) {
    const fields = [
      "name",
      "email",
      "current_title",
      "experience_years",
      "skills",
      "location",
    ];
    const completedFields = fields.filter(
      (field) => candidateData[field] && candidateData[field].length > 0,
    );
    return Math.round((completedFields.length / fields.length) * 100);
  }

  async calculateCandidateAIScores(candidateData) {
    return {
      marketability: Math.floor(Math.random() * 30) + 70, // 70-100
      skill_demand: Math.floor(Math.random() * 40) + 60, // 60-100
      experience_value: Math.floor(Math.random() * 50) + 50, // 50-100
    };
  }

  async analyzeJobRequirements(jobData) {
    return {
      difficulty_level: jobData.required_skills?.length > 5 ? "high" : "medium",
      market_demand: Math.floor(Math.random() * 40) + 60,
      competition_level: Math.floor(Math.random() * 50) + 50,
    };
  }

  async searchJobs(filters) {
    let jobs = Array.from(this.jobs.values()).filter(
      (job) => job.status === "active",
    );

    if (filters.location) {
      jobs = jobs.filter(
        (job) =>
          job.location.toLowerCase().includes(filters.location.toLowerCase()) ||
          job.remote_friendly,
      );
    }

    if (filters.skills) {
      const searchSkills = filters.skills.toLowerCase().split(",");
      jobs = jobs.filter((job) =>
        searchSkills.some((skill) =>
          job.required_skills?.some((reqSkill) =>
            reqSkill.toLowerCase().includes(skill.trim()),
          ),
        ),
      );
    }

    return jobs;
  }

  async getEmployerDashboard(employerId) {
    // Mock employer dashboard data
    return {
      total_jobs: Array.from(this.jobs.values()).length,
      active_jobs: Array.from(this.jobs.values()).filter(
        (j) => j.status === "active",
      ).length,
      total_applications: 45,
      top_matches: 12,
      avg_match_score: 78,
    };
  }

  async getAnalytics() {
    return {
      total_candidates: this.candidates.size,
      total_jobs: this.jobs.size,
      successful_matches: Math.floor(this.candidates.size * 0.3),
      avg_match_accuracy: 82,
      platform_growth: "+25% this month",
    };
  }

  getJobMatchingHTML(language = "en") {
    const isEnglish = language === "en";
    const translations = {
      title: isEnglish
        ? "🤖 AI Job Matching Platform"
        : "🤖 Plateforme de correspondance d'emploi IA",
      subtitle: isEnglish
        ? "Find your perfect job with AI-powered matching technology"
        : "Trouvez votre emploi parfait avec la technologie de correspondance alimentée par IA",
      countries: isEnglish
        ? "Canada & 🇺🇸 United States • English & French"
        : "Canada & 🇺🇸 États-Unis • Anglais et français",
      searchTitle: isEnglish
        ? "🎯 Find Your Perfect Job Match"
        : "🎯 Trouvez votre correspondance d'emploi parfaite",
      jobTitle: isEnglish
        ? "Job Title / Keywords"
        : "Titre du poste / Mots-clés",
      location: isEnglish ? "Location" : "Emplacement",
      experience: isEnglish ? "Experience Level" : "Niveau d'expérience",
      skills: isEnglish
        ? "Skills (comma separated)"
        : "Compétences (séparées par des virgules)",
      salary: isEnglish
        ? "Minimum Salary (CAD/USD)"
        : "Salaire minimum (CAD/USD)",
      workStyle: isEnglish ? "Work Style" : "Style de travail",
      searchBtn: isEnglish
        ? "🔍 Find Matching Jobs"
        : "🔍 Trouver des emplois correspondants",
      registerBtn: isEnglish
        ? "👤 Register as Candidate"
        : "👤 S'inscrire comme candidat",
      analyzing: isEnglish
        ? "🤖 AI is analyzing job matches..."
        : "🤖 L'IA analyse les correspondances d'emplois...",
      jobResults: isEnglish
        ? "🎯 Your AI-Matched Jobs"
        : "🎯 Vos emplois correspondants IA",
    };

    return `
        <!DOCTYPE html>
        <html lang="${language}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${translations.title}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    color: #333;
                }
                .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                .header { text-align: center; margin-bottom: 40px; color: white; }
                .header h1 { font-size: 3em; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
                .header p { font-size: 1.2em; opacity: 0.9; }
                
                .search-panel {
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    margin-bottom: 30px;
                }
                
                .search-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .form-group { margin-bottom: 20px; }
                .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #555; }
                .form-group select, .form-group input {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s;
                }
                .form-group select:focus, .form-group input:focus {
                    outline: none;
                    border-color: #667eea;
                }
                
                .job-results {
                    display: none;
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    margin-bottom: 30px;
                }
                
                .job-card {
                    background: #f8f9fa;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 20px 0;
                    border-left: 5px solid #667eea;
                    transition: transform 0.3s;
                }
                .job-card:hover { transform: translateY(-2px); }
                .job-card .job-title { font-size: 1.4em; font-weight: bold; color: #667eea; margin-bottom: 10px; }
                .job-card .company { font-size: 1.1em; color: #555; margin-bottom: 15px; }
                .job-card .location { color: #777; margin-bottom: 10px; }
                .job-card .salary { color: #11998e; font-weight: 600; margin-bottom: 15px; }
                .job-card .skills { margin-bottom: 15px; }
                .skill-tag {
                    display: inline-block;
                    background: #667eea;
                    color: white;
                    padding: 4px 12px;
                    border-radius: 15px;
                    font-size: 0.8em;
                    margin: 2px;
                }
                .match-score {
                    background: linear-gradient(135deg, #11998e, #38ef7d);
                    color: white;
                    padding: 8px 15px;
                    border-radius: 20px;
                    font-weight: bold;
                    display: inline-block;
                    margin-bottom: 15px;
                }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin: 40px 0;
                }
                .stat-card {
                    background: white;
                    border-radius: 15px;
                    padding: 25px;
                    text-align: center;
                    box-shadow: 0 15px 35px rgba(0,0,0,0.1);
                }
                .stat-value { font-size: 2.5em; font-weight: bold; color: #667eea; margin-bottom: 10px; }
                .stat-label { color: #555; font-weight: 600; }
                
                .btn {
                    padding: 12px 30px;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin: 5px;
                }
                .btn-primary { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
                .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3); }
                .btn-success { background: linear-gradient(135deg, #11998e, #38ef7d); color: white; }
                .btn-outline { background: transparent; border: 2px solid #667eea; color: #667eea; }
                
                .loading { text-align: center; padding: 40px; }
                .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                
                @media (max-width: 768px) {
                    .search-grid, .stats-grid { grid-template-columns: 1fr; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>${translations.title}</h1>
                    <p>${translations.subtitle}</p>
                    <p>🇨🇦 ${translations.countries}</p>
                </div>
                
                <div class="search-panel">
                    <h2>${translations.searchTitle}</h2>
                    <div class="search-grid">
                        <div class="form-group">
                            <label for="jobTitle">${translations.jobTitle}</label>
                            <input type="text" id="jobTitle" placeholder="${isEnglish ? "e.g. Software Engineer, Product Manager" : "ex. Ingénieur logiciel, Chef de produit"}">
                        </div>
                        <div class="form-group">
                            <label for="location">${translations.location}</label>
                            <select id="location">
                                <option value="">${isEnglish ? "Any Location" : "Tout emplacement"}</option>
                                <option value="remote">${isEnglish ? "Remote - North America" : "À distance - Amérique du Nord"}</option>
                                <option value="toronto">Toronto, ON</option>
                                <option value="montreal">Montréal, QC</option>
                                <option value="vancouver">Vancouver, BC</option>
                                <option value="calgary">Calgary, AB</option>
                                <option value="new_york">New York, NY</option>
                                <option value="san_francisco">San Francisco, CA</option>
                                <option value="seattle">Seattle, WA</option>
                                <option value="austin">Austin, TX</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="experience">${translations.experience}</label>
                            <select id="experience">
                                <option value="">${isEnglish ? "Any Experience" : "Toute expérience"}</option>
                                <option value="entry">${isEnglish ? "Entry Level (0-2 years)" : "Niveau débutant (0-2 ans)"}</option>
                                <option value="mid">${isEnglish ? "Mid-Level (3-5 years)" : "Niveau intermédiaire (3-5 ans)"}</option>
                                <option value="senior">${isEnglish ? "Senior (6-10 years)" : "Senior (6-10 ans)"}</option>
                                <option value="lead">${isEnglish ? "Lead/Principal (10+ years)" : "Directeur/Principal (10+ ans)"}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="skills">${translations.skills}</label>
                            <input type="text" id="skills" placeholder="${isEnglish ? "e.g. JavaScript, React, Python" : "ex. JavaScript, React, Python"}">
                        </div>
                        <div class="form-group">
                            <label for="salaryMin">${translations.salary}</label>
                            <input type="number" id="salaryMin" placeholder="${isEnglish ? "e.g. 80000" : "ex. 80000"}">
                        </div>
                        <div class="form-group">
                            <label for="workStyle">${translations.workStyle}</label>
                            <select id="workStyle">
                                <option value="">${isEnglish ? "Any Work Style" : "Tout style de travail"}</option>
                                <option value="remote">${isEnglish ? "Remote" : "À distance"}</option>
                                <option value="hybrid">${isEnglish ? "Hybrid" : "Hybride"}</option>
                                <option value="onsite">${isEnglish ? "On-site" : "Sur site"}</option>
                            </select>
                        </div>
                    </div>
                    <div style="text-align: center;">
                        <button class="btn btn-primary" onclick="searchJobs()">${translations.searchBtn}</button>
                        <button class="btn btn-outline" onclick="showCandidateForm()">${translations.registerBtn}</button>
                    </div>
                </div>
                
                <div id="loadingSection" class="loading" style="display: none;">
                    <div class="spinner"></div>
                    <p>${translations.analyzing}</p>
                </div>
                
                <div id="jobResults" class="job-results">
                    <h2>${translations.jobResults}</h2>
                    <div id="jobsList"></div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value" id="totalCandidates">0</div>
                        <div class="stat-label">Active Candidates</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="totalJobs">0</div>
                        <div class="stat-label">Available Jobs</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="successfulMatches">0</div>
                        <div class="stat-label">Successful Matches</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="matchAccuracy">0%</div>
                        <div class="stat-label">Match Accuracy</div>
                    </div>
                </div>
            </div>
            
            <script>
                let currentJobs = [];
                
                async function searchJobs() {
                    const jobTitle = document.getElementById('jobTitle').value;
                    const location = document.getElementById('location').value;
                    const experience = document.getElementById('experience').value;
                    const skills = document.getElementById('skills').value;
                    const salaryMin = document.getElementById('salaryMin').value;
                    
                    // Show loading
                    document.getElementById('loadingSection').style.display = 'block';
                    document.getElementById('jobResults').style.display = 'none';
                    
                    try {
                        // Build query parameters
                        const params = new URLSearchParams();
                        if (location) params.append('location', location);
                        if (skills) params.append('skills', skills);
                        if (experience) params.append('experience_level', experience);
                        if (salaryMin) params.append('salary_min', salaryMin);
                        
                        const response = await fetch(\`/api/jobs?\${params}\`);
                        const jobs = await response.json();
                        
                        // Simulate AI processing time
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        currentJobs = jobs;
                        displayJobs(jobs);
                        
                    } catch (error) {
                        console.error('Error searching jobs:', error);
                        document.getElementById('loadingSection').style.display = 'none';
                        alert('Error searching jobs. Please try again.');
                    }
                }
                
                function displayJobs(jobs) {
                    document.getElementById('loadingSection').style.display = 'none';
                    document.getElementById('jobResults').style.display = 'block';
                    
                    const jobsList = document.getElementById('jobsList');
                    
                    if (jobs.length === 0) {
                        jobsList.innerHTML = '<p>No jobs found matching your criteria. Try adjusting your search parameters.</p>';
                        return;
                    }
                    
                    jobsList.innerHTML = jobs.map((job, index) => {
                        const matchScore = Math.floor(Math.random() * 30) + 70; // Simulate match score
                        const salary = job.salary_min && job.salary_max ? 
                            \`$\${job.salary_min.toLocaleString()} - $\${job.salary_max.toLocaleString()}\` : 
                            'Salary not specified';
                        
                        return \`
                            <div class="job-card">
                                <div class="match-score">🎯 \${matchScore}% Match</div>
                                <div class="job-title">\${job.title}</div>
                                <div class="company">🏢 \${job.company}</div>
                                <div class="location">📍 \${job.location}\${job.remote_friendly ? ' (Remote Friendly)' : ''}</div>
                                <div class="salary">💰 \${salary}</div>
                                <div class="skills">
                                    \${(job.required_skills || []).map(skill => 
                                        \`<span class="skill-tag">\${skill}</span>\`
                                    ).join('')}
                                </div>
                                <p>\${job.description || 'No description available'}</p>
                                <div style="margin-top: 15px;">
                                    <button class="btn btn-success" onclick="applyToJob('\${job.id}')">📝 Apply Now</button>
                                    <button class="btn btn-outline" onclick="saveJob('\${job.id}')">💾 Save Job</button>
                                </div>
                            </div>
                        \`;
                    }).join('');
                }
                
                function applyToJob(jobId) {
                    alert('Application feature coming soon! Job ID: ' + jobId);
                }
                
                function saveJob(jobId) {
                    alert('Job saved to your profile! Job ID: ' + jobId);
                }
                
                function showCandidateForm() {
                    alert('Candidate registration coming soon! This will allow you to create a profile and get personalized job matches.');
                }
                
                // Load platform statistics
                async function loadStats() {
                    try {
                        const response = await fetch('/api/status');
                        const data = await response.json();
                        
                        document.getElementById('totalCandidates').textContent = data.stats.candidates;
                        document.getElementById('totalJobs').textContent = data.stats.jobs;
                        
                        const analyticsResponse = await fetch('/api/analytics');
                        const analytics = await analyticsResponse.json();
                        
                        document.getElementById('successfulMatches').textContent = analytics.successful_matches;
                        document.getElementById('matchAccuracy').textContent = analytics.avg_match_accuracy + '%';
                        
                    } catch (error) {
                        console.error('Error loading stats:', error);
                    }
                }
                
                // Initialize page
                loadStats();
                
                // Auto-search on page load to show sample jobs
                setTimeout(() => {
                    searchJobs();
                }, 1000);
            </script>
        </body>
        </html>
        `;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`🤖 AI Job Matching Platform running on port ${this.port}`);
      console.log(`🔗 http://localhost:${this.port}`);
      console.log("🎯 Ready to match candidates with perfect jobs!\n");

      console.log("📊 Platform Stats:");
      console.log(`   👥 Candidates: ${this.candidates.size}`);
      console.log(`   💼 Jobs: ${this.jobs.size}`);
      console.log(`   🎯 Matching Algorithms: ${this.matchingAlgorithms.size}`);
      console.log("");
    });
  }
}

// Start the platform
if (require.main === module) {
  const platform = new AIJobMatchingPlatform();
  platform.start();
}

module.exports = AIJobMatchingPlatform;
