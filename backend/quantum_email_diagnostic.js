require("dotenv").config();
const axios = require("axios");

class QuantumEmailDiagnostic {
  constructor() {
    this.name = "QUANTUM-EMAIL-DIAGNOSTIC-AGENT";
    this.version = "1.0.0";
    this.diagnosticResults = new Map();
  }

  async diagnoseEmailIssues(deploymentUrl) {
    console.log("🔬 QUANTUM EMAIL DIAGNOSTIC INITIATED");
    console.log(`🎯 Target: ${deploymentUrl}`);

    const diagnostic = {
      timestamp: new Date(),
      url: deploymentUrl,
      issues: [],
      fixes: [],
      status: "analyzing",
    };

    // Check 1: Environment Variables
    console.log("\n📋 DIAGNOSTIC 1: Environment Configuration");
    const envIssues = this.checkEnvironmentConfig();
    diagnostic.issues.push(...envIssues);

    // Check 2: Railway Deployment Email Service
    console.log("\n📋 DIAGNOSTIC 2: Railway Email Service");
    const railwayIssues = await this.checkRailwayEmailService(deploymentUrl);
    diagnostic.issues.push(...railwayIssues);

    // Check 3: Email Endpoint Testing
    console.log("\n📋 DIAGNOSTIC 3: Email Endpoint Testing");
    const endpointIssues = await this.testEmailEndpoints(deploymentUrl);
    diagnostic.issues.push(...endpointIssues);

    // Generate Quantum Fixes
    console.log("\n🔧 GENERATING QUANTUM FIXES...");
    const fixes = this.generateQuantumFixes(diagnostic.issues);
    diagnostic.fixes = fixes;

    diagnostic.status = "completed";
    this.diagnosticResults.set(deploymentUrl, diagnostic);

    this.displayDiagnosticReport(diagnostic);
    return diagnostic;
  }

  checkEnvironmentConfig() {
    const issues = [];

    console.log("   🔍 Checking email environment variables...");

    if (!process.env.EMAIL_USER) {
      issues.push({
        type: "env_missing",
        severity: "critical",
        component: "EMAIL_USER",
        description: "EMAIL_USER environment variable not configured",
        impact: "Cannot send emails - no sender address configured",
      });
      console.log("   ❌ EMAIL_USER: NOT SET");
    } else {
      console.log(`   ✅ EMAIL_USER: ${process.env.EMAIL_USER}`);
    }

    if (!process.env.EMAIL_PASS) {
      issues.push({
        type: "env_missing",
        severity: "critical",
        component: "EMAIL_PASS",
        description: "EMAIL_PASS environment variable not configured",
        impact: "Cannot authenticate with email provider",
      });
      console.log("   ❌ EMAIL_PASS: NOT SET");
    } else {
      console.log("   ✅ EMAIL_PASS: CONFIGURED");
    }

    if (!process.env.EMAIL_HOST) {
      issues.push({
        type: "env_missing",
        severity: "medium",
        component: "EMAIL_HOST",
        description: "EMAIL_HOST not specified (will default to Gmail)",
        impact: "May cause connection issues with non-Gmail providers",
      });
      console.log("   ⚠️ EMAIL_HOST: NOT SET (defaulting to Gmail)");
    } else {
      console.log(`   ✅ EMAIL_HOST: ${process.env.EMAIL_HOST}`);
    }

    return issues;
  }

  async checkRailwayEmailService(deploymentUrl) {
    const issues = [];

    console.log("   🔍 Checking Railway deployment email configuration...");

    try {
      // Check if the Railway deployment has email endpoints
      const response = await axios.get(deploymentUrl, { timeout: 10000 });
      const html = response.data;

      // Look for email-related functionality
      const hasEmailPromise = html.includes("email") || html.includes("Email");
      const hasEmailEndpoint =
        html.includes("/send-email") || html.includes("/email");

      if (hasEmailPromise && !hasEmailEndpoint) {
        issues.push({
          type: "missing_endpoint",
          severity: "critical",
          component: "email_endpoint",
          description:
            "Service promises email delivery but no email endpoint detected",
          impact: "Users expect emails but none will be sent",
        });
        console.log("   ❌ Email endpoint: NOT FOUND (but promised in UI)");
      }

      // Check for nodemailer or email libraries
      const hasNodemailer =
        html.includes("nodemailer") || html.includes("sendmail");
      if (!hasNodemailer) {
        issues.push({
          type: "missing_library",
          severity: "high",
          component: "email_library",
          description: "No email sending library detected in deployment",
          impact: "Cannot send emails without proper library",
        });
        console.log("   ❌ Email library: NOT DETECTED");
      }
    } catch (error) {
      issues.push({
        type: "connection_error",
        severity: "high",
        component: "railway_connection",
        description: `Cannot connect to Railway deployment: ${error.message}`,
        impact: "Cannot analyze deployed service",
      });
      console.log(`   ❌ Railway connection: FAILED (${error.message})`);
    }

    return issues;
  }

