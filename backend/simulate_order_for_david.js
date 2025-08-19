const fs = require("fs").promises;
const path = require("path");

async function simulateOrderForDavid() {
  console.log("\n🎯 Simulating Order Process for David Mikulis\n");

  // Step 1: Create simulated order
  const orderData = {
    orderId: "AI-" + Date.now(),
    email: "david.mikulis@sodexo.com",
    fullName: "David Mikulis",
    phone: "+1-555-0123",
    package: "professional",
    targetRole: "Senior IT Manager",
    industry: "Food Services",
    experience: "11-15",
    keywords:
      "IT Management, Project Management, Digital Transformation, Team Leadership, Budget Management, Vendor Relations",
    jobDescription:
      "Seeking a Senior IT Manager position at Sodexo to lead digital transformation initiatives and manage cross-functional teams.",
    resumeUploaded: true,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  // Save order
  const ordersDir = path.join(__dirname, "../orders");
  await fs.mkdir(ordersDir, { recursive: true });

  const orderPath = path.join(ordersDir, `order_${orderData.orderId}.json`);
  await fs.writeFile(orderPath, JSON.stringify(orderData, null, 2));

  console.log("✅ Order created successfully!");
  console.log("📋 Order Details:");
  console.log(`   - Order ID: ${orderData.orderId}`);
  console.log(`   - Customer: ${orderData.fullName}`);
  console.log(`   - Email: ${orderData.email}`);
  console.log(`   - Package: ${orderData.package} ($59)`);
  console.log(`   - Target Role: ${orderData.targetRole}`);
  console.log(`   - Industry: ${orderData.industry}`);

  console.log("\n📧 Email Simulation:");
  console.log("┌─────────────────────────────────────────────────┐");
  console.log("│ TO: david.mikulis@sodexo.com                    │");
  console.log("│ FROM: noreply@neuropilot-ai.com                 │");
  console.log("│ SUBJECT: Your AI Resume Order - Neuro.Pilot.AI  │");
  console.log("├─────────────────────────────────────────────────┤");
  console.log("│ Hi David!                                       │");
  console.log("│                                                 │");
  console.log("│ Thank you for your order! Click here to        │");
  console.log("│ complete your information:                      │");
  console.log("│                                                 │");
  console.log("│ [Complete Order Form]                           │");
  console.log(
    "│ https://neuropilot-ai.com/order?id=" +
      orderData.orderId.slice(-8) +
      "    │",
  );
  console.log("│                                                 │");
  console.log("│ Package: Professional ($59)                     │");
  console.log("│ • AI-Optimized Resume                          │");
  console.log("│ • Cover Letter Template                        │");
  console.log("│ • LinkedIn Profile Optimization                │");
  console.log("│                                                 │");
  console.log("│ Reply with your current resume attached!       │");
  console.log("└─────────────────────────────────────────────────┘");

  console.log("\n🤖 Automated Processing:");
  console.log("   The system will check every 30 seconds for:");
  console.log("   1. Form completion");
  console.log("   2. Resume attachment");
  console.log("   3. Payment confirmation");

  console.log("\n📂 Order saved to:", orderPath);
  console.log("\n✅ To start the automated processor, run:");
  console.log("   node automated_order_processor.js");

  // Simulate the AI processing after a delay
  console.log("\n⏱️  Simulating AI processing in 5 seconds...");

  setTimeout(async () => {
    console.log("\n🤖 AI Resume Generation Started!");
    console.log('   Agent 1: Analyzing job market for "Senior IT Manager"...');
    await delay(1000);
    console.log("   Agent 2: Optimizing keywords for ATS systems...");
    await delay(1000);
    console.log("   Agent 3: Crafting professional content...");
    await delay(1000);
    console.log("   Agent 4: Formatting and finalizing...");
    await delay(1000);

    // Create sample resume
    const resumeContent = `
DAVID MIKULIS
david.mikulis@sodexo.com | +1-555-0123

SENIOR IT MANAGER
Digital Transformation Leader | 15+ Years Experience

PROFESSIONAL SUMMARY
Accomplished Senior IT Manager with 15+ years of experience leading digital transformation 
initiatives in the food services industry. Proven track record of managing cross-functional 
teams, optimizing IT operations, and delivering enterprise-wide technology solutions that 
drive business growth and operational efficiency.

KEY ACHIEVEMENTS
• Led $2.5M digital transformation project, improving operational efficiency by 35%
• Managed team of 25+ IT professionals across multiple locations
• Reduced IT operational costs by 28% through strategic vendor negotiations
• Implemented cloud-first strategy resulting in 99.9% system uptime

CORE COMPETENCIES
${orderData.keywords}

PROFESSIONAL EXPERIENCE
[Detailed experience tailored for Sodexo Senior IT Manager role]

EDUCATION
Bachelor of Science in Information Technology
Master of Business Administration (MBA)

---
Generated by Neuro.Pilot.AI - Optimized for ${orderData.targetRole}
4 AI Agents | ATS-Optimized | Industry-Specific Keywords
        `;

    const outputDir = path.join(__dirname, "../generated_resumes");
    await fs.mkdir(outputDir, { recursive: true });

    const resumePath = path.join(
      outputDir,
      `David_Mikulis_Senior_IT_Manager_Resume.txt`,
    );
    await fs.writeFile(resumePath, resumeContent);

    console.log("\n✅ Resume Generated Successfully!");
    console.log("📄 Saved to:", resumePath);

    console.log("\n📧 Final Email Simulation:");
    console.log("┌─────────────────────────────────────────────────┐");
    console.log("│ TO: david.mikulis@sodexo.com                    │");
    console.log("│ SUBJECT: Your Resume is Ready! 🎉               │");
    console.log("├─────────────────────────────────────────────────┤");
    console.log("│ Congratulations David!                          │");
    console.log("│                                                 │");
    console.log("│ Your AI-optimized resume is complete and       │");
    console.log("│ attached to this email.                         │");
    console.log("│                                                 │");
    console.log("│ 📎 Attachments:                                 │");
    console.log("│ • David_Mikulis_Resume.pdf                     │");
    console.log("│ • David_Mikulis_Resume.docx                    │");
    console.log("│ • Cover_Letter_Template.docx                   │");
    console.log("│                                                 │");
    console.log("│ Best of luck with your job search!             │");
    console.log("│                                                 │");
    console.log("│ - The Neuro.Pilot.AI Team                      │");
    console.log("└─────────────────────────────────────────────────┘");

    console.log("\n🎯 Order Complete!");
    console.log(
      "✅ David's resume has been delivered to david.mikulis@sodexo.com",
    );
  }, 5000);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the simulation
simulateOrderForDavid();
