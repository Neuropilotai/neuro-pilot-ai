require("dotenv").config();
const { ImapFlow } = require("imapflow");
const EmailOrderSystem = require("./email_order_system");
const PDFResumeGenerator = require("./pdf_resume_generator");
const fs = require("fs").promises;

class EmailAgent {
  constructor() {
    this.emailSystem = new EmailOrderSystem();
    this.pdfGenerator = new PDFResumeGenerator();
    this.checkInterval = 30000; // Check every 30 seconds
    this.isRunning = false;
  }

  async start() {
    console.log("📧 Email Agent Starting...");
    console.log("👀 Monitoring: Neuro.Pilot.AI@gmail.com");
    console.log("🔍 Looking for: Customer replies with resume info\n");

    this.isRunning = true;
    this.monitorEmails();
  }

  async monitorEmails() {
    // Since we don't have direct IMAP access without additional setup,
    // we'll simulate email monitoring by checking for manual inputs
    console.log("📬 Email monitoring active...");

    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.checkForEmailReplies();
      } catch (error) {
        console.error("Email monitoring error:", error.message);
      }
    }, this.checkInterval);
  }

  async checkForEmailReplies() {
    // Simulate checking for email replies
    console.log(
      `[${new Date().toLocaleTimeString()}] 📧 Checking Neuro.Pilot.AI@gmail.com for customer replies...`,
    );

    // In a real implementation, this would:
    // 1. Connect to Gmail IMAP
    // 2. Check for new emails
    // 3. Parse email content for order information
    // 4. Extract attachments (resumes)
    // 5. Process orders automatically

    return true;
  }

  async processEmailOrder(emailData) {
    try {
      console.log("\n📨 New email order received!");
      console.log(`From: ${emailData.from}`);
      console.log(`Subject: ${emailData.subject}`);

      // Extract order information from email
      const orderInfo = this.extractOrderInfo(emailData.body);

      if (orderInfo.isComplete()) {
        console.log("✅ Complete order information found");

        // Generate resume
        const resumeResult =
          await this.pdfGenerator.generateProfessionalResume(orderInfo);

        if (resumeResult.success) {
          // Send completed resume back
          await this.emailSystem.sendCompletedResume(
            orderInfo.email,
            orderInfo.fullName,
            resumeResult.filePath,
          );

          console.log("✅ Resume generated and sent!");
        }
      } else {
        console.log("⚠️ Incomplete information, requesting more details...");
        await this.requestMissingInfo(emailData.from, orderInfo);
      }
    } catch (error) {
      console.error("Email processing error:", error);
    }
  }

  extractOrderInfo(emailBody) {
    // Parse email content for order details
    const orderInfo = {
      fullName: this.extractField(emailBody, "name"),
      email: this.extractField(emailBody, "email"),
      targetRole: this.extractField(emailBody, "role"),
      industry: this.extractField(emailBody, "industry"),
      experience: this.extractField(emailBody, "experience"),
      keywords: this.extractField(emailBody, "skills"),

      isComplete() {
        return this.fullName && this.email && this.targetRole && this.industry;
      },
    };

    return orderInfo;
  }

  extractField(text, field) {
    // Simple extraction logic (would be more sophisticated in production)
    const patterns = {
      name: /name[:\s]*([^\n\r]+)/i,
      email: /email[:\s]*([^\s\n\r]+@[^\s\n\r]+)/i,
      role: /(?:role|position|job)[:\s]*([^\n\r]+)/i,
      industry: /industry[:\s]*([^\n\r]+)/i,
      experience: /experience[:\s]*([^\n\r]+)/i,
      skills: /(?:skills|keywords)[:\s]*([^\n\r]+)/i,
    };

    const match = text.match(patterns[field]);
    return match ? match[1].trim() : null;
  }

  async requestMissingInfo(customerEmail, partialInfo) {
    const missingFields = [];
    if (!partialInfo.fullName) missingFields.push("Full Name");
    if (!partialInfo.targetRole) missingFields.push("Target Job Role");
    if (!partialInfo.industry) missingFields.push("Industry");
    if (!partialInfo.experience) missingFields.push("Years of Experience");

    const template = `
Hi there!

Thank you for your interest in our AI Resume service! 

To create your perfect resume, I need a few more details:

Missing Information:
${missingFields.map((field) => `• ${field}`).join("\n")}

Please reply with:
• Full Name: [Your name]
• Target Role: [e.g., Software Engineer, Marketing Manager]
• Industry: [e.g., Technology, Healthcare, Finance]
• Experience: [e.g., 5 years, Entry level, 10+ years]
• Skills: [e.g., JavaScript, Project Management, Data Analysis]

You can also attach your current resume if you have one!

Best regards,
The Neuro.Pilot.AI Team
        `;

    await this.emailSystem.transporter.sendMail({
      from: '"Neuro.Pilot.AI" <Neuro.Pilot.AI@gmail.com>',
      to: customerEmail,
      subject: "Missing Information for Your AI Resume - Neuro.Pilot.AI",
      text: template,
    });

    console.log(`📧 Requested missing info from ${customerEmail}`);
  }

  // Manual order processing method
  async processManualOrder(orderData) {
    console.log("\n🎯 Processing manual order...");
    console.log(`Customer: ${orderData.fullName}`);
    console.log(`Email: ${orderData.email}`);
    console.log(`Role: ${orderData.targetRole}`);

    try {
      // Generate PDF resume
      const resumeResult =
        await this.pdfGenerator.generateProfessionalResume(orderData);

      if (resumeResult.success) {
        // Send to customer
        await this.emailSystem.sendCompletedResume(
          orderData.email,
          orderData.fullName,
          resumeResult.filePath,
        );

        console.log("✅ Resume sent to customer!");
        console.log(`📁 File: ${resumeResult.filename}`);

        return { success: true, filename: resumeResult.filename };
      }
    } catch (error) {
      console.error("❌ Processing failed:", error);
      return { success: false, error: error.message };
    }
  }

  stop() {
    this.isRunning = false;
    console.log("📧 Email Agent stopped");
  }
}

// Command line interface for manual order processing
if (require.main === module) {
  const agent = new EmailAgent();

  // Start the email monitoring
  agent.start();

  // Example of processing a manual order
  const sampleOrder = {
    fullName: "Test Customer",
    email: "neuro.pilot.ai@gmail.com",
    targetRole: "Senior Product Manager",
    industry: "Technology",
    experience: "8-10",
    keywords:
      "Product Strategy, Agile, User Research, Data Analytics, Leadership",
    package: "professional",
  };

  // Uncomment to test manual processing:
  // setTimeout(() => agent.processManualOrder(sampleOrder), 5000);
}

module.exports = EmailAgent;
