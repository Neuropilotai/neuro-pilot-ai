const AgentMonitorIntegration = require("../agent_monitor_integration");

class MonitoredSalesAgent {
  constructor() {
    this.name = "Sales & Marketing Agent";
    this.agentId = "sales_marketing";

    // Define agent capabilities
    this.capabilities = [
      "lead_generation",
      "content_creation",
      "social_media",
      "email_campaigns",
      "market_analysis",
    ];

    // Define which actions require approval
    this.requiresApproval = ["content_creation", "email_campaigns"];

    // Initialize monitor integration
    this.monitor = new AgentMonitorIntegration(
      this.agentId,
      this.name,
      this.capabilities,
    );

    this.monitor.requiresApproval = this.requiresApproval;

    // Setup event handlers
    this.setupEventHandlers();

    // Initialize agent
    this.init();
  }

  setupEventHandlers() {
    // Handle pause command from monitor
    this.monitor.on("pause", () => {
      console.log(`⏸️ ${this.name} paused by monitor`);
      this.isPaused = true;
    });

    // Handle resume command from monitor
    this.monitor.on("resume", () => {
      console.log(`▶️ ${this.name} resumed by monitor`);
      this.isPaused = false;
    });

    // Handle task assignment from monitor
    this.monitor.on("task", async (taskData) => {
      console.log(`📋 ${this.name} received task:`, taskData);
      await this.executeTask(taskData);
    });

    // Handle custom commands
    this.monitor.on("custom_command", ({ command, parameters }) => {
      console.log(`🎯 Custom command received: ${command}`, parameters);
      // Handle custom commands specific to this agent
    });
  }

  async init() {
    console.log(`🚀 ${this.name} initializing...`);
    this.monitor.updateStatus("idle");

    // Update initial metrics
    this.monitor.updateMetrics({
      leadsGenerated: 0,
      contentCreated: 0,
      emailsSent: 0,
      conversionRate: 0,
    });
  }

  async executeTask(taskData) {
    if (this.isPaused) {
      console.log("⏸️ Agent is paused, skipping task");
      return;
    }

    try {
      this.monitor.updateStatus("working", {
        type: taskData.type,
        description: taskData.description,
        startTime: new Date(),
      });

      switch (taskData.type) {
        case "lead_generation":
          await this.generateLeads(taskData);
          break;

        case "content_creation":
          await this.createContent(taskData);
          break;

        case "email_campaigns":
          await this.sendEmailCampaign(taskData);
          break;

        case "social_media":
          await this.postToSocialMedia(taskData);
          break;

        default:
          console.log(`Unknown task type: ${taskData.type}`);
      }
    } catch (error) {
      console.error(`❌ Error executing task:`, error);
      this.monitor.reportError(error);
    }
  }

  async generateLeads(taskData) {
    console.log("🎯 Generating leads...");

    // Simulate lead generation
    const leads = [
      { name: "John Doe", email: "john@example.com", score: 85 },
      { name: "Jane Smith", email: "jane@example.com", score: 92 },
      { name: "Bob Johnson", email: "bob@example.com", score: 78 },
    ];

    // This doesn't require approval
    await this.monitor.submitWork(
      "lead_generation",
      `Generated ${leads.length} new leads`,
      {
        leads,
        totalScore: leads.reduce((sum, l) => sum + l.score, 0) / leads.length,
      },
      false,
    );

    // Update metrics
    this.monitor.updateMetrics({
      leadsGenerated: leads.length,
      avgLeadScore: 85,
    });

    return leads;
  }

  async createContent(taskData) {
    console.log("✍️ Creating content...");

    // Simulate content creation
    const content = {
      title: taskData.title || "AI-Powered Business Solutions",
      body:
        taskData.body ||
        "Discover how our AI agents can transform your business...",
      type: taskData.contentType || "blog_post",
      keywords: ["AI", "automation", "business", "efficiency"],
    };

    try {
      // This requires approval
      const approval = await this.monitor.submitWork(
        "content_creation",
        `Created ${content.type}: "${content.title}"`,
        { content },
        true,
      );

      if (approval.approved) {
        console.log("✅ Content approved!", approval.feedback);

        // Update metrics
        this.monitor.updateMetrics({
          contentCreated: 1,
          contentApprovalRate: 100,
        });

        return content;
      }
    } catch (error) {
      console.log("❌ Content rejected:", error.message);
      throw error;
    }
  }

  async sendEmailCampaign(taskData) {
    console.log("📧 Preparing email campaign...");

    const campaign = {
      subject: taskData.subject || "Special Offer Just for You!",
      recipients: taskData.recipients || ["test@example.com"],
      template: taskData.template || "promotional",
      scheduledTime: taskData.scheduledTime || new Date(),
    };

    try {
      // This requires approval
      const approval = await this.monitor.submitWork(
        "email_campaigns",
        `Email campaign to ${campaign.recipients.length} recipients`,
        { campaign },
        true,
      );

      if (approval.approved) {
        console.log("✅ Email campaign approved!");

        // Simulate sending emails
        console.log(`📤 Sending ${campaign.recipients.length} emails...`);

        // Update metrics
        this.monitor.updateMetrics({
          emailsSent: campaign.recipients.length,
          campaignsSent: 1,
        });

        return { success: true, sent: campaign.recipients.length };
      }
    } catch (error) {
      console.log("❌ Email campaign rejected:", error.message);
      throw error;
    }
  }

  async postToSocialMedia(taskData) {
    console.log("📱 Posting to social media...");

    const post = {
      platform: taskData.platform || "twitter",
      content: taskData.content || "Check out our latest AI solutions!",
      hashtags: taskData.hashtags || ["AI", "Innovation", "Tech"],
      mediaUrl: taskData.mediaUrl,
    };

    // This doesn't require approval for simple posts
    await this.monitor.submitWork(
      "social_media",
      `Posted to ${post.platform}`,
      { post },
      false,
    );

    // Update metrics
    this.monitor.updateMetrics({
      socialMediaPosts: 1,
      engagement: Math.floor(Math.random() * 100),
    });

    return { success: true, postId: `POST_${Date.now()}` };
  }

  // Example of how to use the agent programmatically
  async runExample() {
    // Generate some leads
    await this.executeTask({
      type: "lead_generation",
      description: "Generate new B2B leads",
    });

    // Create content (requires approval)
    await this.executeTask({
      type: "content_creation",
      description: "Create blog post about AI automation",
      title: "How AI is Revolutionizing Business Operations",
      contentType: "blog_post",
    });

    // Send email campaign (requires approval)
    await this.executeTask({
      type: "email_campaigns",
      description: "Send weekly newsletter",
      subject: "AI Insights Newsletter - Week 45",
      recipients: ["subscriber1@example.com", "subscriber2@example.com"],
    });
  }
}

// Export the agent class
module.exports = MonitoredSalesAgent;

// Start the agent if run directly
if (require.main === module) {
  const agent = new MonitoredSalesAgent();

  // Run example tasks after a delay
  setTimeout(() => {
    agent.runExample().catch(console.error);
  }, 2000);
}
