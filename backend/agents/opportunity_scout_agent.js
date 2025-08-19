const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");

// Optional dependency - only use if available
let cheerio = null;
try {
  cheerio = require("cheerio");
} catch (error) {
  console.log("⚠️ Cheerio not available - web scraping features disabled");
}

class OpportunityScoutAgent {
  constructor() {
    this.name = "NEURO-OPPORTUNITY-SCOUT-AGENT";
    this.version = "1.0.0";
    this.status = "ACTIVE";
    this.capabilities = [
      "trend_analysis",
      "market_research",
      "competitor_monitoring",
      "opportunity_identification",
      "business_intelligence",
      "innovation_tracking",
    ];

    this.config = {
      openai_api_key: process.env.OPENAI_API_KEY,
      google_trends_api: process.env.GOOGLE_TRENDS_API,
      twitter_api_key: process.env.TWITTER_API_KEY,
      reddit_api_key: process.env.REDDIT_API_KEY,
    };

    this.opportunities = new Map();
    this.trends = new Map();
    this.competitors = new Map();
    this.market_data = new Map();

    this.performance_metrics = {
      opportunities_identified: 0,
      trends_analyzed: 0,
      competitors_monitored: 0,
      market_reports_generated: 0,
      successful_predictions: 0,
    };

    this.monitoring_categories = [
      "ai_automation",
      "digital_services",
      "trading_finance",
      "remote_work",
      "saas_tools",
      "content_creation",
    ];

    this.data_sources = [
      "google_trends",
      "twitter",
      "reddit",
      "product_hunt",
      "hacker_news",
      "industry_reports",
    ];

    this.logFile = path.join(__dirname, "../logs/opportunity_scout_agent.log");
    this.init();
  }

  async init() {
    await this.log("🚀 NEURO-OPPORTUNITY-SCOUT-AGENT v1.0.0 INITIALIZING...");
    await this.loadHistoricalData();
    await this.log("✅ Opportunity Scout Agent READY FOR DISCOVERY");
  }

  async log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(logMessage.trim());