  async testEmailEndpoints(deploymentUrl) {
    const issues = [];

    console.log("   🔍 Testing email endpoints...");

    const emailEndpoints = [
      "/send-email",
      "/api/send-email",
      "/email/send",
      "/order-email",
      "/api/email",
    ];

    for (const endpoint of emailEndpoints) {
      try {
        const testUrl = `${deploymentUrl}${endpoint}`;
        console.log(`   🔍 Testing: ${testUrl}`);

        const response = await axios.post(
          testUrl,
          {
            test: true,
            email: "test@quantum-diagnostic.ai",
          },
          {
            timeout: 5000,
            validateStatus: () => true, // Don't throw on non-2xx status
          },
        );

        if (response.status === 404) {
          console.log(`   ❌ ${endpoint}: NOT FOUND`);
        } else if (response.status >= 500) {
          issues.push({
            type: "endpoint_error",
            severity: "high",
            component: endpoint,
            description: `Email endpoint returns server error: ${response.status}`,
            impact: "Email sending fails with server errors",
          });
          console.log(`   ❌ ${endpoint}: SERVER ERROR (${response.status})`);
        } else {
          console.log(`   ✅ ${endpoint}: RESPONDS (${response.status})`);
        }
      } catch (error) {
        if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
          console.log(`   ❌ ${endpoint}: CONNECTION FAILED`);
        } else {
          console.log(`   ❌ ${endpoint}: ERROR (${error.message})`);
        }
      }
    }

    // If no endpoints found, it's a critical issue
    const workingEndpoints = issues.filter(
      (i) => i.type !== "endpoint_error",
    ).length;
    if (workingEndpoints === 0) {
      issues.push({
        type: "no_email_endpoints",
        severity: "critical",
        component: "email_service",
        description: "No functional email endpoints found in deployment",
        impact: "Complete email functionality failure",
      });
    }

