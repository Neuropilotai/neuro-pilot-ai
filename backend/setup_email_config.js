const readline = require("readline");
const fs = require("fs").promises;
const path = require("path");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupEmailConfig() {
  console.log("\n📧 Gmail Credentials Setup for Neuro.Pilot.AI\n");

  console.log("🔒 First, you need to set up Gmail App Password:");
  console.log("1. Go to: https://myaccount.google.com/security");
  console.log("2. Enable 2-Factor Authentication");
  console.log("3. Go to App passwords");
  console.log('4. Generate password for "Mail" app');
  console.log("5. Copy the 16-character password\n");

  const ready = await question("Have you completed the setup above? (y/n): ");

  if (ready.toLowerCase() !== "y") {
    console.log(
      "\n❌ Please complete the Gmail setup first, then run this script again.",
    );
    rl.close();
    return;
  }

  console.log("\n📝 Enter your Gmail credentials:\n");

  const email = await question("Gmail address: ");
  const appPassword = await question("App password (16 characters): ");

  // Clean the app password (remove spaces)
  const cleanPassword = appPassword.replace(/\s/g, "");

  // Create .env content
  const envContent = `# Email Configuration for Neuro.Pilot.AI
EMAIL_USER=${email}
EMAIL_PASS=${cleanPassword}

# Stripe Configuration (add your keys here)
STRIPE_SECRET_KEY=sk_test_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# URLs
FRONTEND_URL=http://localhost:3000
ORDER_FORM_URL=https://a373-23-233-176-252.ngrok-free.app/order-form.html

# OpenAI API (for AI agents)
OPENAI_API_KEY=sk-your-openai-key
`;

  try {
    // Save .env file
    const envPath = path.join(__dirname, ".env");
    await fs.writeFile(envPath, envContent);

    console.log("\n✅ Configuration saved to .env file!");
    console.log("\n🧪 Testing email configuration...\n");

    // Test the configuration
    const EmailOrderSystem = require("./email_order_system");
    const emailSystem = new EmailOrderSystem();

    const testResult = await emailSystem.sendOrderFormEmail(email, "Test User");

    if (testResult.success) {
      console.log("✅ SUCCESS! Email sent successfully!");
      console.log("📧 Check your inbox for the test email");
      console.log("\n🎯 Now you can send emails to customers!");
      console.log("\nTo send order form to David:");
      console.log("node test_send_order_email.js");
    } else {
      console.log("❌ FAILED:", testResult.error);
      console.log("\n🔧 Double-check your credentials and try again");
    }
  } catch (error) {
    console.error("❌ Error saving configuration:", error.message);
  }

  rl.close();
}

// Run the setup
setupEmailConfig();