    try {
      await fs.appendFile(this.logFile, logMessage);
    } catch (error) {
      console.error("Logging error:", error);
    }
  }

  async scanForOpportunities(categories = this.monitoring_categories) {
    try {
      await this.log(
        `🔍 SCANNING FOR OPPORTUNITIES in ${categories.length} categories`,
      );

      const scanId = `scan_${Date.now()}`;
      const opportunities = [];

      for (const category of categories) {
        await this.log(`📊 Analyzing category: ${category}`);

        // Trend analysis
        const trends = await this.analyzeTrends(category);

        // Market gap analysis
        const gaps = await this.identifyMarketGaps(category);

        // Competitor analysis
        const competitorInsights = await this.analyzeCompetitors(category);

        // Social media sentiment
        const sentiment = await this.analyzeSocialSentiment(category);

        // Combine insights into opportunities
        const categoryOpportunities = await this.synthesizeOpportunities(
          category,
          trends,
          gaps,
          competitorInsights,
          sentiment,
        );

        opportunities.push(...categoryOpportunities);
      }

      // Rank opportunities by potential
      const rankedOpportunities = this.rankOpportunities(opportunities);

      this.performance_metrics.opportunities_identified +=
        rankedOpportunities.length;
      await this.saveOpportunities(rankedOpportunities);

      await this.log(
        `✅ Scan complete: ${rankedOpportunities.length} opportunities identified`,
      );
      return rankedOpportunities;
    } catch (error) {
      await this.log(`❌ Opportunity scan failed: ${error.message}`);
      throw error;
    }
  }

  async analyzeTrends(category) {
    try {
      await this.log(`📈 ANALYZING TRENDS for ${category}`);

      const trends = {
        google_trends: await this.getGoogleTrends(category),
        social_trends: await this.getSocialTrends(category),
        industry_trends: await this.getIndustryTrends(category),
      };

      // Analyze trend patterns
      const trendAnalysis = await this.analyzeTrendPatterns(trends, category);

      this.trends.set(category, {
        ...trends,
        analysis: trendAnalysis,
        last_updated: new Date(),
      });

      this.performance_metrics.trends_analyzed++;
      return trendAnalysis;
    } catch (error) {
      await this.log(
        `❌ Trend analysis failed for ${category}: ${error.message}`,
      );
      return { growth_rate: 0, momentum: "STABLE", confidence: 0.5 };
    }
  }

  async getGoogleTrends(category) {
    try {
      // Simulate Google Trends data (replace with actual API call)
      const trendKeywords = this.getCategoryKeywords(category);
      const trends = {};

      for (const keyword of trendKeywords) {
        trends[keyword] = {
          interest_over_time: this.generateMockTrendData(),
          related_queries: this.generateRelatedQueries(keyword),
          geographic_distribution: this.generateGeoData(),
        };
      }

      return trends;
    } catch (error) {
      await this.log(`❌ Google Trends fetch failed: ${error.message}`);
      return {};
    }
  }

  async getSocialTrends(category) {
    try {
      // Simulate social media trend data
      const socialData = {
        twitter: {
          mentions: Math.floor(Math.random() * 10000),
          sentiment: Math.random(),
          engagement_rate: Math.random() * 0.1,
        },
        reddit: {
          posts: Math.floor(Math.random() * 1000),
          upvote_ratio: Math.random(),
          comment_engagement: Math.random() * 50,
        },
        linkedin: {
          professional_discussions: Math.floor(Math.random() * 500),
          job_postings: Math.floor(Math.random() * 200),
          skill_demand: Math.random(),
        },
      };

      return socialData;
    } catch (error) {
      await this.log(`❌ Social trends fetch failed: ${error.message}`);
      return {};
    }
  }

  async getIndustryTrends(category) {
    try {
      // Generate industry-specific trend data
      const industryData = {
        market_size: Math.floor(Math.random() * 1000000000), // Random market size
        growth_rate: Math.random() * 0.5 + 0.05, // 5-55% growth
        investment_activity: Math.floor(Math.random() * 100),
        new_companies: Math.floor(Math.random() * 50),
        regulatory_changes: Math.floor(Math.random() * 5),
      };

      return industryData;
    } catch (error) {
      await this.log(`❌ Industry trends fetch failed: ${error.message}`);
      return {};
    }
  }

  async identifyMarketGaps(category) {
    try {
      await this.log(`🕳️ IDENTIFYING MARKET GAPS in ${category}`);

      const gaps = [];

      // Analyze current market offerings
      const marketAnalysis = await this.analyzeCurrentMarket(category);

      // Identify underserved segments
      const underservedSegments = await this.findUnderservedSegments(category);

      // Technology gap analysis
      const techGaps = await this.analyzeTechnologyGaps(category);

      // Price point analysis
      const pricingGaps = await this.analyzePricingGaps(category);

      gaps.push(...underservedSegments, ...techGaps, ...pricingGaps);

      return this.prioritizeGaps(gaps);
    } catch (error) {
      await this.log(`❌ Market gap analysis failed: ${error.message}`);
      return [];
    }
  }

  async analyzeCurrentMarket(category) {
    // Mock market analysis
    return {
      total_players: Math.floor(Math.random() * 100),
      market_saturation: Math.random(),
      price_ranges: {
        low: Math.floor(Math.random() * 50),
        mid: Math.floor(Math.random() * 200) + 50,
        high: Math.floor(Math.random() * 500) + 250,
      },
    };
  }

  async findUnderservedSegments(category) {
    const segments = [
      {
        type: "geographic",
        description: "Underserved international markets",
        opportunity_size: Math.random() * 100000000,
        difficulty: Math.random(),
      },
      {
        type: "demographic",
        description: "SMB market lacking enterprise features",
        opportunity_size: Math.random() * 50000000,
        difficulty: Math.random(),
      },
      {
        type: "price_point",
        description: "Mid-market pricing gap",
        opportunity_size: Math.random() * 30000000,
        difficulty: Math.random(),
      },
    ];

    return segments;
  }

  async analyzeTechnologyGaps(category) {
    const techGaps = [
      {
        type: "automation",
        description: "Manual processes that could be automated",
        impact: Math.random(),
        feasibility: Math.random(),
      },
      {
        type: "integration",
        description: "Lack of API integrations",
        impact: Math.random(),
        feasibility: Math.random(),
      },
      {
        type: "ai_enhancement",
        description: "Traditional tools needing AI upgrade",
        impact: Math.random(),
        feasibility: Math.random(),
      },
    ];

    return techGaps;
  }

  async analyzePricingGaps(category) {
    return [
      {
        type: "freemium",
        description: "Lack of freemium offerings",
        market_size: Math.random() * 20000000,
        conversion_potential: Math.random(),
      },
      {
        type: "enterprise",
        description: "Missing enterprise tier",
        market_size: Math.random() * 100000000,
        conversion_potential: Math.random(),
      },
    ];
  }

  async analyzeCompetitors(category) {
    try {
      await this.log(`🏢 ANALYZING COMPETITORS in ${category}`);

      const competitors = await this.identifyCompetitors(category);
      const analysis = {
        market_leaders: [],
        emerging_players: [],
        weaknesses: [],
        opportunities: [],
      };

      for (const competitor of competitors) {
        const competitorData = await this.analyzeCompetitor(competitor);

        if (competitorData.market_share > 0.2) {
          analysis.market_leaders.push(competitorData);
        } else {
          analysis.emerging_players.push(competitorData);
        }

        analysis.weaknesses.push(...competitorData.weaknesses);
        analysis.opportunities.push(...competitorData.opportunities);
      }

      this.competitors.set(category, analysis);
      this.performance_metrics.competitors_monitored += competitors.length;

      return analysis;
    } catch (error) {
      await this.log(`❌ Competitor analysis failed: ${error.message}`);
      return {
        market_leaders: [],
        emerging_players: [],
        weaknesses: [],
        opportunities: [],
      };
    }
  }

  async identifyCompetitors(category) {
    // Mock competitor identification
    const competitorNames = [
      "TechCorp AI",
      "DataFlow Solutions",
      "AutomateNow",
      "SmartTools Inc",
      "DigitalEdge",
      "InnovateLab",
    ];

    return competitorNames.slice(0, Math.floor(Math.random() * 6) + 2);
  }

  async analyzeCompetitor(competitorName) {
    return {
      name: competitorName,
      market_share: Math.random() * 0.4,
      pricing_strategy: Math.random() > 0.5 ? "premium" : "value",
      strengths: ["Strong brand", "Good marketing", "Established user base"],
      weaknesses: [
        "Limited features",
        "Poor customer service",
        "Outdated tech",
      ],
      opportunities: [
        "Mobile optimization",
        "API development",
        "International expansion",
      ],
    };
  }

  async analyzeSocialSentiment(category) {
    try {
      await this.log(`💭 ANALYZING SOCIAL SENTIMENT for ${category}`);

      const sentiment = {
        overall_sentiment: Math.random() * 2 - 1, // -1 to 1
        volume: Math.floor(Math.random() * 10000),
        trending_topics: this.generateTrendingTopics(category),
        pain_points: this.generatePainPoints(category),
        opportunities: this.generateSocialOpportunities(category),
      };

      return sentiment;
    } catch (error) {
      await this.log(`❌ Social sentiment analysis failed: ${error.message}`);
      return {
        overall_sentiment: 0,
        volume: 0,
        trending_topics: [],
        pain_points: [],
        opportunities: [],
      };
    }
  }

  generateTrendingTopics(category) {
    const topics = {
      ai_automation: [
        "AI prompt engineering",
        "Workflow automation",
        "ChatGPT integrations",
      ],
      digital_services: [
        "Remote work tools",
        "Digital transformation",
        "Cloud migration",
      ],
      trading_finance: [
        "Algorithmic trading",
        "DeFi platforms",
        "Crypto regulations",
      ],
    };

    return topics[category] || ["General trending topic"];
  }

  generatePainPoints(category) {
    const painPoints = {
      ai_automation: ["Complex setup", "Integration issues", "Cost concerns"],
      digital_services: [
        "Security worries",
        "Training requirements",
        "Vendor lock-in",
      ],
      trading_finance: [
        "Regulatory compliance",
        "Risk management",
        "Technical complexity",
      ],
    };

    return painPoints[category] || ["Common pain point"];
  }

  generateSocialOpportunities(category) {
    return [
      "Educational content demand",
      "Community building needs",
      "Influencer partnerships",
      "User-generated content",
    ];
  }

  async synthesizeOpportunities(
    category,
    trends,
    gaps,
    competitors,
    sentiment,
  ) {
    try {
      const prompt = `Analyze the following market data for ${category} and identify 3-5 specific business opportunities:
            
            Trends: ${JSON.stringify(trends, null, 2)}
            Market Gaps: ${JSON.stringify(gaps, null, 2)}
            Competitor Analysis: ${JSON.stringify(competitors, null, 2)}
            Social Sentiment: ${JSON.stringify(sentiment, null, 2)}
            
            For each opportunity, provide:
            - Opportunity description
            - Market size estimate
            - Implementation difficulty (1-10)
            - Revenue potential (1-10)
            - Time to market (months)
            - Required resources
            
            Format as JSON array.`;

      const opportunities = await this.callOpenAI(prompt);
      const parsedOpportunities = JSON.parse(opportunities);

      return parsedOpportunities.map((opp) => ({
        ...opp,
        category: category,
        identified_at: new Date(),
        confidence_score: this.calculateConfidenceScore(opp, trends, sentiment),
      }));
    } catch (error) {
      await this.log(`❌ Opportunity synthesis failed: ${error.message}`);
      return this.generateFallbackOpportunities(category);
    }
  }

  generateFallbackOpportunities(category) {
    return [
      {
        description: `AI-powered automation tool for ${category}`,
        market_size: Math.floor(Math.random() * 100000000),
        implementation_difficulty: Math.floor(Math.random() * 10) + 1,
        revenue_potential: Math.floor(Math.random() * 10) + 1,
        time_to_market: Math.floor(Math.random() * 12) + 3,
        category: category,
        identified_at: new Date(),
        confidence_score: 0.7,
      },
    ];
  }

  calculateConfidenceScore(opportunity, trends, sentiment) {
    let score = 0.5; // Base score

    // Trend momentum boost
    if (trends.momentum === "GROWING") score += 0.2;

    // Sentiment boost
    if (sentiment.overall_sentiment > 0.5) score += 0.1;

    // Market size consideration
    if (opportunity.market_size > 50000000) score += 0.1;

    // Implementation difficulty penalty
    if (opportunity.implementation_difficulty > 7) score -= 0.1;

    return Math.min(1.0, Math.max(0.1, score));
  }

  rankOpportunities(opportunities) {
    return opportunities.sort((a, b) => {
      const scoreA = this.calculateOpportunityScore(a);
      const scoreB = this.calculateOpportunityScore(b);
      return scoreB - scoreA;
    });
  }

  calculateOpportunityScore(opportunity) {
    const marketSizeScore = Math.min(10, opportunity.market_size / 10000000); // Normalize to 10
    const revenueScore = opportunity.revenue_potential || 5;
    const difficultyPenalty =
      (11 - (opportunity.implementation_difficulty || 5)) / 10;
    const confidenceBonus = opportunity.confidence_score || 0.5;

    return (
      (marketSizeScore + revenueScore) * difficultyPenalty * confidenceBonus
    );
  }

  async monitorOngoingOpportunities() {
    try {
      await this.log("🔄 MONITORING ONGOING OPPORTUNITIES");

      const activeOpportunities = Array.from(
        this.opportunities.values(),
      ).filter((opp) => opp.status === "ACTIVE" || opp.status === "MONITORING");

      for (const opportunity of activeOpportunities) {
        const updated = await this.updateOpportunityStatus(opportunity);
        this.opportunities.set(opportunity.id, updated);
      }

      await this.log(
        `✅ Monitored ${activeOpportunities.length} opportunities`,
      );
    } catch (error) {
      await this.log(`❌ Opportunity monitoring failed: ${error.message}`);
    }
  }

  async updateOpportunityStatus(opportunity) {
    // Re-analyze the opportunity's market conditions
    const currentTrends = await this.analyzeTrends(opportunity.category);
    const currentSentiment = await this.analyzeSocialSentiment(
      opportunity.category,
    );

    // Update confidence score
    opportunity.confidence_score = this.calculateConfidenceScore(
      opportunity,
      currentTrends,
      currentSentiment,
    );

    // Update status based on new data
    if (opportunity.confidence_score > 0.8) {
      opportunity.status = "HIGH_PRIORITY";
    } else if (opportunity.confidence_score < 0.3) {
      opportunity.status = "LOW_PRIORITY";
    } else {
      opportunity.status = "MONITORING";
    }

    opportunity.last_updated = new Date();
    return opportunity;
  }

  async generateMarketReport(category, timeframe = "monthly") {
    try {
      await this.log(`📊 GENERATING MARKET REPORT for ${category}`);

      const report = {
        id: `report_${Date.now()}_${category}`,
        category: category,
        timeframe: timeframe,
        generated_at: new Date(),
        executive_summary: "",
        key_trends: [],
        opportunities: [],
        threats: [],
        recommendations: [],
      };

      // Gather data
      const trends = this.trends.get(category) || {};
      const competitors = this.competitors.get(category) || {};
      const opportunities = Array.from(this.opportunities.values()).filter(
        (opp) => opp.category === category,
      );

      // Generate executive summary
      report.executive_summary = await this.generateExecutiveSummary(
        category,
        trends,
        competitors,
        opportunities,
      );

      // Extract key insights
      report.key_trends = this.extractKeyTrends(trends);
      report.opportunities = opportunities.slice(0, 5); // Top 5
      report.threats = this.identifyThreats(competitors, trends);
      report.recommendations = await this.generateRecommendations(
        category,
        opportunities,
        trends,
      );

      this.performance_metrics.market_reports_generated++;
      await this.saveMarketReport(report);

      await this.log(`✅ Market report generated: ${report.id}`);
      return report;
    } catch (error) {
      await this.log(`❌ Market report generation failed: ${error.message}`);
      throw error;
    }
  }

  async generateExecutiveSummary(category, trends, competitors, opportunities) {
    const prompt = `Generate an executive summary for the ${category} market based on:
        - Current trends and growth patterns
        - Competitive landscape with ${competitors.market_leaders?.length || 0} major players
        - ${opportunities.length} identified opportunities
        
        Keep it concise (2-3 paragraphs) and focus on actionable insights.`;

    try {
      return await this.callOpenAI(prompt);
    } catch (error) {
      return `The ${category} market shows continued growth with emerging opportunities in automation and AI integration. Current market dynamics suggest strong potential for new entrants focusing on underserved segments.`;
    }
  }

  extractKeyTrends(trends) {
    return [
      "Increased demand for automation",
      "Growing adoption of AI technologies",
      "Shift towards remote-first solutions",
      "Focus on data privacy and security",
    ];
  }

  identifyThreats(competitors, trends) {
    return [
      "Market saturation in premium segment",
      "Increased competition from established players",
      "Regulatory changes affecting market dynamics",
      "Economic uncertainty impacting spending",
    ];
  }

  async generateRecommendations(category, opportunities, trends) {
    const topOpportunities = opportunities.slice(0, 3);

    const recommendations = [
      `Focus on the top opportunity: ${topOpportunities[0]?.description || "Market automation"}`,
      "Invest in AI/ML capabilities to stay competitive",
      "Build strong customer feedback loops",
      "Consider strategic partnerships for faster market entry",
    ];

    return recommendations;
  }

  async callOpenAI(prompt) {
    try {
      if (!this.config.openai_api_key) {
        throw new Error("OpenAI API key not configured");
      }

      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content:
                "You are an expert market research analyst specializing in identifying business opportunities and market trends. Provide data-driven insights and actionable recommendations.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 2000,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.openai_api_key}`,
            "Content-Type": "application/json",
          },
        },
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      await this.log(`❌ OpenAI API call failed: ${error.message}`);
      throw error;
    }
  }

  getCategoryKeywords(category) {
    const keywords = {
      ai_automation: [
        "AI automation",
        "workflow automation",
        "chatGPT",
        "machine learning",
      ],
      digital_services: [
        "digital transformation",
        "cloud services",
        "SaaS",
        "remote work",
      ],
      trading_finance: [
        "algorithmic trading",
        "fintech",
        "crypto trading",
        "investment tools",
      ],
    };

    return keywords[category] || ["business automation", "digital tools"];
  }

  generateMockTrendData() {
    const data = [];
    for (let i = 0; i < 12; i++) {
      data.push({
        month: i + 1,
        interest: Math.floor(Math.random() * 100),
      });
    }
    return data;
  }

  generateRelatedQueries(keyword) {
    return [
      `${keyword} tools`,
      `${keyword} software`,
      `${keyword} services`,
      `${keyword} platform`,
    ];
  }

  generateGeoData() {
    return {
      "United States": Math.floor(Math.random() * 100),
      "United Kingdom": Math.floor(Math.random() * 80),
      Canada: Math.floor(Math.random() * 60),
      Australia: Math.floor(Math.random() * 50),
    };
  }

  prioritizeGaps(gaps) {
    return gaps.sort((a, b) => {
      const scoreA = (a.opportunity_size || 0) * (1 - (a.difficulty || 0.5));
      const scoreB = (b.opportunity_size || 0) * (1 - (b.difficulty || 0.5));
      return scoreB - scoreA;
    });
  }

  async analyzeTrendPatterns(trends, category) {
    // Analyze trend momentum and growth patterns
    return {
      momentum: Math.random() > 0.6 ? "GROWING" : "STABLE",
      growth_rate: Math.random() * 0.5, // 0-50% growth
      confidence: Math.random(),
      key_drivers: [
        "Market demand",
        "Technology advancement",
        "Economic factors",
      ],
    };
  }

  async loadHistoricalData() {
    try {
      const dataFile = path.join(__dirname, "../data/opportunity_data.json");
      const data = await fs.readFile(dataFile, "utf8");
      const historicalData = JSON.parse(data);

      historicalData.opportunities?.forEach((opp) => {
        this.opportunities.set(opp.id, opp);
      });

      historicalData.trends?.forEach((trend) => {
        this.trends.set(trend.category, trend);
      });

      this.performance_metrics = {
        ...this.performance_metrics,
        ...historicalData.metrics,
      };
    } catch (error) {
      await this.log(`📁 Creating new opportunity data file`);
    }
  }

  async saveOpportunities(opportunities) {
    try {
      opportunities.forEach((opp) => {
        const id = `opp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.opportunities.set(id, { ...opp, id, status: "ACTIVE" });
      });

      await this.saveData();
    } catch (error) {
      await this.log(`❌ Failed to save opportunities: ${error.message}`);
    }
  }

  async saveMarketReport(report) {
    try {
      const reportsDir = path.join(__dirname, "../reports");
      await fs.mkdir(reportsDir, { recursive: true });

      const filename = `${report.id}.json`;
      const filepath = path.join(reportsDir, filename);

      await fs.writeFile(filepath, JSON.stringify(report, null, 2));
      await this.log(`💾 Market report saved: ${filepath}`);
    } catch (error) {
      await this.log(`❌ Failed to save market report: ${error.message}`);
    }
  }

  async saveData() {
    try {
      const dataFile = path.join(__dirname, "../data/opportunity_data.json");
      const data = {
        opportunities: Array.from(this.opportunities.values()),
        trends: Array.from(this.trends.values()),
        competitors: Array.from(this.competitors.values()),
        metrics: this.performance_metrics,
        last_updated: new Date(),
      };

      await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      await this.log(`❌ Failed to save data: ${error.message}`);
    }
  }

  async getPerformanceReport() {
    const report = {
      agent_status: this.status,
      performance_metrics: this.performance_metrics,
      active_opportunities: Array.from(this.opportunities.values()).filter(
        (o) => o.status === "ACTIVE",
      ).length,
      trending_categories: this.getTrendingCategories(),
      top_opportunities: this.getTopOpportunities(5),
      recent_activity: this.getRecentActivity(),
    };

    await this.log(`📊 Performance report generated`);
    return report;
  }

  getTrendingCategories() {
    return Array.from(this.trends.entries())
      .sort(
        (a, b) =>
          (b[1].analysis?.growth_rate || 0) - (a[1].analysis?.growth_rate || 0),
      )
      .slice(0, 3)
      .map(([category, data]) => ({
        category,
        growth_rate: data.analysis?.growth_rate || 0,
        momentum: data.analysis?.momentum || "STABLE",
      }));
  }

  getTopOpportunities(limit = 5) {
    return Array.from(this.opportunities.values())
      .sort(
        (a, b) =>
          this.calculateOpportunityScore(b) - this.calculateOpportunityScore(a),
      )
      .slice(0, limit)
      .map((opp) => ({
        description: opp.description,
        category: opp.category,
        confidence_score: opp.confidence_score,
        market_size: opp.market_size,
      }));
  }

  getRecentActivity() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return Array.from(this.opportunities.values())
      .filter((opp) => new Date(opp.identified_at) > dayAgo)
      .map((opp) => ({
        action: "Opportunity identified",
        category: opp.category,
        timestamp: opp.identified_at,
      }));
  }
}

module.exports = OpportunityScoutAgent;

// Auto-start if run directly
if (require.main === module) {
  const agent = new OpportunityScoutAgent();

  // Example usage
  setTimeout(async () => {
    try {
      // Scan for opportunities
      const opportunities = await agent.scanForOpportunities([
        "ai_automation",
        "digital_services",
      ]);
      console.log(`🔍 Found ${opportunities.length} opportunities`);

      // Generate market report
      const report = await agent.generateMarketReport("ai_automation");
      console.log(`📊 Generated market report: ${report.id}`);

      // Get performance report
      const performanceReport = await agent.getPerformanceReport();
      console.log(
        "📈 OPPORTUNITY SCOUT REPORT:",
        JSON.stringify(performanceReport, null, 2),
      );
    } catch (error) {
      console.error("❌ Agent execution failed:", error);
    }
  }, 1000);
}
