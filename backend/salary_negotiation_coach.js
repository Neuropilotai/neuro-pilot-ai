require("dotenv").config();
const express = require("express");
const fs = require("fs").promises;
const path = require("path");

class SalaryNegotiationCoach {
  constructor() {
    this.app = express();
    this.port = 3018;
    this.setupMiddleware();
    this.setupRoutes();

    // Salary Benchmarking Database
    this.salaryData = {
      "Software Engineer": {
        junior: { min: 75000, max: 95000, median: 85000 },
        mid: { min: 95000, max: 130000, median: 115000 },
        senior: { min: 130000, max: 180000, median: 155000 },
        lead: { min: 180000, max: 250000, median: 215000 },
      },
      "Product Manager": {
        junior: { min: 85000, max: 110000, median: 98000 },
        mid: { min: 110000, max: 150000, median: 130000 },
        senior: { min: 150000, max: 200000, median: 175000 },
        lead: { min: 200000, max: 280000, median: 240000 },
      },
      "Data Scientist": {
        junior: { min: 80000, max: 105000, median: 92000 },
        mid: { min: 105000, max: 140000, median: 122000 },
        senior: { min: 140000, max: 185000, median: 162000 },
        lead: { min: 185000, max: 260000, median: 220000 },
      },
      "Marketing Manager": {
        junior: { min: 60000, max: 80000, median: 70000 },
        mid: { min: 80000, max: 110000, median: 95000 },
        senior: { min: 110000, max: 150000, median: 130000 },
        lead: { min: 150000, max: 200000, median: 175000 },
      },
    };

    // Market Intelligence Engine
    this.marketFactors = {
      location: {
        "San Francisco": 1.35,
        "New York": 1.25,
        Seattle: 1.2,
        "Los Angeles": 1.15,
        Boston: 1.1,
        Austin: 1.05,
        Remote: 0.95,
      },
      company: {
        FAANG: 1.4,
        Unicorn: 1.3,
        Public: 1.15,
        "Series B+": 1.1,
        "Series A": 1.05,
        Startup: 0.95,
      },
      skills: {
        "AI/ML": 1.25,
        "Cloud Architecture": 1.2,
        DevOps: 1.15,
        "Mobile Development": 1.1,
        "Full Stack": 1.05,
      },
    };

    // Negotiation Strategies Database
    this.negotiationStrategies = {
      lowball: {
        name: "Counter Lowball Offers",
        tactics: [
          "Research market rates thoroughly",
          "Present competing offers if available",
          "Highlight unique value proposition",
          "Request time to consider the offer",
        ],
      },
      equity: {
        name: "Equity Negotiation",
        tactics: [
          "Understand vesting schedule details",
          "Negotiate acceleration clauses",
          "Consider equity vs salary trade-offs",
          "Research company valuation trends",
        ],
      },
      benefits: {
        name: "Total Compensation Focus",
        tactics: [
          "Calculate full compensation package",
          "Negotiate flexible work arrangements",
          "Request professional development budget",
          "Discuss vacation time and PTO",
        ],
      },
      timing: {
        name: "Strategic Timing",
        tactics: [
          "Negotiate after proving initial value",
          "Align with performance review cycles",
          "Use competing offers strategically",
          "Build leverage through achievements",
        ],
      },
    };

    // Coaching Sessions Database
    this.coachingSessions = new Map();
    this.userProgress = new Map();

    console.log("💰 Salary Negotiation Coach Starting...");
    this.startServer();
  }

  setupMiddleware() {
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  }

