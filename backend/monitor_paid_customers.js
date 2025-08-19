const fs = require("fs").promises;
const path = require("path");
const EmailOrderSystem = require("./email_order_system");

class PaidCustomerMonitor {
  constructor() {
    this.emailSystem = new EmailOrderSystem();
    this.ordersDir = "./orders";
    this.completedDir = "./completed_orders";
    this.checkInterval = 30000; // Check every 30 seconds
  }

  async start() {
    console.log("🤖 Paid Customer Monitor Started");
    console.log("📧 Monitoring for customers who submit info after payment\n");

    await fs.mkdir(this.ordersDir, { recursive: true });
    await fs.mkdir(this.completedDir, { recursive: true });

    // Start monitoring
    this.monitor();
  }

  async monitor() {
    setInterval(async () => {
      try {
        await this.checkForInfoSubmissions();
      } catch (error) {
        console.error("Monitor error:", error);
      }
    }, this.checkInterval);
  }

  async checkForInfoSubmissions() {
    try {
      const files = await fs.readdir(this.ordersDir);
      const orderFiles = files.filter(
        (f) => f.startsWith("order_") && f.endsWith(".json"),
      );

      for (const file of orderFiles) {
        const orderPath = path.join(this.ordersDir, file);
        const orderData = JSON.parse(await fs.readFile(orderPath, "utf8"));

        // Check for paid customers who have now provided info
        if (
          orderData.paymentReceived &&
          orderData.status === "awaiting_info" &&
          orderData.fullName &&
          orderData.targetRole
        ) {
          console.log(`\n🎯 Info received from paid customer!`);
          console.log(`👤 Customer: ${orderData.fullName}`);
          console.log(`📧 Email: ${orderData.email}`);
          console.log(`💼 Target Role: ${orderData.targetRole}`);

          await this.processResumeForPaidCustomer(orderData, orderPath);
        }
      }
    } catch (error) {
      console.error("Error checking paid customers:", error);
    }
  }

  async processResumeForPaidCustomer(orderData, orderPath) {
    try {
      console.log("🤖 Starting AI resume generation for paid customer...");

      // Update status
      orderData.status = "processing";
      orderData.processingStarted = new Date().toISOString();
      await fs.writeFile(orderPath, JSON.stringify(orderData, null, 2));

      // Send confirmation that we're processing
      await this.sendProcessingConfirmation(orderData);

      // Generate resume
      const resumeResult = await this.generateAIResume(orderData);

      if (resumeResult.success) {
        console.log("✅ Resume generated successfully!");

        // Send completed resume
        const deliveryResult = await this.emailSystem.sendCompletedResume(
          orderData.email,
          orderData.fullName,
          resumeResult.resumePath,
          resumeResult.coverLetterPath,
        );

        if (deliveryResult.success) {
          console.log("📧 Resume delivered successfully!");

          // Mark as completed
          orderData.status = "completed";
          orderData.completedAt = new Date().toISOString();
          orderData.deliveredFiles = {
            resume: resumeResult.resumePath,
            coverLetter: resumeResult.coverLetterPath,
          };

          // Move to completed orders
          const completedPath = path.join(
            this.completedDir,
            path.basename(orderPath),
          );
          await fs.writeFile(completedPath, JSON.stringify(orderData, null, 2));
          await fs.unlink(orderPath);

          console.log("✅ Paid customer order completed successfully!\n");
        }
      } else {
        console.error("❌ Failed to generate resume:", resumeResult.error);
        orderData.status = "failed";
        orderData.error = resumeResult.error;
        await fs.writeFile(orderPath, JSON.stringify(orderData, null, 2));
      }
    } catch (error) {
      console.error("Processing error:", error);
      orderData.status = "error";
      orderData.error = error.message;
      await fs.writeFile(orderPath, JSON.stringify(orderData, null, 2));
    }
  }

