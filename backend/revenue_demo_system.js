require("dotenv").config();
const express = require("express");
const fs = require("fs").promises;

class RevenueDemoSystem {
  constructor() {
    this.app = express();
    this.port = 3016;
    this.setupMiddleware();
    this.setupRoutes();

    // Revenue tracking
    this.revenueStreams = {
      resume_services: { total: 0, monthly: 0, orders: 0 },
      job_matching_premium: { total: 0, monthly: 0, subscribers: 0 },
      linkedin_optimization: { total: 0, monthly: 0, clients: 0 },
      company_hiring_solutions: { total: 0, monthly: 0, companies: 0 },
      ai_insights_api: { total: 0, monthly: 0, api_calls: 0 },
      recruiter_access: { total: 0, monthly: 0, recruiters: 0 },
    };

    // Demo scenarios
    this.demoScenarios = [];
    this.initializeDemoData();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept",
      );
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      next();
    });
  }

  setupRoutes() {
    // Revenue Demo Dashboard
    this.app.get("/", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(this.getRevenueDemoHTML());
    });

    // Demo: Customer Journey
    this.app.post("/api/demo/customer-journey", async (req, res) => {
      try {
        const { customer_type } = req.body;
        const journey = await this.simulateCustomerJourney(customer_type);
        res.json(journey);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Demo: AI Matching in Action
    this.app.post("/api/demo/ai-matching", async (req, res) => {
      try {
        const matching = await this.demoAIMatching();
        res.json(matching);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Revenue Calculator
    this.app.post("/api/demo/revenue-projection", async (req, res) => {
      try {
        const { scenario } = req.body;
        const projection = await this.calculateRevenueProjection(scenario);
        res.json(projection);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Live Revenue Dashboard
    this.app.get("/api/demo/live-revenue", async (req, res) => {
      try {
        const liveRevenue = await this.getLiveRevenueDashboard();
        res.json(liveRevenue);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Demo: LinkedIn Integration Power
    this.app.get("/api/demo/linkedin-power", async (req, res) => {
      try {
        const demo = await this.demoLinkedInPower();
        res.json(demo);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  async simulateCustomerJourney(customerType) {
    const journeys = {
      job_seeker: {
        step1: "🔍 Visits platform looking for better job opportunities",
        step2: "📝 Uploads current resume + fills profile (CV upload feature)",
        step3: "💳 Pays $99 for Professional Resume + LinkedIn optimization",
        step4: "🤖 AI analyzes profile, scrapes LinkedIn for perfect matches",
        step5: "📧 Receives optimized resume + 10 targeted job matches",
        step6: "🎯 Gets interviews, lands job with 25% salary increase",
        revenue_generated: 99,
        customer_lifetime_value: 350, // Repeat services, referrals
        success_story: "Sarah lands $140K job (was $110K) - 27% increase!",
      },

      company_hr: {
        step1: "🏢 HR team struggling to find qualified candidates",
        step2: "💼 Signs up for Company Hiring Solution ($500/month)",
        step3: "🎯 AI scrapes LinkedIn, finds perfect candidates automatically",
        step4: "📊 Gets ranked candidates with AI match scores",
        step5: "⚡ Reduces hiring time from 8 weeks to 2 weeks",
        step6: "💰 Saves $50K per hire in recruiting costs",
        revenue_generated: 6000, // Annual contract
        customer_lifetime_value: 18000, // 3-year retention
        success_story: "TechCorp fills 5 positions in 2 weeks vs 2 months!",
      },

      recruiter: {
        step1: "👔 Recruiter needs access to premium candidate database",
        step2: "💎 Subscribes to Recruiter Pro Access ($200/month)",
        step3: "🔍 Uses AI-powered search across all candidates",
        step4: "📈 Gets LinkedIn insights + salary intelligence",
        step5: "🎯 Places candidates 3x faster than competitors",
        step6: "💸 Increases placement fees by 40%",
        revenue_generated: 2400, // Annual
        customer_lifetime_value: 7200, // 3-year retention
        success_story: "RecruiterPro places 15 candidates/month vs 5!",
      },
    };

    const journey = journeys[customerType];

    // Simulate revenue
    this.addRevenue("job_matching_premium", journey.revenue_generated);

    return {
      customer_type: customerType,
      journey: journey,
      real_time_metrics: {
        processing_time: "2.3 seconds",
        ai_confidence: "94%",
        match_accuracy: "89%",
      },
    };
  }

  async demoAIMatching() {
    // Simulate live AI matching
    const candidateProfile = {
      name: "Alex Johnson",
      experience: "5 years",
      skills: ["JavaScript", "React", "Node.js", "AWS"],
      current_salary: 95000,
      location: "Austin, TX",
    };

    const jobOpportunities = [
      {
        title: "Senior Full Stack Developer",
        company: "TechStartup Inc",
        salary: "$120K - $140K",
        location: "Austin, TX (Remote OK)",
        ai_match_score: 94,
        why_perfect: [
          "100% skills match with JavaScript/React",
          "Experience level perfectly aligned",
          "Salary increase of 32%",
          "Local company, remote-friendly",
        ],
      },
      {
        title: "Lead Frontend Engineer",
        company: "Growth Corp",
        salary: "$130K - $155K",
        location: "Remote",
        ai_match_score: 87,
        why_perfect: [
          "Strong React expertise match",
          "Leadership growth opportunity",
          "45% salary increase potential",
          "Fully remote position",
        ],
      },
    ];

    // Simulate LinkedIn data enrichment
    const linkedinInsights = {
      company_growth: "TechStartup Inc: 40% headcount growth",
      hiring_urgency: "Actively hiring (5 similar roles posted this week)",
      insider_tips: "Company values React expertise highly",
      success_probability: "89% based on similar profiles",
    };

    return {
      candidate: candidateProfile,
      matches_found: jobOpportunities.length,
      top_matches: jobOpportunities,
      linkedin_intelligence: linkedinInsights,
      ai_processing: {
        algorithms_used: 5,
        data_points_analyzed: 247,
        processing_time: "1.8 seconds",
        confidence_level: "94%",
      },
      revenue_opportunity: {
        candidate_pays: "$99 for premium matching",
        company_pays: "$500 for candidate access",
        recruiter_pays: "$200 for insights",
        total_per_match: 799,
      },
    };
  }

  async calculateRevenueProjection(scenario) {
    const scenarios = {
      conservative: {
        monthly_customers: {
          job_seekers: 500,
          companies: 10,
          recruiters: 25,
        },
        pricing: {
          avg_resume_order: 79,
          company_subscription: 500,
          recruiter_subscription: 200,
        },
      },

      realistic: {
        monthly_customers: {
          job_seekers: 2000,
          companies: 50,
          recruiters: 100,
        },
        pricing: {
          avg_resume_order: 99,
          company_subscription: 750,
          recruiter_subscription: 300,
        },
      },

      aggressive: {
        monthly_customers: {
          job_seekers: 8000,
          companies: 200,
          recruiters: 400,
        },
        pricing: {
          avg_resume_order: 129,
          company_subscription: 1000,
          recruiter_subscription: 500,
        },
      },
    };

    const data = scenarios[scenario];

    const monthlyRevenue = {
      resume_services:
        data.monthly_customers.job_seekers * data.pricing.avg_resume_order,
      company_subscriptions:
        data.monthly_customers.companies * data.pricing.company_subscription,
      recruiter_subscriptions:
        data.monthly_customers.recruiters * data.pricing.recruiter_subscription,
      linkedin_api_premium: data.monthly_customers.job_seekers * 0.3 * 29, // 30% upgrade to premium
      ai_insights_api: data.monthly_customers.companies * 200, // API access
    };

    const total_monthly = Object.values(monthlyRevenue).reduce(
      (a, b) => a + b,
      0,
    );
    const annual_revenue = total_monthly * 12;

    return {
      scenario: scenario.toUpperCase(),
      monthly_breakdown: monthlyRevenue,
      totals: {
        monthly_revenue: total_monthly,
        annual_revenue: annual_revenue,
        monthly_profit: Math.round(total_monthly * 0.75), // 75% margin
        annual_profit: Math.round(annual_revenue * 0.75),
      },
      growth_metrics: {
        customers_served: Object.values(data.monthly_customers).reduce(
          (a, b) => a + b,
          0,
        ),
        market_penetration: "0.1% of addressable market",
        break_even_point: "Month 3",
        path_to_50k_monthly: scenario === "aggressive" ? "Month 6" : "Month 12",
      },
    };
  }

  async getLiveRevenueDashboard() {
    // Simulate live revenue tracking
    const currentMonth = new Date().toLocaleString("default", {
      month: "long",
    });

    // Simulate real-time transactions
    this.simulateTransactions();

    return {
      current_month: currentMonth,
      real_time_revenue: this.revenueStreams,
      today_highlights: {
        revenue_today: 2847,
        new_customers: 23,
        ai_matches_made: 156,
        linkedin_jobs_scraped: 2340,
      },
      trending_up: {
        linkedin_optimization: "+45% this week",
        company_subscriptions: "+23% this month",
        ai_accuracy: "+12% improvement",
        customer_satisfaction: "94% (up from 87%)",
      },
      key_metrics: {
        customer_acquisition_cost: 15,
        lifetime_value: 350,
        churn_rate: "2.1% (industry avg: 8%)",
        viral_coefficient: "1.3 (organic growth)",
      },
    };
  }

  async demoLinkedInPower() {
    return {
      linkedin_advantage: {
        data_access: "Real-time job postings from 50M+ companies",
        api_disruption: "LinkedIn restricting access = huge opportunity",
        competitive_moat: "First-mover advantage in post-API world",
        data_quality: "Fresh, accurate job data vs stale job boards",
      },

      ai_superiority: {
        matching_algorithms: "5 AI models vs competitors' basic filters",
        learning_capability: "Gets smarter with every interaction",
        accuracy_rate: "89% vs industry average 45%",
        processing_speed: "Real-time vs 24-48 hour delays",
      },

      revenue_multipliers: {
        premium_insights: "LinkedIn company data = 3x pricing power",
        recruiter_goldmine: "Salary intelligence = $500/month subscriptions",
        api_licensing: "Sell refined data to other platforms",
        enterprise_sales: "Fortune 500 willing to pay $10K+ monthly",
      },

      market_timing: {
        linkedin_changes: "Perfect disruption window",
        remote_work_boom: "300% increase in job search activity",
        ai_adoption: "Businesses desperately need AI solutions",
        economic_uncertainty: "People changing jobs more frequently",
      },

      path_to_50k_monthly: {
        month_1: "Launch with basic services ($5K revenue)",
        month_3: "Add LinkedIn integration ($15K revenue)",
        month_6: "Company subscriptions ($30K revenue)",
        month_9: "Enterprise + API licensing ($50K+ revenue)",
        month_12: "Market leader ($100K+ revenue)",
      },
    };
  }

  simulateTransactions() {
    // Add some demo revenue
    this.addRevenue("resume_services", 99);
    this.addRevenue("job_matching_premium", 29);
    this.addRevenue("company_hiring_solutions", 500);
  }

  addRevenue(stream, amount) {
    if (this.revenueStreams[stream]) {
      this.revenueStreams[stream].total += amount;
      this.revenueStreams[stream].monthly += amount;

      // Update counters
      if (stream === "resume_services") this.revenueStreams[stream].orders++;
      if (stream === "job_matching_premium")
        this.revenueStreams[stream].subscribers++;
      if (stream === "company_hiring_solutions")
        this.revenueStreams[stream].companies++;
    }
  }

  initializeDemoData() {
    // Initialize with some demo revenue
    this.revenueStreams.resume_services.total = 15750;
    this.revenueStreams.resume_services.monthly = 8420;
    this.revenueStreams.resume_services.orders = 89;

    this.revenueStreams.job_matching_premium.total = 4680;
    this.revenueStreams.job_matching_premium.monthly = 2890;
    this.revenueStreams.job_matching_premium.subscribers = 156;

    this.revenueStreams.company_hiring_solutions.total = 12000;
    this.revenueStreams.company_hiring_solutions.monthly = 8500;
    this.revenueStreams.company_hiring_solutions.companies = 17;
  }

  getRevenueDemoHTML() {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>💰 AI Job Matching Revenue Demo</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: white; margin: 0; padding: 20px; }
                .container { max-width: 1200px; margin: 0 auto; }
                .header { text-align: center; margin-bottom: 40px; }
                .revenue-card { background: rgba(30, 41, 59, 0.8); border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid rgba(71, 85, 105, 0.3); }
                .demo-button { background: linear-gradient(135deg, #22c55e, #16a34a); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin: 10px; font-size: 16px; }
                .demo-button:hover { transform: translateY(-2px); transition: transform 0.2s; }
                .revenue-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
                .metric { background: rgba(34, 197, 94, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #22c55e; }
                .demo-result { background: rgba(59, 130, 246, 0.1); padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid rgba(59, 130, 246, 0.3); }
                .profit-highlight { font-size: 24px; color: #22c55e; font-weight: bold; }
                .step { background: rgba(71, 85, 105, 0.2); padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #3b82f6; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>💰 AI Job Matching Platform - Revenue Demo</h1>
                    <p style="color: #94a3b8; font-size: 18px;">See exactly how your AI platform generates $50K+ monthly revenue</p>
                </div>

                <div class="revenue-grid">
                    <div class="revenue-card">
                        <h3>🎯 Customer Journey Simulator</h3>
                        <p>Watch how different customer types generate revenue:</p>
                        <button class="demo-button" onclick="simulateJourney('job_seeker')">Job Seeker Journey</button>
                        <button class="demo-button" onclick="simulateJourney('company_hr')">Company HR Journey</button>
                        <button class="demo-button" onclick="simulateJourney('recruiter')">Recruiter Journey</button>
                        <div id="journey-result"></div>
                    </div>

                    <div class="revenue-card">
                        <h3>🤖 AI Matching Demo</h3>
                        <p>See the AI matching system in action:</p>
                        <button class="demo-button" onclick="demoAIMatching()">Run AI Matching Demo</button>
                        <div id="ai-demo-result"></div>
                    </div>
                </div>

                <div class="revenue-card">
                    <h3>📊 Revenue Projections</h3>
                    <p>Calculate revenue potential based on different growth scenarios:</p>
                    <button class="demo-button" onclick="calculateRevenue('conservative')">Conservative ($25K/month)</button>
                    <button class="demo-button" onclick="calculateRevenue('realistic')">Realistic ($50K/month)</button>
                    <button class="demo-button" onclick="calculateRevenue('aggressive')">Aggressive ($100K+/month)</button>
                    <div id="revenue-projection"></div>
                </div>

                <div class="revenue-card">
                    <h3>📈 Live Revenue Dashboard</h3>
                    <button class="demo-button" onclick="loadLiveRevenue()">Show Live Revenue</button>
                    <div id="live-revenue"></div>
                </div>

                <div class="revenue-card">
                    <h3>🔗 LinkedIn Integration Power</h3>
                    <button class="demo-button" onclick="showLinkedInPower()">Why LinkedIn = $$$</button>
                    <div id="linkedin-power"></div>
                </div>
            </div>

            <script>
                async function simulateJourney(customerType) {
                    const response = await fetch('/api/demo/customer-journey', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ customer_type: customerType })
                    });
                    const data = await response.json();
                    
                    document.getElementById('journey-result').innerHTML = \`
                        <div class="demo-result">
                            <h4>\${customerType.toUpperCase()} JOURNEY</h4>
                            <div class="step">Step 1: \${data.journey.step1}</div>
                            <div class="step">Step 2: \${data.journey.step2}</div>
                            <div class="step">Step 3: \${data.journey.step3}</div>
                            <div class="step">Step 4: \${data.journey.step4}</div>
                            <div class="step">Step 5: \${data.journey.step5}</div>
                            <div class="step">Step 6: \${data.journey.step6}</div>
                            <div class="metric">
                                <div class="profit-highlight">Revenue: $\${data.journey.revenue_generated}</div>
                                <div>Lifetime Value: $\${data.journey.customer_lifetime_value}</div>
                                <div>Success: \${data.journey.success_story}</div>
                            </div>
                        </div>
                    \`;
                }

                async function demoAIMatching() {
                    const response = await fetch('/api/demo/ai-matching', { method: 'POST' });
                    const data = await response.json();
                    
                    document.getElementById('ai-demo-result').innerHTML = \`
                        <div class="demo-result">
                            <h4>🎯 AI MATCHING IN ACTION</h4>
                            <p><strong>Candidate:</strong> \${data.candidate.name} - \${data.candidate.experience} experience</p>
                            <p><strong>Skills:</strong> \${data.candidate.skills.join(', ')}</p>
                            <p><strong>Matches Found:</strong> \${data.matches_found} perfect opportunities</p>
                            
                            <div class="metric">
                                <h5>Top Match: \${data.top_matches[0].title}</h5>
                                <p><strong>Company:</strong> \${data.top_matches[0].company}</p>
                                <p><strong>Salary:</strong> \${data.top_matches[0].salary}</p>
                                <p><strong>AI Match Score:</strong> \${data.top_matches[0].ai_match_score}%</p>
                                <p><strong>Why Perfect:</strong> \${data.top_matches[0].why_perfect.join(', ')}</p>
                            </div>
                            
                            <div class="metric">
                                <div class="profit-highlight">Revenue Per Match: $\${data.revenue_opportunity.total_per_match}</div>
                                <div>Processing Time: \${data.ai_processing.processing_time}</div>
                                <div>AI Confidence: \${data.ai_processing.confidence_level}</div>
                            </div>
                        </div>
                    \`;
                }

                async function calculateRevenue(scenario) {
                    const response = await fetch('/api/demo/revenue-projection', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scenario })
                    });
                    const data = await response.json();
                    
                    document.getElementById('revenue-projection').innerHTML = \`
                        <div class="demo-result">
                            <h4>\${data.scenario} SCENARIO</h4>
                            <div class="profit-highlight">Monthly Revenue: $\${data.totals.monthly_revenue.toLocaleString()}</div>
                            <div class="profit-highlight">Annual Revenue: $\${data.totals.annual_revenue.toLocaleString()}</div>
                            <div class="profit-highlight">Monthly Profit: $\${data.totals.monthly_profit.toLocaleString()}</div>
                            
                            <h5>Revenue Breakdown:</h5>
                            <div class="metric">Resume Services: $\${data.monthly_breakdown.resume_services.toLocaleString()}</div>
                            <div class="metric">Company Subscriptions: $\${data.monthly_breakdown.company_subscriptions.toLocaleString()}</div>
                            <div class="metric">Recruiter Subscriptions: $\${data.monthly_breakdown.recruiter_subscriptions.toLocaleString()}</div>
                            <div class="metric">LinkedIn Premium: $\${data.monthly_breakdown.linkedin_api_premium.toLocaleString()}</div>
                            
                            <p><strong>Path to $50K Monthly:</strong> \${data.growth_metrics.path_to_50k_monthly}</p>
                        </div>
                    \`;
                }

                async function loadLiveRevenue() {
                    const response = await fetch('/api/demo/live-revenue');
                    const data = await response.json();
                    
                    document.getElementById('live-revenue').innerHTML = \`
                        <div class="demo-result">
                            <h4>📊 LIVE REVENUE DASHBOARD</h4>
                            <div class="profit-highlight">Today's Revenue: $\${data.today_highlights.revenue_today.toLocaleString()}</div>
                            
                            <div class="revenue-grid">
                                <div class="metric">
                                    <h5>Resume Services</h5>
                                    <p>Monthly: $\${data.real_time_revenue.resume_services.monthly.toLocaleString()}</p>
                                    <p>Orders: \${data.real_time_revenue.resume_services.orders}</p>
                                </div>
                                <div class="metric">
                                    <h5>Company Solutions</h5>
                                    <p>Monthly: $\${data.real_time_revenue.company_hiring_solutions.monthly.toLocaleString()}</p>
                                    <p>Companies: \${data.real_time_revenue.company_hiring_solutions.companies}</p>
                                </div>
                            </div>
                            
                            <h5>Growing Fast:</h5>
                            <p>• LinkedIn optimization: \${data.trending_up.linkedin_optimization}</p>
                            <p>• Company subscriptions: \${data.trending_up.company_subscriptions}</p>
                            <p>• AI accuracy: \${data.trending_up.ai_accuracy}</p>
                        </div>
                    \`;
                }

                async function showLinkedInPower() {
                    const response = await fetch('/api/demo/linkedin-power');
                    const data = await response.json();
                    
                    document.getElementById('linkedin-power').innerHTML = \`
                        <div class="demo-result">
                            <h4>🔗 LINKEDIN = REVENUE GOLDMINE</h4>
                            
                            <div class="metric">
                                <h5>Why LinkedIn Integration = $$$</h5>
                                <p>• \${data.linkedin_advantage.data_access}</p>
                                <p>• \${data.linkedin_advantage.api_disruption}</p>
                                <p>• \${data.linkedin_advantage.competitive_moat}</p>
                            </div>
                            
                            <div class="metric">
                                <h5>AI Superiority</h5>
                                <p>• \${data.ai_superiority.matching_algorithms}</p>
                                <p>• \${data.ai_superiority.accuracy_rate}</p>
                                <p>• \${data.ai_superiority.learning_capability}</p>
                            </div>
                            
                            <div class="metric">
                                <h5>Path to $50K Monthly</h5>
                                <p>• Month 1: \${data.path_to_50k_monthly.month_1}</p>
                                <p>• Month 3: \${data.path_to_50k_monthly.month_3}</p>
                                <p>• Month 6: \${data.path_to_50k_monthly.month_6}</p>
                                <p>• Month 9: \${data.path_to_50k_monthly.month_9}</p>
                                <div class="profit-highlight">Month 12: \${data.path_to_50k_monthly.month_12}</div>
                            </div>
                        </div>
                    \`;
                }
            </script>
        </body>
        </html>
        `;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`💰 Revenue Demo System running on port ${this.port}`);
      console.log(`🔗 http://localhost:${this.port}`);
      console.log("💸 Interactive revenue demonstration ready!\n");
    });
  }
}

// Start Revenue Demo System
if (require.main === module) {
  const revenueDemo = new RevenueDemoSystem();
  revenueDemo.start();
}

module.exports = RevenueDemoSystem;
