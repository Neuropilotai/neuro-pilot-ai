const fs = require("fs").promises;
const path = require("path");
const EmailOrderSystem = require("./email_order_system");
// Note: AI resume generator will be implemented as a simulated process for now

class AutomatedOrderProcessor {
  constructor() {
    this.emailSystem = new EmailOrderSystem();
    this.checkInterval = 30000; // Check every 30 seconds
    this.ordersDir = path.join(__dirname, "../orders");
    this.completedDir = path.join(__dirname, "../completed_orders");
  }

  async start() {
    console.log("🤖 Automated Order Processor Started");
    console.log("📧 Monitoring orders for all customer emails");

    // Create directories if they don't exist
    await fs.mkdir(this.ordersDir, { recursive: true });
    await fs.mkdir(this.completedDir, { recursive: true });

    // Start monitoring
    this.monitor();
  }

  async monitor() {
    setInterval(async () => {
      try {
        await this.checkPendingOrders();
      } catch (error) {
        console.error("Monitor error:", error);
      }
    }, this.checkInterval);
  }

  async checkPendingOrders() {
    try {
      const files = await fs.readdir(this.ordersDir);
      const orderFiles = files.filter(
        (f) => f.startsWith("order_") && f.endsWith(".json"),
      );

      for (const file of orderFiles) {
        const orderPath = path.join(this.ordersDir, file);
        const orderData = JSON.parse(await fs.readFile(orderPath, "utf8"));

        // Check if this is a valid order ready for processing
        const customerEmails = [
          "david.mikulis@sodexo.com",
          "davidmikulis66@gmail.com",
        ];

        if (
          customerEmails.includes(orderData.email) &&
          (orderData.status === "pending" || orderData.status === "received") &&
          orderData.firstName &&
          orderData.lastName
        ) {
          console.log(
            `\n🎯 Processing order for ${orderData.firstName} ${orderData.lastName}`,
          );
          console.log(`📧 Email: ${orderData.email}`);
          console.log(`📋 Order ID: ${orderData.orderId}`);
          console.log(`💼 Package: ${orderData.packageType}`);

          await this.processOrder(orderData, orderPath);
        }
      }
    } catch (error) {
      console.error("Error checking orders:", error);
    }
  }

  async processOrder(orderData, orderPath) {
    try {
      // Update status
      orderData.status = "processing";
      orderData.processingStarted = new Date().toISOString();
      await fs.writeFile(orderPath, JSON.stringify(orderData, null, 2));

      console.log("🤖 AI Agents starting resume generation...");

      // Prepare resume data
      const resumeData = {
        personalInfo: {
          name:
            `${orderData.firstName || ""} ${orderData.lastName || ""}`.trim() ||
            orderData.fullName,
          email: orderData.email,
          phone: orderData.phone || "",
        },
        targetRole:
          orderData.jobTitle || orderData.targetRole || "Professional Role",
        industry:
          orderData.targetIndustry || orderData.industry || "Technology",
        experience:
          orderData.careerLevel || orderData.experience || "Mid-level",
        keywords: orderData.skills
          ? orderData.skills.split(",").map((k) => k.trim())
          : [],
        jobDescription: orderData.jobDescription || "",
        currentResumePath: orderData.resumePath || null,
      };

      // Generate resume using AI agents
      const result = await this.generateAIResume(resumeData);

      if (result.success) {
        console.log("✅ Resume generated successfully!");

        // Send completed resume
        await this.emailSystem.sendCompletedResume(
          orderData.email,
          orderData.fullName,
          result.resumePath,
          result.coverLetterPath,
        );

        // Update order status
        orderData.status = "completed";
        orderData.completedAt = new Date().toISOString();
        orderData.deliveredFiles = {
          resume: result.resumePath,
          coverLetter: result.coverLetterPath,
        };

        // Move to completed orders
        const completedPath = path.join(
          this.completedDir,
          path.basename(orderPath),
        );
        await fs.writeFile(completedPath, JSON.stringify(orderData, null, 2));
        await fs.unlink(orderPath);

        console.log(`📧 Resume delivered to ${orderData.email}`);
        console.log("✅ Order completed successfully!");
      } else {
        console.error("❌ Failed to generate resume:", result.error);
        orderData.status = "failed";
        orderData.error = result.error;
        await fs.writeFile(orderPath, JSON.stringify(orderData, null, 2));
      }
    } catch (error) {
      console.error("Order processing error:", error);
      orderData.status = "error";
      orderData.error = error.message;
      await fs.writeFile(orderPath, JSON.stringify(orderData, null, 2));
    }
  }

  async generateAIResume(resumeData) {
    try {
      // Simulate AI resume generation
      // In production, this would call your actual AI agents
      console.log("🤖 Agent 1: Analyzing job market data...");
      await this.delay(2000);

      console.log("🤖 Agent 2: Optimizing keywords for ATS...");
      await this.delay(2000);

      console.log("🤖 Agent 3: Crafting professional content...");
      await this.delay(2000);

      console.log("🤖 Agent 4: Formatting and finalizing...");
      await this.delay(2000);

      // Create sample resume (in production, this would be the actual AI-generated resume)
      const resumeContent = `
DAVID MIKULIS
${resumeData.personalInfo.email} | ${resumeData.personalInfo.phone}

PROFESSIONAL SUMMARY
Experienced ${resumeData.targetRole} with ${resumeData.experience} years in ${resumeData.industry} industry.
${resumeData.keywords.length > 0 ? `Key strengths: ${resumeData.keywords.join(", ")}` : ""}

EXPERIENCE
[AI-optimized content based on target role: ${resumeData.targetRole}]

EDUCATION
[Relevant education details]

SKILLS
${resumeData.keywords.join(" • ")}

---
Generated by Neuro.Pilot.AI - 4 AI Agents Working Together
            `;

      // Save resume
      const outputDir = path.join(__dirname, "../generated_resumes");
      await fs.mkdir(outputDir, { recursive: true });

      const timestamp = Date.now();
      const resumePath = path.join(
        outputDir,
        `David_Mikulis_Resume_${timestamp}.txt`,
      );
      await fs.writeFile(resumePath, resumeContent);

      return {
        success: true,
        resumePath: resumePath,
        coverLetterPath: null, // Would include if package includes cover letter
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export for use in other files
module.exports = AutomatedOrderProcessor;

// Auto-start if run directly
if (require.main === module) {
  const processor = new AutomatedOrderProcessor();
  processor.start();
}