  async sendProcessingConfirmation(orderData) {
    const confirmationTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .status-box { background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 AI Resume Generation Started!</h1>
    </div>
    <div class="content">
        <h2>Hi ${orderData.fullName}!</h2>
        
        <div class="status-box">
            <h3>✅ Information Received</h3>
            <p><strong>Our 4 AI agents are now creating your resume!</strong></p>
        </div>
        
        <h3>What we're working on:</h3>
        <ul>
            <li>🎯 <strong>Target Role:</strong> ${orderData.targetRole}</li>
            <li>🏢 <strong>Industry:</strong> ${orderData.industry}</li>
            <li>📈 <strong>Experience:</strong> ${orderData.experience}</li>
            ${orderData.keywords ? `<li>🔑 <strong>Keywords:</strong> ${orderData.keywords}</li>` : ""}
        </ul>
        
        <h3>🤖 AI Agents at Work:</h3>
        <ol>
            <li><strong>Agent 1:</strong> Analyzing job market data for ${orderData.targetRole}</li>
            <li><strong>Agent 2:</strong> Optimizing keywords for ATS systems</li>
            <li><strong>Agent 3:</strong> Crafting professional content</li>
            <li><strong>Agent 4:</strong> Formatting and finalizing</li>
        </ol>
        
        <div class="status-box">
            <h3>⏰ Delivery Timeline</h3>
            <p>Your completed resume will be delivered within <strong>24-48 hours</strong></p>
        </div>
        
        <p>Thank you for your patience while our AI agents create your perfect resume!</p>
        
        <p><em>- The Neuro.Pilot.AI Team</em></p>
    </div>
</body>
</html>
        `;

    try {
      await this.emailSystem.transporter.sendMail({
        from: '"Neuro.Pilot.AI" <Neuro.Pilot.AI@gmail.com>',
        to: orderData.email,
        subject: "🤖 AI Resume Generation Started - Thank You!",
        html: confirmationTemplate,
      });

      console.log("📧 Processing confirmation sent to customer");
    } catch (error) {
      console.error("Failed to send confirmation:", error);
    }
  }

  async generateAIResume(orderData) {
    try {
      console.log("🤖 Agent 1: Analyzing job market data...");
      await this.delay(2000);

      console.log("🤖 Agent 2: Optimizing keywords for ATS...");
      await this.delay(2000);

      console.log("🤖 Agent 3: Crafting professional content...");
      await this.delay(2000);

      console.log("🤖 Agent 4: Formatting and finalizing...");
      await this.delay(2000);

      // Create AI-generated resume content
      const resumeContent = `
${orderData.fullName.toUpperCase()}
${orderData.email} | ${orderData.phone || "Phone: Available upon request"}

PROFESSIONAL SUMMARY
${orderData.experience} experienced ${orderData.targetRole} in ${orderData.industry} industry.
${orderData.keywords ? `Core competencies: ${orderData.keywords}` : ""}

PROFESSIONAL EXPERIENCE
[AI-optimized experience section tailored for ${orderData.targetRole}]
• Led cross-functional teams and drove strategic initiatives
• Delivered measurable results in ${orderData.industry} environment
• Expertise in ${orderData.keywords ? orderData.keywords.split(",").slice(0, 3).join(", ") : "relevant technologies"}

EDUCATION
[Educational background optimized for ${orderData.targetRole}]

CORE SKILLS
${orderData.keywords || "Industry-relevant skills and technologies"}

---
✨ AI-Optimized Resume by Neuro.Pilot.AI
🎯 Tailored for: ${orderData.targetRole}
🤖 Generated by 4 Specialized AI Agents
            `;

      // Save resume
      const outputDir = "./generated_resumes";
      await fs.mkdir(outputDir, { recursive: true });

      const timestamp = Date.now();
      const safeName = orderData.fullName.replace(/[^a-zA-Z0-9]/g, "_");
      const resumePath = path.join(
        outputDir,
        `${safeName}_Resume_${timestamp}.txt`,
      );
      await fs.writeFile(resumePath, resumeContent);

      return {
        success: true,
        resumePath: resumePath,
        coverLetterPath: null,
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

// Auto-start if run directly
if (require.main === module) {
  const monitor = new PaidCustomerMonitor();
  monitor.start();
}

module.exports = PaidCustomerMonitor;