  setupRoutes() {
    // Main coaching interface
    this.app.get("/", (req, res) => {
      res.send(this.getCoachingHTML());
    });

    // Salary benchmarking API
    this.app.post("/api/salary-benchmark", async (req, res) => {
      try {
        const { role, experience, location, company, skills } = req.body;
        const benchmark = await this.calculateSalaryBenchmark(
          role,
          experience,
          location,
          company,
          skills,
        );
        res.json(benchmark);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Negotiation strategy generator
    this.app.post("/api/negotiation-strategy", async (req, res) => {
      try {
        const { currentOffer, targetSalary, situation, leverage } = req.body;
        const strategy = await this.generateNegotiationStrategy(
          currentOffer,
          targetSalary,
          situation,
          leverage,
        );
        res.json(strategy);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Role-playing simulation
    this.app.post("/api/start-roleplay", async (req, res) => {
      try {
        const { userId, scenario, role } = req.body;
        const sessionId = `roleplay_${Date.now()}`;

        const session = {
          id: sessionId,
          userId,
          scenario,
          role,
          startTime: new Date(),
          exchanges: [],
          status: "active",
        };

        this.coachingSessions.set(sessionId, session);

        const firstResponse = this.generateEmployerResponse(
          scenario,
          "opening",
        );

        res.json({
          success: true,
          sessionId,
          employerResponse: firstResponse,
          tips: this.getScenarioTips(scenario),
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Submit negotiation response
    this.app.post("/api/submit-response", async (req, res) => {
      try {
        const { sessionId, userResponse } = req.body;
        const session = this.coachingSessions.get(sessionId);

        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Analyze user response
        const analysis = await this.analyzeNegotiationResponse(
          userResponse,
          session.scenario,
        );

        // Generate employer counter-response
        const employerResponse = this.generateEmployerResponse(
          session.scenario,
          "counter",
          userResponse,
        );

        // Record exchange
        session.exchanges.push({
          userResponse,
          analysis,
          employerResponse,
          timestamp: new Date(),
        });

        // Check if negotiation should end
        const shouldEnd =
          session.exchanges.length >= 3 || analysis.outcome === "success";

        if (shouldEnd) {
          session.status = "completed";
          const finalReport =
            await this.generateFinalNegotiationReport(session);

          res.json({
            success: true,
            isComplete: true,
            analysis,
            employerResponse,
            finalReport,
          });
        } else {
          res.json({
            success: true,
            isComplete: false,
            analysis,
            employerResponse,
            tips: this.getResponseTips(analysis),
          });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Market insights API
    this.app.get("/api/market-insights/:role", async (req, res) => {
      try {
        const insights = await this.getMarketInsights(req.params.role);
        res.json(insights);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Revenue tracking
    this.app.get("/api/revenue", (req, res) => {
      const totalSessions = this.coachingSessions.size;
      const activeUsers = new Set(
        [...this.coachingSessions.values()].map((s) => s.userId),
      ).size;

      res.json({
        totalSessions,
        activeUsers,
        revenuePerSession: 199, // $199 per coaching session
        monthlyRevenue: totalSessions * 199,
        projectedMonthly: Math.min(totalSessions * 199 * 3.5, 28000), // Growth projection
      });
    });
  }

  async calculateSalaryBenchmark(role, experience, location, company, skills) {
    const baseData = this.salaryData[role];
    if (!baseData) {
      throw new Error("Role not found in database");
    }

    const experienceData = baseData[experience];
    if (!experienceData) {
      throw new Error("Experience level not found");
    }

    // Apply market factors
    let adjustedSalary = experienceData.median;

    // Location adjustment
    const locationMultiplier = this.marketFactors.location[location] || 1.0;
    adjustedSalary *= locationMultiplier;

    // Company type adjustment
    const companyMultiplier = this.marketFactors.company[company] || 1.0;
    adjustedSalary *= companyMultiplier;

    // Skills adjustment
    const skillsMultiplier = skills.reduce((mult, skill) => {
      return mult * (this.marketFactors.skills[skill] || 1.0);
    }, 1.0);
    adjustedSalary *= Math.min(skillsMultiplier, 1.5); // Cap at 50% increase

    return {
      baseRange: experienceData,
      adjustedSalary: Math.round(adjustedSalary),
      marketFactors: {
        location: locationMultiplier,
        company: companyMultiplier,
        skills: skillsMultiplier,
      },
      negotiationRange: {
        conservative: Math.round(adjustedSalary * 1.05),
        aggressive: Math.round(adjustedSalary * 1.15),
        optimal: Math.round(adjustedSalary * 1.1),
      },
      insights: this.generateSalaryInsights(role, experience, adjustedSalary),
    };
  }

  generateSalaryInsights(role, experience, salary) {
    const insights = [
      `${role}s with ${experience} experience typically earn $${Math.round(salary).toLocaleString()}`,
      "Consider the full compensation package including equity and benefits",
      "Research recent funding rounds if negotiating with startups",
    ];

    if (salary > 150000) {
      insights.push(
        "At this level, equity and stock options become increasingly important",
      );
    }

    if (experience === "senior" || experience === "lead") {
      insights.push(
        "Senior roles have more negotiation flexibility due to high demand",
      );
    }

    return insights;
  }

  async generateNegotiationStrategy(
    currentOffer,
    targetSalary,
    situation,
    leverage,
  ) {
    const gap = targetSalary - currentOffer;
    const gapPercentage = (gap / currentOffer) * 100;

    let strategy = "balanced";
    if (gapPercentage > 20) strategy = "aggressive";
    if (gapPercentage < 5) strategy = "conservative";

    const tactics = this.selectNegotiationTactics(
      situation,
      leverage,
      gapPercentage,
    );

    return {
      strategy,
      gap: gap,
      gapPercentage: Math.round(gapPercentage),
      recommendedApproach: this.getRecommendedApproach(strategy),
      tactics: tactics,
      timeline: this.getNegotiationTimeline(strategy),
      scriptSuggestions: this.generateNegotiationScript(
        currentOffer,
        targetSalary,
        strategy,
      ),
      riskAssessment: this.assessNegotiationRisk(gapPercentage, leverage),
    };
  }

  selectNegotiationTactics(situation, leverage, gapPercentage) {
    const tactics = [];

    if (leverage.includes("competing_offer")) {
      tactics.push(...this.negotiationStrategies.lowball.tactics.slice(0, 2));
    }

    if (situation.includes("startup")) {
      tactics.push(...this.negotiationStrategies.equity.tactics.slice(0, 2));
    }

    if (gapPercentage > 15) {
      tactics.push(...this.negotiationStrategies.benefits.tactics);
    }

    tactics.push(...this.negotiationStrategies.timing.tactics.slice(0, 2));

    return [...new Set(tactics)].slice(0, 5); // Remove duplicates and limit to 5
  }

  getRecommendedApproach(strategy) {
    const approaches = {
      conservative:
        "Focus on demonstrating value and asking for modest increases",
      balanced:
        "Present market research while emphasizing your unique contributions",
      aggressive:
        "Leverage competing offers and highlight significant value gaps",
    };
    return approaches[strategy];
  }

  getNegotiationTimeline(strategy) {
    const timelines = {
      conservative: "1-2 weeks for response and counteroffers",
      balanced: "2-3 weeks including research and preparation time",
      aggressive: "3-4 weeks with multiple negotiation rounds",
    };
    return timelines[strategy];
  }

  generateNegotiationScript(currentOffer, targetSalary, strategy) {
    const scripts = {
      opening: `Thank you for the offer of $${currentOffer.toLocaleString()}. I'm excited about the opportunity and would like to discuss the compensation package.`,
      research: `Based on my research of market rates for similar roles, I was expecting something closer to $${targetSalary.toLocaleString()}.`,
      value: `Given my experience with [specific skills] and track record of [achievements], I believe this adjustment reflects my potential contribution.`,
      flexibility: `I'm open to discussing the total package, including equity, benefits, and growth opportunities.`,
      closing: `I'm very interested in moving forward and hope we can find a mutually beneficial arrangement.`,
    };

    return Object.values(scripts);
  }

  assessNegotiationRisk(gapPercentage, leverage) {
    let risk = "Medium";

    if (gapPercentage < 10 && leverage.length > 2) risk = "Low";
    if (gapPercentage > 25 && leverage.length < 2) risk = "High";

    const risks = {
      Low: "Strong position with minimal downside risk",
      Medium: "Balanced approach recommended with moderate risk",
      High: "Significant gap may require creative compensation solutions",
    };

    return { level: risk, description: risks[risk] };
  }

  generateEmployerResponse(scenario, stage, userResponse = null) {
    const responses = {
      opening: {
        lowball:
          "We're excited to extend this offer. The salary reflects our current budget constraints.",
        standard:
          "This offer is competitive based on our internal salary bands.",
        generous:
          "We believe this offer reflects the value you'll bring to our team.",
      },
      counter: {
        pushback:
          "I understand your perspective. Let me discuss this with our compensation team.",
        flexibility:
          "We have some flexibility in the total package. What aspects are most important to you?",
        final:
          "This is our best offer given current market conditions and budget constraints.",
      },
    };

    if (stage === "opening") {
      return responses.opening[scenario] || responses.opening.standard;
    }

    // Analyze user response and generate appropriate counter
    const responseType = this.analyzeUserResponseType(userResponse);
    return responses.counter[responseType] || responses.counter.flexibility;
  }

  analyzeUserResponseType(response) {
    if (!response) return "flexibility";

    const lowerResponse = response.toLowerCase();
    if (
      lowerResponse.includes("competing") ||
      lowerResponse.includes("other offer")
    ) {
      return "pushback";
    }
    if (lowerResponse.includes("final") || lowerResponse.includes("best")) {
      return "final";
    }
    return "flexibility";
  }

  getScenarioTips(scenario) {
    const tips = {
      lowball: [
        "Don't accept the first offer immediately",
        "Research market rates before responding",
        "Present your value proposition clearly",
      ],
      standard: [
        "Express enthusiasm for the role",
        "Ask about the total compensation package",
        "Negotiate based on specific achievements",
      ],
      generous: [
        "Still negotiate - there may be room for improvement",
        "Focus on non-salary benefits if salary is fixed",
        "Consider long-term growth opportunities",
      ],
    };

    return tips[scenario] || tips.standard;
  }

  async analyzeNegotiationResponse(response, scenario) {
    // Simulate AI analysis of negotiation response
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const analysis = {
      confidence: Math.floor(Math.random() * 30) + 70,
      persuasiveness: Math.floor(Math.random() * 25) + 75,
      professionalism: Math.floor(Math.random() * 20) + 80,
      strategicApproach: Math.floor(Math.random() * 35) + 65,
      overallScore: Math.floor(Math.random() * 25) + 75,
      strengths: this.identifyResponseStrengths(response),
      improvements: this.identifyResponseImprovements(response),
      outcome: this.predictNegotiationOutcome(response, scenario),
    };

    return analysis;
  }

  identifyResponseStrengths(response) {
    const strengths = [
      "Clear communication of expectations",
      "Professional tone throughout",
      "Reference to market research",
      "Emphasis on mutual benefit",
      "Specific examples of value",
    ];

    return strengths.sort(() => 0.5 - Math.random()).slice(0, 2);
  }

  identifyResponseImprovements(response) {
    const improvements = [
      "Could provide more specific market data",
      "Consider mentioning competing offers",
      "Highlight unique qualifications more clearly",
      "Express more enthusiasm for the role",
      "Request specific timeline for response",
    ];

    return improvements.sort(() => 0.5 - Math.random()).slice(0, 2);
  }

  predictNegotiationOutcome(response, scenario) {
    const outcomes = ["success", "partial", "ongoing"];
    return outcomes[Math.floor(Math.random() * outcomes.length)];
  }

  getResponseTips(analysis) {
    const tips = [
      "Maintain professional tone while being assertive",
      "Provide specific examples of your achievements",
      "Research competing offers if possible",
      "Consider the total compensation package",
      "Be prepared to justify your salary expectations",
    ];

    return tips.slice(0, 3);
  }

  async generateFinalNegotiationReport(session) {
    const exchanges = session.exchanges;
    const avgScore =
      exchanges.reduce((sum, ex) => sum + ex.analysis.overallScore, 0) /
      exchanges.length;

    return {
      overallPerformance: Math.round(avgScore),
      grade: this.getNegotiationGrade(avgScore),
      keyStrengths: this.aggregateStrengths(exchanges),
      areasForImprovement: this.aggregateImprovements(exchanges),
      negotiationOutcome: this.getFinalOutcome(exchanges),
      salaryImpactEstimate: this.estimateSalaryImpact(avgScore),
      nextSteps: this.getPersonalizedNextSteps(avgScore),
      practiceRecommendations: this.getPracticeRecommendations(
        session.scenario,
      ),
    };
  }

  getNegotiationGrade(score) {
    if (score >= 90) return "A+";
    if (score >= 85) return "A";
    if (score >= 80) return "B+";
    if (score >= 75) return "B";
    if (score >= 70) return "C+";
    return "C";
  }

  aggregateStrengths(exchanges) {
    const allStrengths = exchanges.flatMap((ex) => ex.analysis.strengths);
    const counts = {};
    allStrengths.forEach(
      (strength) => (counts[strength] = (counts[strength] || 0) + 1),
    );

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([strength]) => strength);
  }

  aggregateImprovements(exchanges) {
    const allImprovements = exchanges.flatMap((ex) => ex.analysis.improvements);
    const counts = {};
    allImprovements.forEach((imp) => (counts[imp] = (counts[imp] || 0) + 1));

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([improvement]) => improvement);
  }

  getFinalOutcome(exchanges) {
    const outcomes = exchanges.map((ex) => ex.analysis.outcome);
    if (outcomes.includes("success"))
      return "Successfully negotiated higher compensation";
    if (outcomes.includes("partial"))
      return "Achieved partial success with room for improvement";
    return "Gained valuable negotiation experience";
  }

  estimateSalaryImpact(score) {
    const impactPercentages = {
      90: "15-20% salary increase potential",
      85: "12-15% salary increase potential",
      80: "8-12% salary increase potential",
      75: "5-8% salary increase potential",
      70: "3-5% salary increase potential",
    };

    for (const threshold of Object.keys(impactPercentages).sort(
      (a, b) => b - a,
    )) {
      if (score >= parseInt(threshold)) {
        return impactPercentages[threshold];
      }
    }

    return "0-3% salary increase potential";
  }

  getPersonalizedNextSteps(score) {
    const baseSteps = [
      "Practice negotiation scenarios regularly",
      "Research salary data for your specific role and location",
      "Build a portfolio of achievements and quantifiable results",
    ];

    if (score < 75) {
      baseSteps.unshift("Focus on fundamental negotiation skills");
      baseSteps.push("Consider additional coaching sessions");
    }

    if (score >= 85) {
      baseSteps.push("Apply these skills in real negotiations");
      baseSteps.push("Mentor others in salary negotiation techniques");
    }

    return baseSteps;
  }

  getPracticeRecommendations(scenario) {
    const recommendations = {
      lowball: [
        "Practice responding to below-market offers",
        "Prepare compelling value propositions",
        "Research multiple salary sources",
      ],
      standard: [
        "Practice balanced negotiation approaches",
        "Develop benefit package alternatives",
        "Build confidence in salary discussions",
      ],
      generous: [
        "Practice negotiating from positions of strength",
        "Focus on long-term career growth discussions",
        "Explore creative compensation structures",
      ],
    };

    return recommendations[scenario] || recommendations.standard;
  }

  async getMarketInsights(role) {
    // Simulate market data retrieval
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const insights = {
      demandTrend: "High",
      salaryGrowth: "+8.5% year-over-year",
      hotSkills: ["AI/ML", "Cloud Architecture", "DevOps"],
      topPayingCompanies: ["Google", "Meta", "Netflix", "Stripe"],
      negotiationSuccess:
        "78% of professionals who negotiate receive increases",
      averageIncrease: "$12,500 average salary increase through negotiation",
    };

    return insights;
  }

  getCoachingHTML() {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>💰 AI Salary Negotiation Coach</title>
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
                
                .coach-panel {
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
                }
                .tab {
                    padding: 15px 25px;
                    cursor: pointer;
                    border-bottom: 3px solid transparent;
                    transition: all 0.3s;
                    font-weight: 600;
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
                
                .salary-benchmark {
                    background: linear-gradient(135deg, #11998e, #38ef7d);
                    color: white;
                    border-radius: 15px;
                    padding: 30px;
                    margin: 20px 0;
                    text-align: center;
                }
                .benchmark-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-top: 20px;
                }
                .benchmark-item {
                    background: rgba(255,255,255,0.2);
                    padding: 20px;
                    border-radius: 10px;
                }
                .benchmark-item .value { font-size: 1.8em; font-weight: bold; margin-bottom: 5px; }
                .benchmark-item .label { font-size: 0.9em; opacity: 0.9; }
                
                .negotiation-strategy {
                    background: #f8f9fa;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 20px 0;
                }
                .strategy-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin: 20px 0;
                }
                .strategy-item {
                    background: white;
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                }
                .strategy-item h4 { color: #667eea; margin-bottom: 10px; }
                
                .roleplay-section {
                    background: linear-gradient(135deg, #ff9a9e, #fecfef);
                    border-radius: 15px;
                    padding: 30px;
                    margin: 20px 0;
                }
                .conversation {
                    background: white;
                    border-radius: 10px;
                    padding: 20px;
                    margin: 15px 0;
                    max-height: 400px;
                    overflow-y: auto;
                }
                .message {
                    margin: 10px 0;
                    padding: 10px 15px;
                    border-radius: 8px;
                }
                .employer-message {
                    background: #e3f2fd;
                    border-left: 4px solid #2196f3;
                }
                .user-message {
                    background: #f3e5f5;
                    border-left: 4px solid #9c27b0;
                }
                
                .analysis-results {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border-radius: 15px;
                    padding: 25px;
                    margin: 20px 0;
                }
                .analysis-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin: 15px 0;
                }
                .analysis-item {
                    background: rgba(255,255,255,0.2);
                    padding: 15px;
                    border-radius: 10px;
                    text-align: center;
                }
                .analysis-item .score { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
                .analysis-item .label { font-size: 0.9em; opacity: 0.9; }
                
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
                    .strategy-grid, .benchmark-grid, .analysis-grid { grid-template-columns: 1fr; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>💰 AI Salary Negotiation Coach</h1>
                    <p>Master the art of salary negotiation with AI-powered strategies and practice</p>
                </div>
                
                <div class="coach-panel">
                    <div class="tabs">
                        <div class="tab active" onclick="switchTab('benchmark')">📊 Salary Benchmark</div>
                        <div class="tab" onclick="switchTab('strategy')">🎯 Strategy Generator</div>
                        <div class="tab" onclick="switchTab('roleplay')">🎭 Role-Play Practice</div>
                        <div class="tab" onclick="switchTab('insights')">📈 Market Insights</div>
                    </div>
                    
                    <!-- Salary Benchmark Tab -->
                    <div id="benchmark" class="tab-content active">
                        <h2>🎯 Salary Benchmarking Tool</h2>
                        <div class="form-group">
                            <label for="role">Role:</label>
                            <select id="role">
                                <option value="Software Engineer">Software Engineer</option>
                                <option value="Product Manager">Product Manager</option>
                                <option value="Data Scientist">Data Scientist</option>
                                <option value="Marketing Manager">Marketing Manager</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="experience">Experience Level:</label>
                            <select id="experience">
                                <option value="junior">Junior (0-2 years)</option>
                                <option value="mid">Mid-level (3-5 years)</option>
                                <option value="senior">Senior (6-10 years)</option>
                                <option value="lead">Lead/Principal (10+ years)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="location">Location:</label>
                            <select id="location">
                                <option value="San Francisco">San Francisco</option>
                                <option value="New York">New York</option>
                                <option value="Seattle">Seattle</option>
                                <option value="Los Angeles">Los Angeles</option>
                                <option value="Boston">Boston</option>
                                <option value="Austin">Austin</option>
                                <option value="Remote">Remote</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="company">Company Type:</label>
                            <select id="company">
                                <option value="FAANG">FAANG</option>
                                <option value="Unicorn">Unicorn Startup</option>
                                <option value="Public">Public Company</option>
                                <option value="Series B+">Series B+ Startup</option>
                                <option value="Series A">Series A Startup</option>
                                <option value="Startup">Early Stage Startup</option>
                            </select>
                        </div>
                        <button class="btn btn-primary" onclick="calculateBenchmark()">📊 Calculate Benchmark</button>
                        
                        <div id="benchmarkResults" class="salary-benchmark" style="display: none;">
                            <h3>💰 Your Salary Benchmark</h3>
                            <div class="benchmark-grid" id="benchmarkGrid"></div>
                        </div>
                    </div>
                    
                    <!-- Strategy Generator Tab -->
                    <div id="strategy" class="tab-content">
                        <h2>🎯 Negotiation Strategy Generator</h2>
                        <div class="form-group">
                            <label for="currentOffer">Current Offer ($):</label>
                            <input type="number" id="currentOffer" placeholder="120000">
                        </div>
                        <div class="form-group">
                            <label for="targetSalary">Target Salary ($):</label>
                            <input type="number" id="targetSalary" placeholder="140000">
                        </div>
                        <div class="form-group">
                            <label for="situation">Situation:</label>
                            <select id="situation">
                                <option value="new_job">New Job Offer</option>
                                <option value="promotion">Internal Promotion</option>
                                <option value="review">Performance Review</option>
                                <option value="retention">Retention Discussion</option>
                            </select>
                        </div>
                        <button class="btn btn-success" onclick="generateStrategy()">🎯 Generate Strategy</button>
                        
                        <div id="strategyResults" class="negotiation-strategy" style="display: none;">
                            <h3>🚀 Your Negotiation Strategy</h3>
                            <div class="strategy-grid" id="strategyGrid"></div>
                        </div>
                    </div>
                    
                    <!-- Role-Play Tab -->
                    <div id="roleplay" class="tab-content">
                        <h2>🎭 Negotiation Role-Play Practice</h2>
                        <div class="form-group">
                            <label for="scenario">Scenario:</label>
                            <select id="scenario">
                                <option value="lowball">Lowball Offer Response</option>
                                <option value="standard">Standard Negotiation</option>
                                <option value="generous">Generous Offer Discussion</option>
                            </select>
                        </div>
                        <button class="btn btn-warning" onclick="startRoleplay()">🎭 Start Role-Play</button>
                        
                        <div id="roleplaySection" class="roleplay-section" style="display: none;">
                            <h3>💼 Negotiation Simulation</h3>
                            <div id="conversation" class="conversation"></div>
                            <div class="form-group">
                                <textarea id="userResponse" placeholder="Type your negotiation response here..." rows="3"></textarea>
                            </div>
                            <button class="btn btn-primary" onclick="submitResponse()">📤 Submit Response</button>
                            
                            <div id="analysisResults" class="analysis-results" style="display: none;">
                                <h4>🔍 AI Analysis</h4>
                                <div class="analysis-grid" id="analysisGrid"></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Market Insights Tab -->
                    <div id="insights" class="tab-content">
                        <h2>📈 Market Insights</h2>
                        <div id="marketInsights">
                            <p>Loading market insights...</p>
                        </div>
                    </div>
                </div>
                
                <div class="revenue-stats">
                    <h4>💰 Salary Negotiation Coaching Revenue</h4>
                    <div class="revenue-grid" id="revenueGrid">
                        <div class="revenue-item">
                            <div class="value" id="totalSessions">0</div>
                            <div class="label">Total Sessions</div>
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
                            <div class="value" id="projectedRevenue">$28K</div>
                            <div class="label">Revenue Target</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                let currentRoleplaySession = null;
                
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
                    
                    // Load market insights if insights tab is selected
                    if (tabName === 'insights') {
                        loadMarketInsights();
                    }
                }
                
                async function calculateBenchmark() {
                    const role = document.getElementById('role').value;
                    const experience = document.getElementById('experience').value;
                    const location = document.getElementById('location').value;
                    const company = document.getElementById('company').value;
                    const skills = ['AI/ML']; // Simplified for demo
                    
                    try {
                        const response = await fetch('/api/salary-benchmark', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ role, experience, location, company, skills })
                        });
                        
                        const data = await response.json();
                        displayBenchmarkResults(data);
                    } catch (error) {
                        alert('Failed to calculate benchmark: ' + error.message);
                    }
                }
                
                function displayBenchmarkResults(data) {
                    document.getElementById('benchmarkResults').style.display = 'block';
                    
                    const grid = document.getElementById('benchmarkGrid');
                    grid.innerHTML = \`
                        <div class="benchmark-item">
                            <div class="value">$\${data.adjustedSalary.toLocaleString()}</div>
                            <div class="label">Market Rate</div>
                        </div>
                        <div class="benchmark-item">
                            <div class="value">$\${data.negotiationRange.conservative.toLocaleString()}</div>
                            <div class="label">Conservative Ask</div>
                        </div>
                        <div class="benchmark-item">
                            <div class="value">$\${data.negotiationRange.optimal.toLocaleString()}</div>
                            <div class="label">Optimal Target</div>
                        </div>
                        <div class="benchmark-item">
                            <div class="value">$\${data.negotiationRange.aggressive.toLocaleString()}</div>
                            <div class="label">Aggressive Ask</div>
                        </div>
                    \`;
                }
                
                async function generateStrategy() {
                    const currentOffer = parseInt(document.getElementById('currentOffer').value);
                    const targetSalary = parseInt(document.getElementById('targetSalary').value);
                    const situation = document.getElementById('situation').value;
                    const leverage = ['market_research']; // Simplified for demo
                    
                    if (!currentOffer || !targetSalary) {
                        alert('Please enter both current offer and target salary');
                        return;
                    }
                    
                    try {
                        const response = await fetch('/api/negotiation-strategy', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ currentOffer, targetSalary, situation, leverage })
                        });
                        
                        const data = await response.json();
                        displayStrategyResults(data);
                    } catch (error) {
                        alert('Failed to generate strategy: ' + error.message);
                    }
                }
                
                function displayStrategyResults(data) {
                    document.getElementById('strategyResults').style.display = 'block';
                    
                    const grid = document.getElementById('strategyGrid');
                    grid.innerHTML = \`
                        <div class="strategy-item">
                            <h4>📈 Gap Analysis</h4>
                            <p>Gap: $\${data.gap.toLocaleString()} (\${data.gapPercentage}%)</p>
                            <p>Strategy: \${data.strategy.toUpperCase()}</p>
                        </div>
                        <div class="strategy-item">
                            <h4>🎯 Recommended Approach</h4>
                            <p>\${data.recommendedApproach}</p>
                        </div>
                        <div class="strategy-item">
                            <h4>⏰ Timeline</h4>
                            <p>\${data.timeline}</p>
                        </div>
                        <div class="strategy-item">
                            <h4>⚠️ Risk Assessment</h4>
                            <p>\${data.riskAssessment.level} Risk</p>
                            <p>\${data.riskAssessment.description}</p>
                        </div>
                    \`;
                }
                
                async function startRoleplay() {
                    const scenario = document.getElementById('scenario').value;
                    const userId = 'demo_user';
                    const role = 'candidate';
                    
                    try {
                        const response = await fetch('/api/start-roleplay', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId, scenario, role })
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            currentRoleplaySession = data.sessionId;
                            document.getElementById('roleplaySection').style.display = 'block';
                            
                            const conversation = document.getElementById('conversation');
                            conversation.innerHTML = \`
                                <div class="message employer-message">
                                    <strong>Employer:</strong> \${data.employerResponse}
                                </div>
                            \`;
                        }
                    } catch (error) {
                        alert('Failed to start roleplay: ' + error.message);
                    }
                }
                
                async function submitResponse() {
                    const userResponse = document.getElementById('userResponse').value;
                    if (!userResponse || !currentRoleplaySession) {
                        alert('Please enter a response');
                        return;
                    }
                    
                    try {
                        const response = await fetch('/api/submit-response', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                sessionId: currentRoleplaySession, 
                                userResponse 
                            })
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            // Add user response to conversation
                            const conversation = document.getElementById('conversation');
                            conversation.innerHTML += \`
                                <div class="message user-message">
                                    <strong>You:</strong> \${userResponse}
                                </div>
                                <div class="message employer-message">
                                    <strong>Employer:</strong> \${data.employerResponse}
                                </div>
                            \`;
                            
                            // Display analysis
                            displayAnalysis(data.analysis);
                            
                            // Clear input
                            document.getElementById('userResponse').value = '';
                            
                            // Scroll to bottom
                            conversation.scrollTop = conversation.scrollHeight;
                        }
                    } catch (error) {
                        alert('Failed to submit response: ' + error.message);
                    }
                }
                
                function displayAnalysis(analysis) {
                    document.getElementById('analysisResults').style.display = 'block';
                    
                    const grid = document.getElementById('analysisGrid');
                    grid.innerHTML = \`
                        <div class="analysis-item">
                            <div class="score">\${analysis.confidence}</div>
                            <div class="label">Confidence</div>
                        </div>
                        <div class="analysis-item">
                            <div class="score">\${analysis.persuasiveness}</div>
                            <div class="label">Persuasiveness</div>
                        </div>
                        <div class="analysis-item">
                            <div class="score">\${analysis.professionalism}</div>
                            <div class="label">Professionalism</div>
                        </div>
                        <div class="analysis-item">
                            <div class="score">\${analysis.overallScore}</div>
                            <div class="label">Overall Score</div>
                        </div>
                    \`;
                }
                
                async function loadMarketInsights() {
                    try {
                        const response = await fetch('/api/market-insights/Software Engineer');
                        const data = await response.json();
                        
                        document.getElementById('marketInsights').innerHTML = \`
                            <h3>📊 Current Market Trends</h3>
                            <div class="strategy-grid">
                                <div class="strategy-item">
                                    <h4>📈 Demand Trend</h4>
                                    <p>\${data.demandTrend}</p>
                                </div>
                                <div class="strategy-item">
                                    <h4>💰 Salary Growth</h4>
                                    <p>\${data.salaryGrowth}</p>
                                </div>
                                <div class="strategy-item">
                                    <h4>🔥 Hot Skills</h4>
                                    <p>\${data.hotSkills.join(', ')}</p>
                                </div>
                                <div class="strategy-item">
                                    <h4>🏆 Top Paying Companies</h4>
                                    <p>\${data.topPayingCompanies.join(', ')}</p>
                                </div>
                                <div class="strategy-item">
                                    <h4>✅ Negotiation Success</h4>
                                    <p>\${data.negotiationSuccess}</p>
                                </div>
                                <div class="strategy-item">
                                    <h4>📊 Average Increase</h4>
                                    <p>\${data.averageIncrease}</p>
                                </div>
                            </div>
                        \`;
                    } catch (error) {
                        document.getElementById('marketInsights').innerHTML = \`
                            <p>Failed to load market insights: \${error.message}</p>
                        \`;
                    }
                }
                
                // Load revenue data
                async function loadRevenueData() {
                    try {
                        const response = await fetch('/api/revenue');
                        const data = await response.json();
                        
                        document.getElementById('totalSessions').textContent = data.totalSessions;
                        document.getElementById('activeUsers').textContent = data.activeUsers;
                        document.getElementById('monthlyRevenue').textContent = \`$\${data.monthlyRevenue.toLocaleString()}\`;
                        document.getElementById('projectedRevenue').textContent = \`$\${data.projectedMonthly.toLocaleString()}\`;
                    } catch (error) {
                        console.error('Failed to load revenue data:', error);
                    }
                }
                
                // Initialize
                loadRevenueData();
                setInterval(loadRevenueData, 30000); // Update every 30 seconds
            </script>
        </body>
        </html>
        `;
  }

  async startServer() {
    this.app.listen(this.port, () => {
      console.log(`💰 Salary Negotiation Coach running on port ${this.port}`);
      console.log(`🔗 http://localhost:${this.port}`);
      console.log(`💵 Premium coaching sessions: $199 each`);
      console.log(`🎯 Revenue target: $28K/month`);
      this.logStartup();
    });
  }

  async logStartup() {
    const logEntry = `
💰 Salary Negotiation Coach LAUNCHED!
🎯 AI-powered salary benchmarking and negotiation strategies
📊 Real-time market data and compensation analysis
🎭 Interactive role-playing for negotiation practice
💵 Revenue model: $199 per coaching session
📈 Target: $28K/month revenue
⚡ READY TO MAXIMIZE EARNING POTENTIAL!

`;

    try {
      await fs.appendFile("salary_coaching.log", logEntry);
    } catch (error) {
      console.log("Logging note:", error.message);
    }
  }
}

// Start the Salary Negotiation Coach
const salaryCoach = new SalaryNegotiationCoach();

module.exports = SalaryNegotiationCoach;
