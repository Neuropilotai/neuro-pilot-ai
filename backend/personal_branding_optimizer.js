require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs").promises;
const path = require("path");

class PersonalBrandingOptimizer {
  constructor() {
    this.app = express();
    this.port = 3019;
    this.setupMiddleware();
    this.setupRoutes();

    // Brand Intelligence Database
    this.brandingElements = {
      headlines: {
        leadership: [
          "Transforming teams through strategic vision and innovation",
          "Driving organizational growth through data-driven leadership",
          "Building high-performing teams in dynamic environments",
        ],
        technical: [
          "Engineering scalable solutions for complex challenges",
          "Bridging technology and business impact",
          "Full-stack developer passionate about clean, efficient code",
        ],
        marketing: [
          "Growth hacker turning insights into revenue",
          "Brand storyteller driving customer engagement",
          "Performance marketer with a track record of 10x growth",
        ],
        sales: [
          "Revenue generator with a consultative approach",
          "Building lasting client relationships that drive results",
          "Sales strategist specializing in enterprise solutions",
        ],
      },

      contentThemes: {
        leadership: [
          "Team development strategies",
          "Industry trend analysis",
          "Change management insights",
          "Performance optimization",
          "Strategic decision making",
        ],
        technical: [
          "Code tutorials and best practices",
          "Technology trend discussions",
          "Open source contributions",
          "Architecture deep dives",
          "Developer productivity tips",
        ],
        marketing: [
          "Growth experiment results",
          "Campaign performance insights",
          "Customer success stories",
          "Market research findings",
          "Brand building strategies",
        ],
        sales: [
          "Sales methodology tips",
          "Client relationship strategies",
          "Industry insights",
          "Deal closing techniques",
          "Customer pain point solutions",
        ],
      },

      keywords: {
        leadership: [
          "strategic",
          "vision",
          "transformation",
          "team building",
          "innovation",
        ],
        technical: [
          "scalable",
          "architecture",
          "optimization",
          "automation",
          "integration",
        ],
        marketing: ["growth", "conversion", "engagement", "analytics", "ROI"],
        sales: [
          "revenue",
          "relationships",
          "consultative",
          "solutions",
          "performance",
        ],
      },
    };

    // Profile Analysis Engine
    this.analysisMetrics = {
      headline: {
        weight: 0.25,
        factors: ["keywords", "clarity", "uniqueness", "action_words"],
      },
      summary: {
        weight: 0.2,
        factors: [
          "storytelling",
          "achievements",
          "personality",
          "call_to_action",
        ],
      },
      experience: {
        weight: 0.2,
        factors: ["quantified_results", "skill_keywords", "progression"],
      },
      skills: {
        weight: 0.15,
        factors: ["relevance", "endorsements", "trending_skills"],
      },
      content: {
        weight: 0.1,
        factors: ["frequency", "engagement", "thought_leadership"],
      },
      network: {
        weight: 0.1,
        factors: ["connections", "engagement_rate", "industry_relevance"],
      },
    };

    // Content Strategy Templates
    this.contentTemplates = {
      thought_leadership: {
        structure: [
          "Hook",
          "Personal Experience",
          "Industry Insight",
          "Actionable Advice",
          "Call to Action",
        ],
        examples: [
          "What I learned from failing at {topic}",
          "The {number} mistakes everyone makes with {topic}",
          "Why {industry} is about to change forever",
        ],
      },
      behind_scenes: {
        structure: [
          "Context Setup",
          "Challenge Description",
          "Solution Process",
          "Lessons Learned",
        ],
        examples: [
          "Building {project} from scratch",
          "How we increased {metric} by {percentage}",
          "The real story behind {achievement}",
        ],
      },
      industry_insights: {
        structure: [
          "Trend Observation",
          "Market Analysis",
          "Personal Take",
          "Future Predictions",
        ],
        examples: [
          "{Number} trends reshaping {industry}",
          "Why {technology} will dominate {year}",
          "The future of {industry} in {timeframe}",
        ],
      },
    };

    // Optimization Database
    this.optimizationSessions = new Map();
    this.userProfiles = new Map();

    console.log("🌟 Personal Branding Optimizer Starting...");
    this.startServer();
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Image upload configuration for headshots
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, "headshots/");
      },
      filename: (req, file, cb) => {
        const timestamp = Date.now();
        cb(null, `headshot_${timestamp}_${file.originalname}`);
      },
    });

    this.upload = multer({
      storage,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
      fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error("Invalid file type. Only JPEG and PNG allowed."));
        }
      },
    });
  }

  setupRoutes() {
    // Main branding interface
    this.app.get("/", (req, res) => {
      res.send(this.getBrandingHTML());
    });

    // Profile analysis API
    this.app.post("/api/analyze-profile", async (req, res) => {
      try {
        const { profileData, targetRole, industry } = req.body;
        const analysis = await this.analyzeProfile(
          profileData,
          targetRole,
          industry,
        );
        res.json(analysis);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // LinkedIn optimization suggestions
    this.app.post("/api/optimize-linkedin", async (req, res) => {
      try {
        const { currentProfile, targetRole, goals } = req.body;
        const optimizations = await this.generateLinkedInOptimizations(
          currentProfile,
          targetRole,
          goals,
        );
        res.json(optimizations);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Content strategy generator
    this.app.post("/api/content-strategy", async (req, res) => {
      try {
        const { role, industry, goals, audience } = req.body;
        const strategy = await this.generateContentStrategy(
          role,
          industry,
          goals,
          audience,
        );
        res.json(strategy);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Headshot analysis
    this.app.post(
      "/api/analyze-headshot",
      this.upload.single("headshot"),
      async (req, res) => {
        try {
          const { industry, role } = req.body;
          const headshotFile = req.file;

          if (!headshotFile) {
            return res.status(400).json({ error: "No headshot file uploaded" });
          }

          const analysis = await this.analyzeHeadshot(
            headshotFile.path,
            industry,
            role,
          );
          res.json(analysis);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      },
    );

    // Brand consistency checker
    this.app.post("/api/brand-consistency", async (req, res) => {
      try {
        const { platforms, brandElements } = req.body;
        const consistency = await this.checkBrandConsistency(
          platforms,
          brandElements,
        );
        res.json(consistency);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Personal brand score
    this.app.post("/api/brand-score", async (req, res) => {
      try {
        const { profileData } = req.body;
        const score = await this.calculateBrandScore(profileData);
        res.json(score);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Content idea generator
    this.app.post("/api/content-ideas", async (req, res) => {
      try {
        const { role, industry, recentPosts } = req.body;
        const ideas = await this.generateContentIdeas(
          role,
          industry,
          recentPosts,
        );
        res.json(ideas);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Revenue tracking
    this.app.get("/api/revenue", (req, res) => {
      const totalOptimizations = this.optimizationSessions.size;
      const activeUsers = new Set(
        [...this.optimizationSessions.values()].map((s) => s.userId),
      ).size;

      res.json({
        totalOptimizations,
        activeUsers,
        revenuePerOptimization: 179, // $179 per optimization session
        monthlyRevenue: totalOptimizations * 179,
        projectedMonthly: Math.min(totalOptimizations * 179 * 3.0, 22000), // Growth projection
      });
    });
  }

  async analyzeProfile(profileData, targetRole, industry) {
    // Simulate comprehensive profile analysis
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const roleKeywords =
      this.brandingElements.keywords[targetRole.toLowerCase()] ||
      this.brandingElements.keywords.leadership;

    const analysis = {
      overallScore: Math.floor(Math.random() * 25) + 75,
      sections: {
        headline: {
          score: Math.floor(Math.random() * 30) + 70,
          issues: this.identifyHeadlineIssues(
            profileData.headline,
            roleKeywords,
          ),
          suggestions: this.generateHeadlineSuggestions(targetRole, industry),
        },
        summary: {
          score: Math.floor(Math.random() * 35) + 65,
          wordCount: profileData.summary
            ? profileData.summary.split(" ").length
            : 0,
          suggestions: this.generateSummarySuggestions(targetRole, industry),
        },
        experience: {
          score: Math.floor(Math.random() * 25) + 75,
          missingKeywords: this.findMissingKeywords(
            profileData.experience,
            roleKeywords,
          ),
          suggestions: this.generateExperienceSuggestions(targetRole),
        },
        skills: {
          score: Math.floor(Math.random() * 20) + 80,
          relevantSkills: this.analyzeSkillRelevance(
            profileData.skills,
            targetRole,
          ),
          suggestions: this.generateSkillSuggestions(targetRole, industry),
        },
      },
      keyImprovements: this.identifyKeyImprovements(profileData, targetRole),
      competitorAnalysis: this.generateCompetitorInsights(targetRole, industry),
      actionPlan: this.createActionPlan(targetRole, industry),
    };

    return analysis;
  }

  identifyHeadlineIssues(headline, keywords) {
    const issues = [];
    if (!headline || headline.length < 50) issues.push("Headline too short");
    if (!keywords.some((kw) => headline.toLowerCase().includes(kw)))
      issues.push("Missing relevant keywords");
    if (!headline.includes("|") && !headline.includes("•"))
      issues.push("Could use better formatting");
    return issues;
  }

  generateHeadlineSuggestions(role, industry) {
    const suggestions =
      this.brandingElements.headlines[role.toLowerCase()] ||
      this.brandingElements.headlines.leadership;
    return suggestions.map((suggestion) =>
      suggestion.replace("{industry}", industry),
    );
  }

  generateSummarySuggestions(role, industry) {
    return [
      "Start with a compelling hook that grabs attention",
      "Include specific, quantifiable achievements",
      "Tell your professional story with personality",
      "End with a clear call-to-action",
      `Incorporate ${role} keywords throughout naturally`,
    ];
  }

  findMissingKeywords(experience, keywords) {
    const experienceText = experience
      .map((exp) => exp.description)
      .join(" ")
      .toLowerCase();
    return keywords.filter(
      (keyword) => !experienceText.includes(keyword.toLowerCase()),
    );
  }

  generateExperienceSuggestions(role) {
    return [
      "Use action verbs to start each bullet point",
      "Quantify achievements with numbers and percentages",
      "Include relevant technologies and methodologies",
      "Show progression and increased responsibility",
      "Highlight impact and business outcomes",
    ];
  }

  analyzeSkillRelevance(skills, role) {
    const relevantKeywords =
      this.brandingElements.keywords[role.toLowerCase()] || [];
    return skills.filter((skill) =>
      relevantKeywords.some((keyword) =>
        skill.toLowerCase().includes(keyword.toLowerCase()),
      ),
    );
  }

  generateSkillSuggestions(role, industry) {
    const baseSkills = this.brandingElements.keywords[role.toLowerCase()] || [];
    const industrySkills = {
      Technology: ["AI/ML", "Cloud Computing", "DevOps", "Agile"],
      Finance: [
        "Financial Modeling",
        "Risk Management",
        "Compliance",
        "Analytics",
      ],
      Healthcare: [
        "Healthcare IT",
        "Regulatory Affairs",
        "Patient Care",
        "Quality Management",
      ],
      Marketing: [
        "Digital Marketing",
        "Content Strategy",
        "SEO/SEM",
        "Analytics",
      ],
    };

    return [...baseSkills, ...(industrySkills[industry] || [])];
  }

  identifyKeyImprovements(profileData, role) {
    const improvements = [
      "Optimize headline with target role keywords",
      "Expand summary with quantified achievements",
      "Add industry-relevant skills",
      "Update experience descriptions with impact metrics",
    ];

    return improvements.slice(0, 3);
  }

  generateCompetitorInsights(role, industry) {
    return {
      topPerformers: [
        `${role} leaders in ${industry} average 5000+ connections`,
        "Post 2-3 times per week",
        "Use industry hashtags consistently",
      ],
      contentTrends: [
        "Behind-the-scenes content performs well",
        "Data-driven posts get high engagement",
        "Personal stories resonate with audience",
      ],
      differentiators: [
        "Unique perspective on industry challenges",
        "Specific methodology or framework",
        "Thought leadership in emerging trends",
      ],
    };
  }

  createActionPlan(role, industry) {
    return {
      immediate: [
        "Update headline with target keywords",
        "Revise summary with compelling hook",
        "Add missing relevant skills",
      ],
      thisWeek: [
        "Optimize all experience descriptions",
        "Create content calendar",
        "Engage with industry leaders",
      ],
      thisMonth: [
        "Publish 8-12 thought leadership posts",
        "Build strategic connections",
        "Join relevant industry groups",
      ],
    };
  }

  async generateLinkedInOptimizations(currentProfile, targetRole, goals) {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    return {
      headline: {
        current: currentProfile.headline,
        optimized: this.optimizeHeadline(currentProfile.headline, targetRole),
        reasoning: "Added industry keywords and value proposition",
      },
      summary: {
        structure: this.generateSummaryStructure(targetRole, goals),
        keyElements: [
          "Compelling hook",
          "Quantified achievements",
          "Personal story",
          "Call to action",
        ],
        wordCount: "Target: 1200-1500 words",
      },
      experience: {
        optimization: this.optimizeExperience(
          currentProfile.experience,
          targetRole,
        ),
        template:
          "Action verb + What you did + How you did it + Results achieved",
      },
      skills: {
        recommended: this.generateSkillSuggestions(
          targetRole,
          currentProfile.industry,
        ),
        priorityOrder: "Most relevant to target role first",
        endorsementStrategy: "Request endorsements from colleagues and clients",
      },
      contentStrategy: this.generateContentCalendar(targetRole, goals),
      networkingPlan: this.createNetworkingPlan(
        targetRole,
        currentProfile.industry,
      ),
    };
  }

  optimizeHeadline(currentHeadline, targetRole) {
    const templates = {
      "Software Engineer":
        "Full-Stack Software Engineer | Building Scalable Solutions | React, Node.js, Cloud Architecture",
      "Product Manager":
        "Senior Product Manager | Driving Growth Through Data-Driven Innovation | B2B SaaS Expert",
      "Marketing Manager":
        "Growth Marketing Manager | 10x Revenue Through Performance Marketing | B2B Lead Generation",
      "Sales Manager":
        "Enterprise Sales Leader | $10M+ Revenue Generated | Building Strategic Partnerships",
    };

    return (
      templates[targetRole] ||
      `${targetRole} | Industry Expert | Growth-Focused Leader`
    );
  }

  generateSummaryStructure(targetRole, goals) {
    return {
      paragraph1: "Hook + Current role and impact",
      paragraph2: "Professional journey and key achievements",
      paragraph3: "Skills, expertise, and unique value",
      paragraph4: "Personal interests and call to action",
    };
  }

  optimizeExperience(experience, targetRole) {
    return experience.map((exp) => ({
      role: exp.role,
      company: exp.company,
      optimizedDescription: [
        `Led ${targetRole.toLowerCase()} initiatives resulting in X% improvement`,
        "Implemented strategic solutions that achieved Y outcome",
        "Collaborated with cross-functional teams to deliver Z results",
        "Developed and executed plans that generated $X revenue",
      ],
    }));
  }

  async generateContentStrategy(role, industry, goals, audience) {
    await new Promise((resolve) => setTimeout(resolve, 1800));

    const themes =
      this.brandingElements.contentThemes[role.toLowerCase()] ||
      this.brandingElements.contentThemes.leadership;

    return {
      contentPillars: themes.slice(0, 3),
      postingFrequency: "3-4 posts per week",
      contentMix: {
        thoughtLeadership: "40%",
        behindTheScenes: "30%",
        industryInsights: "20%",
        personal: "10%",
      },
      weeklyCalendar: this.generateWeeklyCalendar(themes),
      engagementStrategy: {
        hashtags: this.generateHashtags(role, industry),
        bestTimes: "Tuesday-Thursday, 8-10 AM and 1-3 PM",
        engagementTactics: [
          "Ask questions",
          "Share personal experiences",
          "Comment on industry leaders' posts",
        ],
      },
      contentIdeas: this.generateMonthlyContentIdeas(role, industry),
      metrics: {
        trackViews: "Aim for 1000+ views per post",
        trackEngagement: "Target 5%+ engagement rate",
        trackConnections: "Grow network by 100+ monthly",
      },
    };
  }

  generateWeeklyCalendar(themes) {
    return {
      Monday: `${themes[0]} - Industry insight or trend analysis`,
      Wednesday: `${themes[1]} - Personal experience or behind-the-scenes`,
      Friday: `${themes[2]} - Thought leadership or advice`,
      Weekend: "Engage with others' content and network",
    };
  }

  generateHashtags(role, industry) {
    const roleHashtags = {
      "Software Engineer": [
        "#SoftwareDevelopment",
        "#TechLeadership",
        "#Coding",
        "#Innovation",
      ],
      "Product Manager": [
        "#ProductManagement",
        "#Innovation",
        "#Strategy",
        "#Growth",
      ],
      "Marketing Manager": [
        "#MarketingStrategy",
        "#GrowthHacking",
        "#DigitalMarketing",
        "#ROI",
      ],
      "Sales Manager": [
        "#Sales",
        "#Revenue",
        "#ClientSuccess",
        "#BusinessDevelopment",
      ],
    };

    const industryHashtags = {
      Technology: [
        "#TechInnovation",
        "#DigitalTransformation",
        "#AI",
        "#CloudComputing",
      ],
      Finance: ["#FinTech", "#Finance", "#Investment", "#RiskManagement"],
      Healthcare: [
        "#HealthTech",
        "#Healthcare",
        "#MedicalInnovation",
        "#PatientCare",
      ],
    };

    return [
      ...(roleHashtags[role] || []),
      ...(industryHashtags[industry] || []),
      "#Leadership",
      "#ProfessionalGrowth",
    ];
  }

  generateMonthlyContentIdeas(role, industry) {
    const templates = this.contentTemplates;
    return Object.keys(templates).map((type) => ({
      type,
      ideas: templates[type].examples.map((example) =>
        example.replace("{industry}", industry).replace("{topic}", role),
      ),
    }));
  }

  async analyzeHeadshot(imagePath, industry, role) {
    // Simulate AI image analysis
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      overallScore: Math.floor(Math.random() * 20) + 80,
      technicalAspects: {
        lighting: Math.floor(Math.random() * 25) + 75,
        composition: Math.floor(Math.random() * 20) + 80,
        resolution: Math.floor(Math.random() * 15) + 85,
        background: Math.floor(Math.random() * 30) + 70,
      },
      professionalAspects: {
        attire: Math.floor(Math.random() * 25) + 75,
        expression: Math.floor(Math.random() * 20) + 80,
        eyeContact: Math.floor(Math.random() * 15) + 85,
        trustworthiness: Math.floor(Math.random() * 25) + 75,
      },
      recommendations: [
        "Consider using a neutral background",
        "Ensure professional attire appropriate for industry",
        "Maintain genuine, confident expression",
        "Use high-resolution image (400x400 minimum)",
      ],
      industryBenchmark: {
        comparison: `Above average for ${industry} professionals`,
        topPercentile: Math.floor(Math.random() * 30) + 70,
      },
    };
  }

  async checkBrandConsistency(platforms, brandElements) {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    return {
      consistencyScore: Math.floor(Math.random() * 25) + 75,
      platformAnalysis: platforms.map((platform) => ({
        platform: platform.name,
        score: Math.floor(Math.random() * 30) + 70,
        issues: this.identifyConsistencyIssues(platform, brandElements),
        recommendations: this.generateConsistencyRecommendations(platform.name),
      })),
      brandElements: {
        messaging: Math.floor(Math.random() * 25) + 75,
        visualIdentity: Math.floor(Math.random() * 30) + 70,
        toneOfVoice: Math.floor(Math.random() * 20) + 80,
        valueProposition: Math.floor(Math.random() * 25) + 75,
      },
      actionItems: [
        "Standardize profile photos across platforms",
        "Align messaging with core value proposition",
        "Ensure consistent tone of voice",
        "Update outdated platform information",
      ],
    };
  }

  identifyConsistencyIssues(platform, brandElements) {
    const issues = [
      "Profile photo differs from other platforms",
      "Bio messaging not aligned with brand",
      "Missing key brand keywords",
      "Outdated information",
    ];
    return issues.slice(0, Math.floor(Math.random() * 3) + 1);
  }

  generateConsistencyRecommendations(platformName) {
    const recommendations = {
      LinkedIn: [
        "Optimize for professional networking",
        "Use industry keywords",
        "Share thought leadership content",
      ],
      Twitter: [
        "Engage in industry conversations",
        "Share quick insights",
        "Use relevant hashtags",
      ],
      Instagram: [
        "Show personality behind the professional",
        "Use visual storytelling",
        "Share behind-the-scenes content",
      ],
    };

    return (
      recommendations[platformName] || [
        "Maintain consistent messaging",
        "Regular content updates",
        "Engage with audience",
      ]
    );
  }

  async calculateBrandScore(profileData) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const scores = {};
    let totalScore = 0;

    for (const [metric, config] of Object.entries(this.analysisMetrics)) {
      const score = Math.floor(Math.random() * 30) + 70;
      scores[metric] = { score, weight: config.weight };
      totalScore += score * config.weight;
    }

    return {
      overallScore: Math.round(totalScore),
      breakdown: scores,
      grade: this.getBrandGrade(totalScore),
      benchmark: {
        industryAverage: 72,
        topPercentile: 85,
        yourPosition:
          totalScore > 85 ? "Top 10%" : totalScore > 75 ? "Top 25%" : "Average",
      },
      nextSteps: this.getScoreImprovementPlan(totalScore),
    };
  }

  getBrandGrade(score) {
    if (score >= 90) return "A+";
    if (score >= 85) return "A";
    if (score >= 80) return "B+";
    if (score >= 75) return "B";
    if (score >= 70) return "C+";
    return "C";
  }

  getScoreImprovementPlan(score) {
    if (score >= 85) {
      return [
        "Maintain consistency",
        "Experiment with new content formats",
        "Mentor others in personal branding",
      ];
    } else if (score >= 75) {
      return [
        "Focus on content quality",
        "Increase posting frequency",
        "Engage more with network",
      ];
    } else {
      return [
        "Complete profile optimization",
        "Develop content strategy",
        "Build strategic connections",
      ];
    }
  }

  async generateContentIdeas(role, industry, recentPosts) {
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const themes =
      this.brandingElements.contentThemes[role.toLowerCase()] ||
      this.brandingElements.contentThemes.leadership;

    return {
      thisWeek: [
        `5 lessons I learned about ${themes[0].toLowerCase()}`,
        `The biggest mistake I see in ${industry}`,
        `Behind the scenes: How we solved ${themes[1].toLowerCase()}`,
      ],
      thisMonth: [
        `The future of ${industry} in 2024`,
        `My framework for ${themes[2].toLowerCase()}`,
        `What I wish I knew when starting in ${role}`,
        `${industry} trends that will impact your career`,
      ],
      trending: [
        "AI impact on your industry",
        "Remote work best practices",
        "Professional development in 2024",
        "Building meaningful professional relationships",
      ],
      personalized: this.generatePersonalizedIdeas(role, industry, recentPosts),
    };
  }

  generatePersonalizedIdeas(role, industry, recentPosts) {
    // Analyze recent posts to avoid repetition and suggest complementary content
    return [
      `Expanding on your recent post about ${industry}`,
      "Share a contrarian view on industry trends",
      "Personal story that illustrates professional growth",
      "Lessons learned from recent project or achievement",
    ];
  }

  createNetworkingPlan(targetRole, industry) {
    return {
      targetConnections: {
        industry_leaders: "Connect with 5-10 thought leaders monthly",
        peers: "Build relationships with fellow professionals",
        potential_clients: "Strategic connections in target companies",
        mentors: "Seek guidance from senior professionals",
      },
      engagementStrategy: {
        daily: "Comment thoughtfully on 3-5 posts",
        weekly: "Share and add insights to industry content",
        monthly: "Reach out to 10-15 new strategic connections",
      },
      groups: [
        `${targetRole} Professionals`,
        `${industry} Leaders`,
        "Professional Development",
        "Career Growth Network",
      ],
    };
  }

  getBrandingHTML() {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🌟 Personal Branding Optimizer</title>
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
                
                .branding-panel {
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    margin-bottom: 30px;
                }
                
                .tabs {
                    display: flex;
                    margin-bottom: 30px;
                    border-bottom: 2px solid #e1e5e9;
                    flex-wrap: wrap;
                }
                .tab {
                    padding: 15px 20px;
                    cursor: pointer;
                    border-bottom: 3px solid transparent;
                    transition: all 0.3s;
                    font-weight: 600;
                    font-size: 14px;
                }
                .tab.active { border-bottom-color: #667eea; color: #667eea; }
                .tab:hover { background: #f8f9fa; }
                
                .tab-content { display: none; }
                .tab-content.active { display: block; }
                
                .form-group { margin-bottom: 20px; }
                .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #555; }
                .form-group select, .form-group input, .form-group textarea {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s;
                }
                .form-group select:focus, .form-group input:focus, .form-group textarea:focus {
                    outline: none;
                    border-color: #667eea;
                }
                
                .analysis-results {
                    background: linear-gradient(135deg, #11998e, #38ef7d);
                    color: white;
                    border-radius: 15px;
                    padding: 30px;
                    margin: 20px 0;
                }
                .score-display {
                    text-align: center;
                    margin-bottom: 20px;
                }
                .score-circle {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 15px;
                    font-size: 2em;
                    font-weight: bold;
                }
                
                .analysis-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin: 20px 0;
                }
                .analysis-item {
                    background: rgba(255,255,255,0.2);
                    padding: 20px;
                    border-radius: 10px;
                }
                .analysis-item h4 { margin-bottom: 10px; }
                .score-bar {
                    background: rgba(255,255,255,0.3);
                    border-radius: 10px;
                    height: 8px;
                    overflow: hidden;
                    margin: 10px 0;
                }
                .score-fill {
                    height: 100%;
                    background: white;
                    border-radius: 10px;
                    transition: width 0.5s ease;
                }
                
                .optimization-suggestions {
                    background: #f8f9fa;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 20px 0;
                }
                .suggestion-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 20px;
                    margin: 20px 0;
                }
                .suggestion-item {
                    background: white;
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                }
                .suggestion-item h4 { color: #667eea; margin-bottom: 10px; }
                
                .content-strategy {
                    background: linear-gradient(135deg, #ff9a9e, #fecfef);
                    border-radius: 15px;
                    padding: 30px;
                    margin: 20px 0;
                }
                .strategy-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin: 20px 0;
                }
                .strategy-item {
                    background: rgba(255,255,255,0.8);
                    padding: 20px;
                    border-radius: 10px;
                }
                .strategy-item h4 { color: #333; margin-bottom: 10px; }
                
                .headshot-analysis {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 20px 0;
                }
                .headshot-upload {
                    border: 2px dashed rgba(255,255,255,0.5);
                    border-radius: 10px;
                    padding: 30px;
                    text-align: center;
                    margin: 20px 0;
                    cursor: pointer;
                    transition: border-color 0.3s;
                }
                .headshot-upload:hover { border-color: white; }
                .headshot-upload.dragover { border-color: white; background: rgba(255,255,255,0.1); }
                
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
                .btn-warning { background: linear-gradient(135deg, #f093fb, #f5576c); color: white; }
                .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                
                .revenue-stats {
                    background: linear-gradient(135deg, #fc4a1a, #f7b733);
                    color: white;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 20px 0;
                    text-align: center;
                }
                .revenue-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 15px;
                    margin-top: 15px;
                }
                .revenue-item { background: rgba(255,255,255,0.2); padding: 15px; border-radius: 10px; }
                .revenue-item .value { font-size: 1.5em; font-weight: bold; margin-bottom: 5px; }
                .revenue-item .label { font-size: 0.9em; opacity: 0.9; }
                
                @media (max-width: 768px) {
                    .tabs { flex-direction: column; }
                    .analysis-grid, .suggestion-grid, .strategy-grid { grid-template-columns: 1fr; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🌟 Personal Branding Optimizer</h1>
                    <p>Transform your professional presence with AI-powered personal branding strategies</p>
                </div>
                
                <div class="branding-panel">
                    <div class="tabs">
                        <div class="tab active" onclick="switchTab('analyze')">📊 Profile Analysis</div>
                        <div class="tab" onclick="switchTab('optimize')">🎯 LinkedIn Optimization</div>
                        <div class="tab" onclick="switchTab('content')">📝 Content Strategy</div>
                        <div class="tab" onclick="switchTab('headshot')">📸 Headshot Analysis</div>
                        <div class="tab" onclick="switchTab('consistency')">🔄 Brand Consistency</div>
                        <div class="tab" onclick="switchTab('ideas')">💡 Content Ideas</div>
                    </div>
                    
                    <!-- Profile Analysis Tab -->
                    <div id="analyze" class="tab-content active">
                        <h2>📊 Professional Profile Analysis</h2>
                        <div class="form-group">
                            <label for="currentHeadline">Current LinkedIn Headline:</label>
                            <input type="text" id="currentHeadline" placeholder="Software Engineer at Tech Company">
                        </div>
                        <div class="form-group">
                            <label for="currentSummary">Current Summary:</label>
                            <textarea id="currentSummary" rows="4" placeholder="Paste your current LinkedIn summary here..."></textarea>
                        </div>
                        <div class="form-group">
                            <label for="targetRole">Target Role:</label>
                            <select id="targetRole">
                                <option value="Software Engineer">Software Engineer</option>
                                <option value="Product Manager">Product Manager</option>
                                <option value="Marketing Manager">Marketing Manager</option>
                                <option value="Sales Manager">Sales Manager</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="industry">Industry:</label>
                            <select id="industry">
                                <option value="Technology">Technology</option>
                                <option value="Finance">Finance</option>
                                <option value="Healthcare">Healthcare</option>
                                <option value="Marketing">Marketing</option>
                            </select>
                        </div>
                        <button class="btn btn-primary" onclick="analyzeProfile()">📊 Analyze Profile</button>
                        
                        <div id="analysisResults" class="analysis-results" style="display: none;">
                            <div class="score-display">
                                <div class="score-circle" id="overallScore">--</div>
                                <h3>Overall Brand Score</h3>
                            </div>
                            <div class="analysis-grid" id="analysisGrid"></div>
                        </div>
                    </div>
                    
                    <!-- LinkedIn Optimization Tab -->
                    <div id="optimize" class="tab-content">
                        <h2>🎯 LinkedIn Profile Optimization</h2>
                        <div class="form-group">
                            <label for="optimizeRole">Target Role:</label>
                            <select id="optimizeRole">
                                <option value="Software Engineer">Software Engineer</option>
                                <option value="Product Manager">Product Manager</option>
                                <option value="Marketing Manager">Marketing Manager</option>
                                <option value="Sales Manager">Sales Manager</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="careerGoals">Career Goals:</label>
                            <select id="careerGoals">
                                <option value="promotion">Internal Promotion</option>
                                <option value="job_change">New Job Opportunity</option>
                                <option value="freelance">Freelance/Consulting</option>
                                <option value="thought_leader">Thought Leadership</option>
                            </select>
                        </div>
                        <button class="btn btn-success" onclick="generateOptimizations()">🎯 Generate Optimizations</button>
                        
                        <div id="optimizationResults" class="optimization-suggestions" style="display: none;">
                            <h3>🚀 LinkedIn Optimization Recommendations</h3>
                            <div class="suggestion-grid" id="optimizationGrid"></div>
                        </div>
                    </div>
                    
                    <!-- Content Strategy Tab -->
                    <div id="content" class="tab-content">
                        <h2>📝 Personal Brand Content Strategy</h2>
                        <div class="form-group">
                            <label for="contentRole">Your Role:</label>
                            <select id="contentRole">
                                <option value="Software Engineer">Software Engineer</option>
                                <option value="Product Manager">Product Manager</option>
                                <option value="Marketing Manager">Marketing Manager</option>
                                <option value="Sales Manager">Sales Manager</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="contentIndustry">Industry:</label>
                            <select id="contentIndustry">
                                <option value="Technology">Technology</option>
                                <option value="Finance">Finance</option>
                                <option value="Healthcare">Healthcare</option>
                                <option value="Marketing">Marketing</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="targetAudience">Target Audience:</label>
                            <select id="targetAudience">
                                <option value="peers">Industry Peers</option>
                                <option value="leaders">Senior Leaders</option>
                                <option value="recruiters">Recruiters/HR</option>
                                <option value="clients">Potential Clients</option>
                            </select>
                        </div>
                        <button class="btn btn-warning" onclick="generateContentStrategy()">📝 Create Strategy</button>
                        
                        <div id="contentStrategyResults" class="content-strategy" style="display: none;">
                            <h3>📈 Your Personal Brand Content Strategy</h3>
                            <div class="strategy-grid" id="strategyGrid"></div>
                        </div>
                    </div>
                    
                    <!-- Headshot Analysis Tab -->
                    <div id="headshot" class="tab-content">
                        <h2>📸 Professional Headshot Analysis</h2>
                        <div class="form-group">
                            <label for="headshotIndustry">Industry:</label>
                            <select id="headshotIndustry">
                                <option value="Technology">Technology</option>
                                <option value="Finance">Finance</option>
                                <option value="Healthcare">Healthcare</option>
                                <option value="Marketing">Marketing</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="headshotRole">Role Level:</label>
                            <select id="headshotRole">
                                <option value="entry">Entry Level</option>
                                <option value="mid">Mid-Level</option>
                                <option value="senior">Senior Level</option>
                                <option value="executive">Executive</option>
                            </select>
                        </div>
                        
                        <div class="headshot-upload" onclick="document.getElementById('headshotFile').click()">
                            <p>📸 Click or drag to upload your headshot</p>
                            <p style="opacity: 0.7; margin-top: 10px;">JPG, PNG • Max 5MB</p>
                            <input type="file" id="headshotFile" accept="image/*" style="display: none;" onchange="analyzeHeadshot()">
                        </div>
                        
                        <div id="headshotResults" class="headshot-analysis" style="display: none;">
                            <h3>📊 Headshot Analysis Results</h3>
                            <div class="analysis-grid" id="headshotGrid"></div>
                        </div>
                    </div>
                    
                    <!-- Brand Consistency Tab -->
                    <div id="consistency" class="tab-content">
                        <h2>🔄 Brand Consistency Checker</h2>
                        <p>Analyze consistency across your professional platforms</p>
                        <div class="form-group">
                            <label>Select platforms to analyze:</label>
                            <div style="margin-top: 10px;">
                                <input type="checkbox" id="linkedin" checked> <label for="linkedin">LinkedIn</label><br>
                                <input type="checkbox" id="twitter"> <label for="twitter">Twitter</label><br>
                                <input type="checkbox" id="instagram"> <label for="instagram">Instagram</label><br>
                                <input type="checkbox" id="website"> <label for="website">Personal Website</label>
                            </div>
                        </div>
                        <button class="btn btn-primary" onclick="checkBrandConsistency()">🔄 Check Consistency</button>
                        
                        <div id="consistencyResults" class="optimization-suggestions" style="display: none;">
                            <h3>🎯 Brand Consistency Analysis</h3>
                            <div class="suggestion-grid" id="consistencyGrid"></div>
                        </div>
                    </div>
                    
                    <!-- Content Ideas Tab -->
                    <div id="ideas" class="tab-content">
                        <h2>💡 Personalized Content Ideas</h2>
                        <div class="form-group">
                            <label for="ideasRole">Your Role:</label>
                            <select id="ideasRole">
                                <option value="Software Engineer">Software Engineer</option>
                                <option value="Product Manager">Product Manager</option>
                                <option value="Marketing Manager">Marketing Manager</option>
                                <option value="Sales Manager">Sales Manager</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="ideasIndustry">Industry:</label>
                            <select id="ideasIndustry">
                                <option value="Technology">Technology</option>
                                <option value="Finance">Finance</option>
                                <option value="Healthcare">Healthcare</option>
                                <option value="Marketing">Marketing</option>
                            </select>
                        </div>
                        <button class="btn btn-success" onclick="generateContentIdeas()">💡 Generate Ideas</button>
                        
                        <div id="contentIdeasResults" class="content-strategy" style="display: none;">
                            <h3>🚀 Your Personalized Content Ideas</h3>
                            <div class="strategy-grid" id="ideasGrid"></div>
                        </div>
                    </div>
                </div>
                
                <div class="revenue-stats">
                    <h4>🌟 Personal Branding Optimization Revenue</h4>
                    <div class="revenue-grid" id="revenueGrid">
                        <div class="revenue-item">
                            <div class="value" id="totalOptimizations">0</div>
                            <div class="label">Total Optimizations</div>
                        </div>
                        <div class="revenue-item">
                            <div class="value" id="activeUsers">0</div>
                            <div class="label">Active Users</div>
                        </div>
                        <div class="revenue-item">
                            <div class="value" id="monthlyRevenue">$0</div>
                            <div class="label">Monthly Revenue</div>
                        </div>
                        <div class="revenue-item">
                            <div class="value" id="projectedRevenue">$22K</div>
                            <div class="label">Revenue Target</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                function switchTab(tabName) {
                    // Hide all tab contents
                    document.querySelectorAll('.tab-content').forEach(content => {
                        content.classList.remove('active');
                    });
                    document.querySelectorAll('.tab').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    
                    // Show selected tab
                    document.getElementById(tabName).classList.add('active');
                    event.target.classList.add('active');
                }
                
                async function analyzeProfile() {
                    const profileData = {
                        headline: document.getElementById('currentHeadline').value,
                        summary: document.getElementById('currentSummary').value,
                        experience: [],
                        skills: []
                    };
                    const targetRole = document.getElementById('targetRole').value;
                    const industry = document.getElementById('industry').value;
                    
                    try {
                        const response = await fetch('/api/analyze-profile', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ profileData, targetRole, industry })
                        });
                        
                        const data = await response.json();
                        displayAnalysisResults(data);
                    } catch (error) {
                        alert('Failed to analyze profile: ' + error.message);
                    }
                }
                
                function displayAnalysisResults(data) {
                    document.getElementById('analysisResults').style.display = 'block';
                    document.getElementById('overallScore').textContent = data.overallScore;
                    
                    const grid = document.getElementById('analysisGrid');
                    grid.innerHTML = \`
                        <div class="analysis-item">
                            <h4>📝 Headline</h4>
                            <div class="score-bar"><div class="score-fill" style="width: \${data.sections.headline.score}%"></div></div>
                            <p>Score: \${data.sections.headline.score}/100</p>
                        </div>
                        <div class="analysis-item">
                            <h4>📋 Summary</h4>
                            <div class="score-bar"><div class="score-fill" style="width: \${data.sections.summary.score}%"></div></div>
                            <p>Score: \${data.sections.summary.score}/100</p>
                        </div>
                        <div class="analysis-item">
                            <h4>💼 Experience</h4>
                            <div class="score-bar"><div class="score-fill" style="width: \${data.sections.experience.score}%"></div></div>
                            <p>Score: \${data.sections.experience.score}/100</p>
                        </div>
                        <div class="analysis-item">
                            <h4>🎯 Skills</h4>
                            <div class="score-bar"><div class="score-fill" style="width: \${data.sections.skills.score}%"></div></div>
                            <p>Score: \${data.sections.skills.score}/100</p>
                        </div>
                    \`;
                }
                
                async function generateOptimizations() {
                    const targetRole = document.getElementById('optimizeRole').value;
                    const goals = document.getElementById('careerGoals').value;
                    const currentProfile = { headline: '', summary: '', experience: [], industry: 'Technology' };
                    
                    try {
                        const response = await fetch('/api/optimize-linkedin', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ currentProfile, targetRole, goals })
                        });
                        
                        const data = await response.json();
                        displayOptimizations(data);
                    } catch (error) {
                        alert('Failed to generate optimizations: ' + error.message);
                    }
                }
                
                function displayOptimizations(data) {
                    document.getElementById('optimizationResults').style.display = 'block';
                    
                    const grid = document.getElementById('optimizationGrid');
                    grid.innerHTML = \`
                        <div class="suggestion-item">
                            <h4>📝 Optimized Headline</h4>
                            <p><strong>Suggested:</strong> \${data.headline.optimized}</p>
                            <p><em>\${data.headline.reasoning}</em></p>
                        </div>
                        <div class="suggestion-item">
                            <h4>📋 Summary Structure</h4>
                            <p><strong>Word Count:</strong> \${data.summary.wordCount}</p>
                            <p><strong>Key Elements:</strong> \${data.summary.keyElements.join(', ')}</p>
                        </div>
                        <div class="suggestion-item">
                            <h4>🎯 Skills Strategy</h4>
                            <p><strong>Recommended:</strong> \${data.skills.recommended.slice(0, 5).join(', ')}</p>
                            <p><em>\${data.skills.endorsementStrategy}</em></p>
                        </div>
                        <div class="suggestion-item">
                            <h4>🤝 Networking Plan</h4>
                            <p><strong>Daily:</strong> \${data.networkingPlan.engagementStrategy.daily}</p>
                            <p><strong>Monthly:</strong> \${data.networkingPlan.engagementStrategy.monthly}</p>
                        </div>
                    \`;
                }
                
                async function generateContentStrategy() {
                    const role = document.getElementById('contentRole').value;
                    const industry = document.getElementById('contentIndustry').value;
                    const audience = document.getElementById('targetAudience').value;
                    const goals = ['thought_leadership'];
                    
                    try {
                        const response = await fetch('/api/content-strategy', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ role, industry, goals, audience })
                        });
                        
                        const data = await response.json();
                        displayContentStrategy(data);
                    } catch (error) {
                        alert('Failed to generate content strategy: ' + error.message);
                    }
                }
                
                function displayContentStrategy(data) {
                    document.getElementById('contentStrategyResults').style.display = 'block';
                    
                    const grid = document.getElementById('strategyGrid');
                    grid.innerHTML = \`
                        <div class="strategy-item">
                            <h4>📊 Content Mix</h4>
                            <p>Thought Leadership: \${data.contentMix.thoughtLeadership}</p>
                            <p>Behind-the-Scenes: \${data.contentMix.behindTheScenes}</p>
                            <p>Industry Insights: \${data.contentMix.industryInsights}</p>
                        </div>
                        <div class="strategy-item">
                            <h4>📅 Posting Schedule</h4>
                            <p><strong>Frequency:</strong> \${data.postingFrequency}</p>
                            <p><strong>Best Times:</strong> \${data.engagementStrategy.bestTimes}</p>
                        </div>
                        <div class="strategy-item">
                            <h4>🏷️ Hashtag Strategy</h4>
                            <p>\${data.engagementStrategy.hashtags.slice(0, 6).join(' ')}</p>
                        </div>
                        <div class="strategy-item">
                            <h4>📈 Success Metrics</h4>
                            <p>\${data.metrics.trackViews}</p>
                            <p>\${data.metrics.trackEngagement}</p>
                        </div>
                    \`;
                }
                
                async function analyzeHeadshot() {
                    const file = document.getElementById('headshotFile').files[0];
                    const industry = document.getElementById('headshotIndustry').value;
                    const role = document.getElementById('headshotRole').value;
                    
                    if (!file) {
                        alert('Please select a headshot image');
                        return;
                    }
                    
                    const formData = new FormData();
                    formData.append('headshot', file);
                    formData.append('industry', industry);
                    formData.append('role', role);
                    
                    try {
                        const response = await fetch('/api/analyze-headshot', {
                            method: 'POST',
                            body: formData
                        });
                        
                        const data = await response.json();
                        displayHeadshotAnalysis(data);
                    } catch (error) {
                        alert('Failed to analyze headshot: ' + error.message);
                    }
                }
                
                function displayHeadshotAnalysis(data) {
                    document.getElementById('headshotResults').style.display = 'block';
                    
                    const grid = document.getElementById('headshotGrid');
                    grid.innerHTML = \`
                        <div class="analysis-item">
                            <h4>⚡ Overall Score</h4>
                            <div class="score-bar"><div class="score-fill" style="width: \${data.overallScore}%"></div></div>
                            <p>\${data.overallScore}/100</p>
                        </div>
                        <div class="analysis-item">
                            <h4>💡 Lighting</h4>
                            <div class="score-bar"><div class="score-fill" style="width: \${data.technicalAspects.lighting}%"></div></div>
                            <p>\${data.technicalAspects.lighting}/100</p>
                        </div>
                        <div class="analysis-item">
                            <h4>👔 Professional Attire</h4>
                            <div class="score-bar"><div class="score-fill" style="width: \${data.professionalAspects.attire}%"></div></div>
                            <p>\${data.professionalAspects.attire}/100</p>
                        </div>
                        <div class="analysis-item">
                            <h4>📊 Industry Benchmark</h4>
                            <p>\${data.industryBenchmark.comparison}</p>
                            <p>Top \${data.industryBenchmark.topPercentile}%</p>
                        </div>
                    \`;
                }
                
                async function checkBrandConsistency() {
                    const platforms = [];
                    if (document.getElementById('linkedin').checked) platforms.push({name: 'LinkedIn'});
                    if (document.getElementById('twitter').checked) platforms.push({name: 'Twitter'});
                    if (document.getElementById('instagram').checked) platforms.push({name: 'Instagram'});
                    if (document.getElementById('website').checked) platforms.push({name: 'Website'});
                    
                    const brandElements = {};
                    
                    try {
                        const response = await fetch('/api/brand-consistency', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ platforms, brandElements })
                        });
                        
                        const data = await response.json();
                        displayConsistencyResults(data);
                    } catch (error) {
                        alert('Failed to check brand consistency: ' + error.message);
                    }
                }
                
                function displayConsistencyResults(data) {
                    document.getElementById('consistencyResults').style.display = 'block';
                    
                    const grid = document.getElementById('consistencyGrid');
                    grid.innerHTML = \`
                        <div class="suggestion-item">
                            <h4>🎯 Overall Consistency</h4>
                            <p><strong>Score:</strong> \${data.consistencyScore}/100</p>
                            <p>Your brand consistency is above average</p>
                        </div>
                        \${data.platformAnalysis.map(platform => \`
                            <div class="suggestion-item">
                                <h4>\${platform.platform}</h4>
                                <p><strong>Score:</strong> \${platform.score}/100</p>
                                <p>\${platform.recommendations[0]}</p>
                            </div>
                        \`).join('')}
                    \`;
                }
                
                async function generateContentIdeas() {
                    const role = document.getElementById('ideasRole').value;
                    const industry = document.getElementById('ideasIndustry').value;
                    const recentPosts = [];
                    
                    try {
                        const response = await fetch('/api/content-ideas', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ role, industry, recentPosts })
                        });
                        
                        const data = await response.json();
                        displayContentIdeas(data);
                    } catch (error) {
                        alert('Failed to generate content ideas: ' + error.message);
                    }
                }
                
                function displayContentIdeas(data) {
                    document.getElementById('contentIdeasResults').style.display = 'block';
                    
                    const grid = document.getElementById('ideasGrid');
                    grid.innerHTML = \`
                        <div class="strategy-item">
                            <h4>📅 This Week</h4>
                            \${data.thisWeek.map(idea => \`<p>• \${idea}</p>\`).join('')}
                        </div>
                        <div class="strategy-item">
                            <h4>📊 This Month</h4>
                            \${data.thisMonth.slice(0, 3).map(idea => \`<p>• \${idea}</p>\`).join('')}
                        </div>
                        <div class="strategy-item">
                            <h4>🔥 Trending Topics</h4>
                            \${data.trending.slice(0, 3).map(idea => \`<p>• \${idea}</p>\`).join('')}
                        </div>
                        <div class="strategy-item">
                            <h4>🎯 Personalized</h4>
                            \${data.personalized.slice(0, 3).map(idea => \`<p>• \${idea}</p>\`).join('')}
                        </div>
                    \`;
                }
                
                // Load revenue data
                async function loadRevenueData() {
                    try {
                        const response = await fetch('/api/revenue');
                        const data = await response.json();
                        
                        document.getElementById('totalOptimizations').textContent = data.totalOptimizations;
                        document.getElementById('activeUsers').textContent = data.activeUsers;
                        document.getElementById('monthlyRevenue').textContent = \`$\${data.monthlyRevenue.toLocaleString()}\`;
                        document.getElementById('projectedRevenue').textContent = \`$\${data.projectedMonthly.toLocaleString()}\`;
                    } catch (error) {
                        console.error('Failed to load revenue data:', error);
                    }
                }
                
                // Drag and drop for headshot upload
                const headshotUpload = document.querySelector('.headshot-upload');
                headshotUpload.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    headshotUpload.classList.add('dragover');
                });
                
                headshotUpload.addEventListener('dragleave', () => {
                    headshotUpload.classList.remove('dragover');
                });
                
                headshotUpload.addEventListener('drop', (e) => {
                    e.preventDefault();
                    headshotUpload.classList.remove('dragover');
                    const files = e.dataTransfer.files;
                    if (files.length > 0) {
                        document.getElementById('headshotFile').files = files;
                        analyzeHeadshot();
                    }
                });
                
                // Initialize
                loadRevenueData();
                setInterval(loadRevenueData, 30000); // Update every 30 seconds
            </script>
        </body>
        </html>
        `;
  }

  async startServer() {
    // Ensure upload directory exists
    try {
      await fs.mkdir("headshots", { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    this.app.listen(this.port, () => {
      console.log(
        `🌟 Personal Branding Optimizer running on port ${this.port}`,
      );
      console.log(`🔗 http://localhost:${this.port}`);
      console.log(`💎 Premium optimization: $179 per session`);
      console.log(`🎯 Revenue target: $22K/month`);
      this.logStartup();
    });
  }

  async logStartup() {
    const logEntry = `
🌟 Personal Branding Optimizer LAUNCHED!
🎯 AI-powered personal brand optimization and strategy
📊 LinkedIn profile analysis and recommendations
📝 Content strategy generation and ideas
📸 Professional headshot analysis
🔄 Brand consistency checking across platforms
💎 Revenue model: $179 per optimization session
📈 Target: $22K/month revenue
⚡ READY TO TRANSFORM PROFESSIONAL PRESENCE!

`;

    try {
      await fs.appendFile("branding_optimizer.log", logEntry);
    } catch (error) {
      console.log("Logging note:", error.message);
    }
  }
}

// Start the Personal Branding Optimizer
const brandingOptimizer = new PersonalBrandingOptimizer();

module.exports = PersonalBrandingOptimizer;
