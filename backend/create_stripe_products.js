require("dotenv").config({ path: "../.env" });
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function createStripeProducts() {
  try {
    console.log("🚀 Creating Neuro.Pilot.AI Stripe products...");

    // =================
    // SUBSCRIPTION PLANS
    // =================

    // Neuro Basic - $29/month
    const neuroBasic = await stripe.products.create({
      name: "Neuro Basic",
      description: "Essential trading tools and basic AI insights",
      images: ["https://your-domain.com/images/neuro-basic.png"],
      metadata: {
        category: "subscription",
        plan: "basic",
        features: JSON.stringify([
          "Basic trading signals",
          "Portfolio tracking",
          "Standard support",
          "Limited API calls",
        ]),
      },
    });

    const neuroBasicPrice = await stripe.prices.create({
      product: neuroBasic.id,
      unit_amount: 2900, // $29.00
      currency: "usd",
      recurring: {
        interval: "month",
      },
      metadata: {
        plan: "basic",
      },
    });

    // Neuro Pro - $99/month
    const neuroPro = await stripe.products.create({
      name: "Neuro Pro",
      description: "Advanced AI trading with enhanced features",
      images: ["https://your-domain.com/images/neuro-pro.png"],
      metadata: {
        category: "subscription",
        plan: "pro",
        features: JSON.stringify([
          "Advanced AI trading signals",
          "Real-time market analysis",
          "Priority support",
          "Unlimited API calls",
          "Custom indicators",
        ]),
      },
    });

    const neuroProPrice = await stripe.prices.create({
      product: neuroPro.id,
      unit_amount: 9900, // $99.00
      currency: "usd",
      recurring: {
        interval: "month",
      },
      metadata: {
        plan: "pro",
      },
    });

    // Neuro Enterprise - $299/month
    const neuroEnterprise = await stripe.products.create({
      name: "Neuro Enterprise",
      description: "Full platform access with dedicated support",
      images: ["https://your-domain.com/images/neuro-enterprise.png"],
      metadata: {
        category: "subscription",
        plan: "enterprise",
        features: JSON.stringify([
          "All Pro features",
          "Dedicated account manager",
          "Custom integrations",
          "White-label options",
          "Advanced analytics",
        ]),
      },
    });

    const neuroEnterprisePrice = await stripe.prices.create({
      product: neuroEnterprise.id,
      unit_amount: 29900, // $299.00
      currency: "usd",
      recurring: {
        interval: "month",
      },
      metadata: {
        plan: "enterprise",
      },
    });

    // ===================
    // ONE-TIME PURCHASES
    // ===================

    // Premium AI Models - $199 one-time
    const premiumAIModels = await stripe.products.create({
      name: "Premium AI Models",
      description: "Access to exclusive trading algorithms",
      images: ["https://your-domain.com/images/ai-models.png"],
      metadata: {
        category: "one_time",
        type: "ai_models",
        access_duration: "lifetime",
      },
    });

    const premiumAIModelsPrice = await stripe.prices.create({
      product: premiumAIModels.id,
      unit_amount: 19900, // $199.00
      currency: "usd",
      metadata: {
        type: "ai_models",
      },
    });

    // Historical Data Package - $49 one-time
    const historicalData = await stripe.products.create({
      name: "Historical Data Package",
      description: "10 years of historical market data",
      images: ["https://your-domain.com/images/historical-data.png"],
      metadata: {
        category: "one_time",
        type: "historical_data",
        data_years: "10",
        file_formats: "CSV, JSON, SQL",
      },
    });

    const historicalDataPrice = await stripe.prices.create({
      product: historicalData.id,
      unit_amount: 4900, // $49.00
      currency: "usd",
      metadata: {
        type: "historical_data",
      },
    });

    // ===============================
    // LEGACY RESUME PRODUCTS (Keep existing)
    // ===============================

    // Resume Basic - $29 one-time
    const resumeBasic = await stripe.products.create({
      name: "AI Resume - Basic Package",
      description: "Professional AI-generated resume with ATS optimization",
      images: ["https://your-domain.com/images/resume-basic.png"],
      metadata: {
        category: "resume",
        package: "basic",
        delivery_time: "24_hours",
      },
    });

    const resumeBasicPrice = await stripe.prices.create({
      product: resumeBasic.id,
      unit_amount: 2900, // $29.00
      currency: "usd",
      metadata: {
        package: "basic",
      },
    });

    // Resume Professional - $59 one-time
    const resumeProfessional = await stripe.products.create({
      name: "AI Resume - Professional Package",
      description: "Resume + Cover Letter + LinkedIn optimization",
      images: ["https://your-domain.com/images/resume-pro.png"],
      metadata: {
        category: "resume",
        package: "professional",
        delivery_time: "24_hours",
      },
    });

    const resumeProfessionalPrice = await stripe.prices.create({
      product: resumeProfessional.id,
      unit_amount: 5900, // $59.00
      currency: "usd",
      metadata: {
        package: "professional",
      },
    });

    // Resume Executive - $99 one-time
    const resumeExecutive = await stripe.products.create({
      name: "AI Resume - Executive Package",
      description:
        "Premium package with resume, cover letter, LinkedIn, and 30-day revisions",
      images: ["https://your-domain.com/images/resume-exec.png"],
      metadata: {
        category: "resume",
        package: "executive",
        delivery_time: "24_hours",
      },
    });

    const resumeExecutivePrice = await stripe.prices.create({
      product: resumeExecutive.id,
      unit_amount: 9900, // $99.00
      currency: "usd",
      metadata: {
        package: "executive",
      },
    });

    // Save product IDs for easy reference
    const productIds = {
      subscriptions: {
        basic: {
          product: neuroBasic.id,
          price: neuroBasicPrice.id,
          amount: 29,
        },
        pro: { product: neuroPro.id, price: neuroProPrice.id, amount: 99 },
        enterprise: {
          product: neuroEnterprise.id,
          price: neuroEnterprisePrice.id,
          amount: 299,
        },
      },
      one_time: {
        ai_models: {
          product: premiumAIModels.id,
          price: premiumAIModelsPrice.id,
          amount: 199,
        },
        historical_data: {
          product: historicalData.id,
          price: historicalDataPrice.id,
          amount: 49,
        },
      },
      resume: {
        basic: {
          product: resumeBasic.id,
          price: resumeBasicPrice.id,
          amount: 29,
        },
        professional: {
          product: resumeProfessional.id,
          price: resumeProfessionalPrice.id,
          amount: 59,
        },
        executive: {
          product: resumeExecutive.id,
          price: resumeExecutivePrice.id,
          amount: 99,
        },
      },
    };

    // Save to file for reference
    require("fs").writeFileSync(
      "stripe_products.json",
      JSON.stringify(productIds, null, 2),
    );

    console.log("✅ All Neuro.Pilot.AI Stripe products created successfully!");
    console.log("📁 Product IDs saved to stripe_products.json");
    console.log("\n📋 Product Summary:");

    console.log("\n🔄 SUBSCRIPTION PLANS:");
    console.log(`  - Neuro Basic: ${neuroBasic.id} ($29/month)`);
    console.log(`  - Neuro Pro: ${neuroPro.id} ($99/month)`);
    console.log(`  - Neuro Enterprise: ${neuroEnterprise.id} ($299/month)`);

    console.log("\n💎 ONE-TIME PURCHASES:");
    console.log(`  - Premium AI Models: ${premiumAIModels.id} ($199)`);
    console.log(`  - Historical Data Package: ${historicalData.id} ($49)`);

    console.log("\n📄 RESUME PACKAGES:");
    console.log(`  - Basic: ${resumeBasic.id} ($29)`);
    console.log(`  - Professional: ${resumeProfessional.id} ($59)`);
    console.log(`  - Executive: ${resumeExecutive.id} ($99)`);

    return productIds;
  } catch (error) {
    console.error("❌ Error creating Stripe products:", error);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  require("dotenv").config();

  if (
    !process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY.includes("PASTE_YOUR")
  ) {
    console.error(
      "❌ Please add your actual Stripe Secret Key to the .env file first!",
    );
    console.log(
      "📝 Edit .env and replace STRIPE_SECRET_KEY with your real key from Stripe Dashboard",
    );
    process.exit(1);
  }

  createStripeProducts()
    .then(() => {
      console.log("🎉 Product creation complete!");
      console.log("\n🔗 Next steps:");
      console.log("1. Check your Stripe Dashboard to verify products");
      console.log("2. Set up webhooks in Stripe Dashboard");
      console.log("3. Test the payment flow");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Failed to create products:", error);
      process.exit(1);
    });
}

module.exports = createStripeProducts;
