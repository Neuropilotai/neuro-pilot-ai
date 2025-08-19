#!/usr/bin/env node

// Create Live Stripe Products for AI Resume Service
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function createLiveProducts() {
  console.log("🚀 Creating LIVE Stripe Products for AI Resume Service...");
  console.log(
    "🔑 Using key:",
    process.env.STRIPE_SECRET_KEY?.substring(0, 15) + "...",
  );
  console.log(
    "🌍 Mode:",
    process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "LIVE" : "TEST",
  );
  console.log("");

  const products = {
    // AI Resume Products
    resume: {
      basic: {
        name: "AI Resume - Basic Package",
        description:
          "Professional AI-generated resume with ATS optimization, beautiful Canva templates, and 1 revision.",
        price: 2900, // $29.00
        features: [
          "AI-Generated Content (English/French)",
          "Beautiful Canva Templates",
          "Professional Formatting",
          "ATS Optimization",
          "1 Revision",
        ],
      },
      professional: {
        name: "AI Resume - Professional Package",
        description:
          "Complete career package with resume, cover letter, LinkedIn optimization, and premium templates.",
        price: 5900, // $59.00
        features: [
          "Everything in Basic",
          "Premium Canva Templates",
          "Custom Template Selection",
          "Cover Letter Included",
          "LinkedIn Optimization",
          "3 Revisions",
          "Multiple Export Formats",
        ],
      },
      executive: {
        name: "AI Resume - Executive Package",
        description:
          "Luxury executive package with premium design, 1-on-1 consultation, and unlimited revisions.",
        price: 9900, // $99.00
        features: [
          "Everything in Professional",
          "Luxury Executive Templates",
          "Gold Accents & Premium Design",
          "Executive Summary",
          "Advanced Graphics & Layouts",
          "Unlimited Revisions",
          "1-on-1 Consultation",
          "Priority Processing",
        ],
      },
    },
  };

  const createdProducts = {
    resume: {},
  };

  try {
    // Create Resume Products
    console.log("📝 Creating AI Resume Products...");

    for (const [packageType, packageData] of Object.entries(products.resume)) {
      console.log(`\n🎯 Creating ${packageType} package...`);

      // Create product
      const product = await stripe.products.create({
        name: packageData.name,
        description: packageData.description,
        metadata: {
          category: "ai_resume",
          package_type: packageType,
          features: JSON.stringify(packageData.features),
        },
      });

      console.log(`✅ Product created: ${product.id} - ${product.name}`);

      // Create price
      const price = await stripe.prices.create({
        unit_amount: packageData.price,
        currency: "usd",
        product: product.id,
        metadata: {
          package_type: packageType,
        },
      });

      console.log(
        `✅ Price created: ${price.id} - $${packageData.price / 100}`,
      );

      createdProducts.resume[packageType] = {
        product: product.id,
        price: price.id,
        amount: packageData.price,
      };
    }

    // Save product IDs to file
    const fs = require("fs");
    const outputFile = "stripe_products_live.json";

    fs.writeFileSync(outputFile, JSON.stringify(createdProducts, null, 2));
    console.log(`\n💾 Product IDs saved to: ${outputFile}`);

    // Display summary
    console.log("\n🎉 LIVE PRODUCTS CREATED SUCCESSFULLY!");
    console.log("\n📊 Summary:");
    console.log("┌─────────────────┬─────────────┬──────────────────────┐");
    console.log("│ Package         │ Price       │ Product ID           │");
    console.log("├─────────────────┼─────────────┼──────────────────────┤");

    for (const [packageType, data] of Object.entries(createdProducts.resume)) {
      const price = `$${data.amount / 100}`;
      console.log(
        `│ ${packageType.padEnd(15)} │ ${price.padEnd(11)} │ ${data.product.substring(0, 20)}... │`,
      );
    }

    console.log("└─────────────────┴─────────────┴──────────────────────┘");

    console.log("\n🔗 Next Steps:");
    console.log("1. ✅ Products created in your Stripe account");
    console.log("2. 🔄 Restart your backend server");
    console.log("3. 🧪 Test payments with real cards");
    console.log(
      "4. 📊 View in Stripe Dashboard: https://dashboard.stripe.com/products",
    );

    return createdProducts;
  } catch (error) {
    console.error("❌ Error creating products:", error.message);

    if (error.code === "api_key_invalid") {
      console.log("\n🔑 Check your Stripe API key in .env file");
      console.log(
        "💡 Make sure you're using the correct live key: sk_live_...",
      );
    }

    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createLiveProducts()
    .then(() => {
      console.log("\n🚀 Done! Your live products are ready for customers.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Failed to create products:", error);
      process.exit(1);
    });
}

module.exports = { createLiveProducts };
