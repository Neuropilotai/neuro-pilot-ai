require("dotenv").config();
const EmailOrderSystem = require("./email_order_system");
const PDFResumeGenerator = require("./pdf_resume_generator");

async function testAllSystems() {
  console.log("🚀 Testing ALL Systems Status\n");

  const systems = [
    {
      name: "Frontend React App",
      url: "http://localhost:3000",
      expected: "html",
    },
    {
      name: "Web Server",
      url: "http://localhost:3001/health",
      expected: "json",
    },
    { name: "Backend API", url: "http://localhost:8080", expected: "html" },
    { name: "Admin Dashboard", url: "http://localhost:8081", expected: "html" },
    {
      name: "Fiverr Pro System",
      url: "http://localhost:8082",
      expected: "html",
    },
  ];

  const results = {};

  // Test all HTTP endpoints
  for (const system of systems) {
    try {
      const response = await fetch(system.url);
      const text = await response.text();
      const status = response.ok ? "✅ ONLINE" : "⚠️ ISSUES";
      results[system.name] = { status, response: text.substring(0, 100) };
      console.log(`${status} ${system.name}: ${system.url}`);
    } catch (error) {
      results[system.name] = { status: "❌ OFFLINE", error: error.message };
      console.log(`❌ OFFLINE ${system.name}: ${error.message}`);
    }
  }

  console.log("\n🔧 Testing Core Components:\n");

  // Test Email System
  try {
    const emailSystem = new EmailOrderSystem();
    console.log("✅ EMAIL SYSTEM: Configured and ready");
    results["Email System"] = { status: "✅ READY" };
  } catch (error) {
    console.log(`❌ EMAIL SYSTEM: ${error.message}`);
    results["Email System"] = { status: "❌ ERROR", error: error.message };
  }

  // Test PDF Generation
  try {
    const pdfGenerator = new PDFResumeGenerator();
    console.log("✅ PDF GENERATOR: Ready for resume creation");
    results["PDF Generator"] = { status: "✅ READY" };
  } catch (error) {
    console.log(`❌ PDF GENERATOR: ${error.message}`);
    results["PDF Generator"] = { status: "❌ ERROR", error: error.message };
  }

  // Test Order Processing Pipeline
  try {
    const fs = require("fs").promises;
    await fs.access("./orders");
    await fs.access("./completed_orders");
    await fs.access("./generated_resumes");
    console.log("✅ ORDER PIPELINE: Directories and monitoring active");
    results["Order Pipeline"] = { status: "✅ READY" };
  } catch (error) {
    console.log(`⚠️ ORDER PIPELINE: Creating missing directories`);
    const fs = require("fs").promises;
    await fs.mkdir("./orders", { recursive: true });
    await fs.mkdir("./completed_orders", { recursive: true });
    await fs.mkdir("./generated_resumes", { recursive: true });
    results["Order Pipeline"] = { status: "✅ READY" };
  }

  console.log("\n📊 SYSTEM STATUS SUMMARY:\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const onlineCount = Object.values(results).filter((r) =>
    r.status.includes("✅"),
  ).length;
  const totalCount = Object.keys(results).length;

  for (const [name, result] of Object.entries(results)) {
    console.log(`${result.status.padEnd(12)} ${name}`);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📈 OVERALL STATUS: ${onlineCount}/${totalCount} systems online`);

  if (onlineCount === totalCount) {
    console.log("🎉 ALL SYSTEMS ONLINE AND READY FOR CUSTOMERS!");

    // Test complete order flow
    console.log("\n🧪 Testing Complete Order Flow...");
    await testCompleteFlow();
  } else {
    console.log("⚠️ Some systems need attention");
  }

  console.log("\n🔗 PUBLIC ACCESS URLS:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    "📋 Order Form: https://0122-23-233-176-252.ngrok-free.app/simple-order.html",
  );
  console.log(
    "🧪 Demo Version: https://0122-23-233-176-252.ngrok-free.app/simple-order.html?demo=true",
  );
  console.log("🌐 Main Website: https://0122-23-233-176-252.ngrok-free.app");

  return results;
}

async function testCompleteFlow() {
  try {
    // Simulate a test order
    const testOrder = {
      orderId: "SYSTEM_TEST_" + Date.now(),
      fullName: "System Test User",
      email: "neuro.pilot.ai@gmail.com",
      targetRole: "Senior Software Engineer",
      industry: "Technology",
      experience: "6-10",
      keywords: "JavaScript, Python, React, Node.js, AWS",
      package: "professional",
      status: "processing",
    };

    console.log("   📝 Creating test order...");

    // Test PDF generation
    const pdfGenerator = new PDFResumeGenerator();
    const pdfResult = await pdfGenerator.generateProfessionalResume(testOrder);

    if (pdfResult.success) {
      console.log("   ✅ PDF generation working");

      // Test email delivery
      const emailSystem = new EmailOrderSystem();
      const emailResult = await emailSystem.sendCompletedResume(
        testOrder.email,
        testOrder.fullName,
        pdfResult.filePath,
      );

      if (emailResult.success) {
        console.log("   ✅ Email delivery working");
        console.log("   📧 Test resume sent to neuro.pilot.ai@gmail.com");
      } else {
        console.log("   ⚠️ Email delivery issue");
      }
    } else {
      console.log("   ❌ PDF generation issue");
    }
  } catch (error) {
    console.log(`   ❌ Flow test error: ${error.message}`);
  }
}

// Add fetch polyfill for Node.js
if (typeof fetch === "undefined") {
  global.fetch = require("node-fetch");
}

// Run the test
if (require.main === module) {
  testAllSystems()
    .then(() => {
      console.log("\n✅ System test completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Test failed:", error);
      process.exit(1);
    });
}

module.exports = testAllSystems;
