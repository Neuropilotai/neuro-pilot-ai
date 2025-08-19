const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");

class ProductGeneratorAgent {
  constructor() {
    this.name = "NEURO-PRODUCT-GENERATOR-AGENT";
    this.version = "1.0.0";
    this.status = "ACTIVE";
    this.capabilities = [
      "digital_product_creation",
      "template_generation",
      "content_automation",
      "custom_product_design",
      "bulk_generation",
      "quality_assurance",
    ];

    this.config = {
      openai_api_key: process.env.OPENAI_API_KEY,
      canva_api_key: process.env.CANVA_API_KEY,
      notion_api_key: process.env.NOTION_API_KEY,
    };

    this.product_templates = new Map();
    this.generation_queue = [];
    this.completed_products = [];

    this.performance_metrics = {
      products_generated: 0,
      templates_created: 0,
      total_revenue_generated: 0,
      average_generation_time: 0,
      quality_score: 95,
    };

    this.logFile = path.join(__dirname, "../logs/product_generator_agent.log");
    this.init();
  }

  async init() {
    await this.log("🚀 NEURO-PRODUCT-GENERATOR-AGENT v1.0.0 INITIALIZING...");
    await this.loadProductTemplates();
    await this.log("✅ Product Generator Agent READY FOR AUTOMATED CREATION");
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

  async generateProduct(productType, specifications, quantity = 1) {
    try {
      const startTime = Date.now();
      await this.log(`🎨 GENERATING ${quantity}x ${productType} products`);

      const products = [];

      for (let i = 0; i < quantity; i++) {
        const product = await this.createSingleProduct(
          productType,
          specifications,
          i + 1,
        );
        products.push(product);

        await this.log(
          `✅ Product ${i + 1}/${quantity} completed: ${product.title}`,
        );
      }

      const generationTime = Date.now() - startTime;
      await this.updateMetrics(products.length, generationTime);

      await this.log(
        `🎉 BATCH COMPLETE: Generated ${products.length} products in ${generationTime}ms`,
      );
      return products;
    } catch (error) {
      await this.log(`❌ Product generation failed: ${error.message}`);
      throw error;
    }
  }

  async createSingleProduct(productType, specifications, sequenceNumber) {
    const product = {
      id: `${productType}_${Date.now()}_${sequenceNumber}`,
      type: productType,
      title: "",
      content: {},
      specifications: specifications,
      created_at: new Date(),
      status: "GENERATING",
      quality_score: 0,
      metadata: {
        sequence: sequenceNumber,
        generation_method: "ai_automated",
      },
    };

    try {
      switch (productType.toLowerCase()) {
        case "resume":
          product.content = await this.generateResume(specifications);
          break;
        case "cover_letter":
          product.content = await this.generateCoverLetter(specifications);
          break;
        case "business_plan":
          product.content = await this.generateBusinessPlan(specifications);
          break;
        case "marketing_template":
          product.content =
            await this.generateMarketingTemplate(specifications);
          break;
        case "trading_strategy":
          product.content = await this.generateTradingStrategy(specifications);
          break;
        case "ai_prompt_template":
          product.content = await this.generatePromptTemplate(specifications);
          break;
        case "website_copy":
          product.content = await this.generateWebsiteCopy(specifications);
          break;
        case "email_sequence":
          product.content = await this.generateEmailSequence(specifications);
          break;
        case "social_media_kit":
          product.content = await this.generateSocialMediaKit(specifications);
          break;
        default:
          product.content = await this.generateGenericProduct(
            productType,
            specifications,
          );
      }

      product.title =
        product.content.title ||
        `${productType} - ${specifications.industry || "Professional"}`;
      product.status = "COMPLETED";
      product.quality_score = await this.assessQuality(product);

      this.completed_products.push(product);
      await this.saveProduct(product);

      return product;
    } catch (error) {
      product.status = "FAILED";
      product.error = error.message;
      await this.log(`❌ Product creation failed: ${error.message}`);
      return product;
    }
  }

  async generateResume(specs) {
    const prompt = `Create a professional resume with the following specifications:
        Name: ${specs.name || "Professional Candidate"}
        Industry: ${specs.industry || "Technology"}
        Experience Level: ${specs.experience_level || "Mid-level"}
        Target Role: ${specs.target_role || "Senior Position"}
        Skills: ${specs.skills || "AI, Machine Learning, Data Analysis"}
        Education: ${specs.education || "Bachelor's Degree"}
        Location: ${specs.location || "Remote"}
        
        Generate a complete resume including:
        - Professional summary (3-4 lines)
        - Work experience (3-4 positions with bullet points)
        - Education section
        - Skills section (technical and soft skills)
        - Achievements/certifications
        - Contact information template
        
        Format as structured JSON with sections.`;

    const content = await this.callOpenAI(prompt);
    return JSON.parse(content);
  }

  async generateCoverLetter(specs) {
    const prompt = `Create a compelling cover letter for:
        Company: ${specs.company || "Target Company"}
        Position: ${specs.position || "Professional Role"}
        Industry: ${specs.industry || "Technology"}
        Candidate Background: ${specs.background || "Experienced professional"}
        Key Selling Points: ${specs.selling_points || "AI expertise, leadership, results-driven"}
        
        Generate:
        - Opening paragraph (hook + position interest)
        - Body paragraphs (2-3 with specific achievements)
        - Closing paragraph (call to action)
        - Professional tone throughout
        
        Format as structured JSON with sections.`;

    const content = await this.callOpenAI(prompt);
    return JSON.parse(content);
  }

  async generateBusinessPlan(specs) {
    const prompt = `Create a comprehensive business plan for:
        Business Type: ${specs.business_type || "AI Services Company"}
        Industry: ${specs.industry || "Technology"}
        Target Market: ${specs.target_market || "Small to medium businesses"}
        Budget: ${specs.budget || "$10,000 - $50,000"}
        Timeline: ${specs.timeline || "6-12 months"}
        
        Include:
        - Executive Summary
        - Market Analysis
        - Product/Service Description
        - Marketing Strategy
        - Financial Projections
        - Risk Analysis
        - Implementation Timeline
        
        Format as detailed JSON structure.`;

    const content = await this.callOpenAI(prompt);
    return JSON.parse(content);
  }

  async generateMarketingTemplate(specs) {
    const prompt = `Create marketing templates for:
        Product/Service: ${specs.product || "AI Trading Services"}
        Target Audience: ${specs.audience || "Business professionals"}
        Platform: ${specs.platform || "Multi-platform"}
        Goal: ${specs.goal || "Lead generation"}
        
        Generate:
        - Email marketing templates (5 variations)
        - Social media post templates (10 variations)
        - Ad copy templates (Facebook, Google, LinkedIn)
        - Landing page copy template
        - Call-to-action variations
        
        Format as structured JSON with categories.`;

    const content = await this.callOpenAI(prompt);
    return JSON.parse(content);
  }

  async generateTradingStrategy(specs) {
    const prompt = `Create a trading strategy document for:
        Market: ${specs.market || "Forex/Crypto"}
        Risk Level: ${specs.risk_level || "Medium"}
        Capital: ${specs.capital || "$1,000 - $10,000"}
        Time Frame: ${specs.timeframe || "Daily"}
        Experience: ${specs.experience || "Intermediate"}
        
        Include:
        - Strategy Overview
        - Entry/Exit Rules
        - Risk Management Guidelines
        - Technical Indicators Used
        - Backtesting Parameters
        - Performance Expectations
        - Implementation Guide
        
        Format as comprehensive JSON structure.`;

    const content = await this.callOpenAI(prompt);
    return JSON.parse(content);
  }

  async generatePromptTemplate(specs) {
    const prompt = `Create AI prompt templates for:
        Use Case: ${specs.use_case || "Business automation"}
        AI Model: ${specs.ai_model || "GPT-4"}
        Industry: ${specs.industry || "General business"}
        Complexity: ${specs.complexity || "Professional"}
        
        Generate:
        - System prompts (5 variations)
        - User prompt templates (10 variations)
        - Chain-of-thought prompts
        - Few-shot examples
        - Optimization guidelines
        
        Format as structured JSON with categories and examples.`;

    const content = await this.callOpenAI(prompt);
    return JSON.parse(content);
  }

  async generateWebsiteCopy(specs) {
    const prompt = `Create website copy for:
        Business: ${specs.business || "AI Services Company"}
        Industry: ${specs.industry || "Technology"}
        Target Audience: ${specs.audience || "Business professionals"}
        Unique Value Prop: ${specs.value_prop || "AI-powered automation"}
        
        Generate:
        - Homepage hero section
        - About us page
        - Services/Products pages
        - Contact page
        - FAQ section
        - Testimonials template
        - SEO-optimized content
        
        Format as structured JSON with page sections.`;

    const content = await this.callOpenAI(prompt);
    return JSON.parse(content);
  }

  async generateEmailSequence(specs) {
    const prompt = `Create email sequence for:
        Product/Service: ${specs.product || "AI Trading Signals"}
        Audience: ${specs.audience || "Business professionals"}
        Goal: ${specs.goal || "Customer onboarding"}
        Sequence Length: ${specs.length || "7 emails"}
        
        Generate:
        - Welcome email
        - Value-driven content emails
        - Social proof emails
        - Product education emails
        - Conversion-focused emails
        - Retention emails
        - Subject lines for each
        
        Format as structured JSON sequence.`;

    const content = await this.callOpenAI(prompt);
    return JSON.parse(content);
  }

  async generateSocialMediaKit(specs) {
    const prompt = `Create social media kit for:
        Brand: ${specs.brand || "AI Services Company"}
        Industry: ${specs.industry || "Technology"}
        Platforms: ${specs.platforms || "LinkedIn, Twitter, Facebook"}
        Content Style: ${specs.style || "Professional, informative"}
        
        Generate:
        - 30 social media post templates
        - Hashtag collections by topic
        - Content calendar template
        - Engagement templates
        - Story templates
        - Video script templates
        
        Format as comprehensive JSON kit.`;

    const content = await this.callOpenAI(prompt);
    return JSON.parse(content);
  }

  async generateGenericProduct(productType, specs) {
    const prompt = `Create a ${productType} with these specifications:
        ${JSON.stringify(specs, null, 2)}
        
        Provide comprehensive, professional content that delivers value to the end user.
        Format as structured JSON with clear sections and actionable content.`;

    const content = await this.callOpenAI(prompt);
    return JSON.parse(content);
  }

  async assessQuality(product) {
    try {
      const qualityPrompt = `Assess the quality of this ${product.type} on a scale of 1-100:
            ${JSON.stringify(product.content, null, 2)}
            
            Evaluate:
            - Completeness (25 points)
            - Professional quality (25 points)
            - Actionability/usefulness (25 points)
            - Format and structure (25 points)
            
            Return only the numeric score.`;

      const score = await this.callOpenAI(qualityPrompt);
      return parseInt(score) || 85;
    } catch (error) {
      await this.log(`❌ Quality assessment failed: ${error.message}`);
      return 85; // Default score
    }
  }

  async bulkGenerate(productType, specifications, quantity) {
    try {
      await this.log(
        `🏭 BULK GENERATION: ${quantity}x ${productType} products`,
      );

      const batches = [];
      const batchSize = 5; // Process in batches of 5

      for (let i = 0; i < quantity; i += batchSize) {
        const batchQuantity = Math.min(batchSize, quantity - i);
        const batch = await this.generateProduct(
          productType,
          specifications,
          batchQuantity,
        );
        batches.push(...batch);

        // Brief pause between batches
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      await this.log(
        `🎉 BULK GENERATION COMPLETE: ${batches.length} products created`,
      );
      return batches;
    } catch (error) {
      await this.log(`❌ Bulk generation failed: ${error.message}`);
      throw error;
    }
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
                "You are an expert product creator specializing in professional digital products. Create high-quality, actionable content that provides real value. Always format responses as valid JSON when requested.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 3000,
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

  async saveProduct(product) {
    try {
      const productDir = path.join(
        __dirname,
        "../generated_products",
        product.type,
      );
      await fs.mkdir(productDir, { recursive: true });

      const filename = `${product.id}.json`;
      const filepath = path.join(productDir, filename);

      await fs.writeFile(filepath, JSON.stringify(product, null, 2));
      await this.log(`💾 Product saved: ${filepath}`);
    } catch (error) {
      await this.log(`❌ Failed to save product: ${error.message}`);
    }
  }

  async loadProductTemplates() {
    try {
      const templatesFile = path.join(
        __dirname,
        "../data/product_templates.json",
      );
      const data = await fs.readFile(templatesFile, "utf8");
      const templates = JSON.parse(data);

      templates.forEach((template) => {
        this.product_templates.set(template.type, template);
      });

      await this.log(
        `📋 Loaded ${this.product_templates.size} product templates`,
      );
    } catch (error) {
      await this.log(`📋 Creating default product templates`);
      await this.createDefaultTemplates();
    }
  }

  async createDefaultTemplates() {
    const defaultTemplates = [
      {
        type: "resume",
        sections: ["contact", "summary", "experience", "education", "skills"],
        format: "professional",
      },
      {
        type: "cover_letter",
        sections: ["header", "opening", "body", "closing"],
        format: "business",
      },
      {
        type: "business_plan",
        sections: [
          "executive_summary",
          "market_analysis",
          "strategy",
          "financials",
        ],
        format: "comprehensive",
      },
    ];

    defaultTemplates.forEach((template) => {
      this.product_templates.set(template.type, template);
    });
  }

  async updateMetrics(productsGenerated, generationTime) {
    this.performance_metrics.products_generated += productsGenerated;

    const avgTime = this.performance_metrics.average_generation_time;
    const totalProducts = this.performance_metrics.products_generated;

    this.performance_metrics.average_generation_time =
      (avgTime * (totalProducts - productsGenerated) + generationTime) /
      totalProducts;
  }

  async getPerformanceReport() {
    const report = {
      agent_status: this.status,
      performance_metrics: this.performance_metrics,
      products_in_queue: this.generation_queue.length,
      recent_products: this.completed_products.slice(-10),
      template_count: this.product_templates.size,
      quality_distribution: this.getQualityDistribution(),
    };

    await this.log(`📊 Performance report generated`);
    return report;
  }

  getQualityDistribution() {
    const scores = this.completed_products
      .map((p) => p.quality_score)
      .filter((s) => s > 0);

    return {
      excellent: scores.filter((s) => s >= 90).length,
      good: scores.filter((s) => s >= 80 && s < 90).length,
      average: scores.filter((s) => s >= 70 && s < 80).length,
      below_average: scores.filter((s) => s < 70).length,
      average_score: scores.reduce((a, b) => a + b, 0) / scores.length || 0,
    };
  }
}

module.exports = ProductGeneratorAgent;

// Auto-start if run directly
if (require.main === module) {
  const agent = new ProductGeneratorAgent();

  // Example usage
  setTimeout(async () => {
    try {
      // Generate a resume
      const resume = await agent.generateProduct("resume", {
        name: "AI Professional",
        industry: "Technology",
        experience_level: "Senior",
        skills: "AI, Machine Learning, Trading Systems",
      });

      console.log("✅ Generated Resume:", resume[0].title);

      // Generate marketing templates
      const marketing = await agent.generateProduct("marketing_template", {
        product: "AI Trading Signals",
        audience: "Business professionals",
        platform: "LinkedIn",
      });

      console.log("✅ Generated Marketing Template:", marketing[0].title);

      // Get performance report
      const report = await agent.getPerformanceReport();
      console.log(
        "📊 PRODUCT GENERATOR REPORT:",
        JSON.stringify(report, null, 2),
      );
    } catch (error) {
      console.error("❌ Agent execution failed:", error);
    }
  }, 1000);
}