    return issues;
  }

  generateQuantumFixes(issues) {
    const fixes = [];

    console.log("🔧 Generating quantum fixes for detected issues...");

    for (const issue of issues) {
      switch (issue.type) {
        case "env_missing":
          if (issue.component === "EMAIL_USER") {
            fixes.push({
              type: "environment_config",
              priority: "critical",
              action: "configure_email_user",
              description: "Configure EMAIL_USER environment variable",
              steps: [
                "Set EMAIL_USER=your-email@gmail.com in Railway environment",
                "Ensure email account has app passwords enabled",
                "Verify email account is accessible",
              ],
              automatable: true,
            });
          }
          if (issue.component === "EMAIL_PASS") {
            fixes.push({
              type: "environment_config",
              priority: "critical",
              action: "configure_email_password",
              description: "Configure EMAIL_PASS environment variable",
              steps: [
                "Generate app password for Gmail account",
                "Set EMAIL_PASS=your-app-password in Railway environment",
                "Test authentication with email provider",
              ],
              automatable: true,
            });
          }
          break;

        case "missing_endpoint":
          fixes.push({
            type: "code_deployment",
            priority: "critical",
            action: "add_email_endpoint",
            description: "Add email sending endpoint to Railway deployment",
            steps: [
              "Create /api/send-email endpoint",
              "Integrate nodemailer for email sending",
              "Add order confirmation email template",
              "Deploy updated code to Railway",
            ],
            automatable: false,
            requiresCodeUpdate: true,
          });
          break;

        case "missing_library":
          fixes.push({
            type: "dependency",
            priority: "high",
            action: "install_email_library",
            description: "Install and configure email sending library",
            steps: [
              "npm install nodemailer",
              "Configure SMTP settings",
              "Create email templates",
              "Test email functionality",
            ],
            automatable: false,
            requiresCodeUpdate: true,
          });
          break;

        case "no_email_endpoints":
          fixes.push({
            type: "architecture",
            priority: "critical",
            action: "implement_email_system",
            description:
              "Implement complete email system for order confirmations",
            steps: [
              "Design email service architecture",
              "Implement order confirmation emails",
              "Add email queue for reliability",
              "Set up email monitoring and alerts",
            ],
            automatable: false,
            requiresCodeUpdate: true,
            estimatedTime: "2-4 hours",
          });
          break;
      }
    }

    return fixes;
  }

  displayDiagnosticReport(diagnostic) {
    console.log("\n🔬 ═══════════════════════════════════════════");
    console.log("🧠 QUANTUM EMAIL DIAGNOSTIC REPORT");
    console.log("🔬 ═══════════════════════════════════════════");

    console.log(`\n📊 SUMMARY:`);
    console.log(`   🎯 Target: ${diagnostic.url}`);
    console.log(`   ⏰ Analyzed: ${diagnostic.timestamp.toLocaleString()}`);
    console.log(`   🚨 Issues Found: ${diagnostic.issues.length}`);
    console.log(`   🔧 Fixes Generated: ${diagnostic.fixes.length}`);

    if (diagnostic.issues.length > 0) {
      console.log(`\n❌ ISSUES DETECTED:`);
      diagnostic.issues.forEach((issue, index) => {
        console.log(`\n   ${index + 1}. ${issue.description}`);
        console.log(`      📊 Severity: ${issue.severity.toUpperCase()}`);
        console.log(`      🎯 Component: ${issue.component}`);
        console.log(`      💥 Impact: ${issue.impact}`);
      });
    }

    if (diagnostic.fixes.length > 0) {
      console.log(`\n🔧 QUANTUM FIXES AVAILABLE:`);
      diagnostic.fixes.forEach((fix, index) => {
        console.log(`\n   ${index + 1}. ${fix.description}`);
        console.log(`      ⚡ Priority: ${fix.priority.toUpperCase()}`);
        console.log(`      🤖 Automatable: ${fix.automatable ? "YES" : "NO"}`);
        if (fix.requiresCodeUpdate) {
          console.log(`      📝 Requires Code Update: YES`);
        }
        if (fix.estimatedTime) {
          console.log(`      ⏱️ Estimated Time: ${fix.estimatedTime}`);
        }
        console.log(`      📋 Steps:`);
        fix.steps.forEach((step) => {
          console.log(`         • ${step}`);
        });
      });
    }

    console.log("\n🔬 ═══════════════════════════════════════════");
    console.log("🎯 QUANTUM DIAGNOSTIC COMPLETE");
    console.log("🔬 ═══════════════════════════════════════════\n");
  }

  async autoHealEmailIssues(deploymentUrl) {
    console.log("🤖 QUANTUM AUTO-HEALING INITIATED");

    const diagnostic = this.diagnosticResults.get(deploymentUrl);
    if (!diagnostic) {
      console.log("❌ No diagnostic data found. Run diagnosis first.");
      return false;
    }

    const automatableFixes = diagnostic.fixes.filter((fix) => fix.automatable);
    console.log(`🔧 Found ${automatableFixes.length} automatable fixes`);

    for (const fix of automatableFixes) {
      console.log(`\n🔄 Applying fix: ${fix.description}`);

      if (fix.action === "configure_email_user") {
        // Simulate environment configuration suggestion
        console.log(
          "   📝 RECOMMENDATION: Set EMAIL_USER in Railway environment variables",
        );
        console.log("   🎯 Example: EMAIL_USER=support@neuro-pilot.ai");
      }

      if (fix.action === "configure_email_password") {
        console.log(
          "   📝 RECOMMENDATION: Set EMAIL_PASS in Railway environment variables",
        );
        console.log("   🔐 Use Gmail App Password for security");
      }
    }

    console.log("\n✅ Auto-healing recommendations generated");
    console.log("🚨 Manual code updates required for complete fix");

    return true;
  }
}

// Run diagnostic if called directly
if (require.main === module) {
  const diagnostic = new QuantumEmailDiagnostic();
  diagnostic
    .diagnoseEmailIssues(
      "https://resourceful-achievement-production.up.railway.app/",
    )
    .then((result) => {
      return diagnostic.autoHealEmailIssues(
        "https://resourceful-achievement-production.up.railway.app/",
      );
    })
    .catch((error) => {
      console.error("❌ Quantum diagnostic failed:", error);
    });
}

module.exports = QuantumEmailDiagnostic;
