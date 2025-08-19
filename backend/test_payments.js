const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

async function testPayments() {
  console.log("💳 Testing Stripe Payment Integration...\n");

  const baseUrl = "http://localhost:8000";

  try {
    // Test 1: Create resume payment checkout
    console.log("1. Testing Resume Payment Checkout...");
    const resumePayment = {
      customerEmail: "test@example.com",
      packageType: "professional",
    };

    const resumeResponse = await fetch(
      `${baseUrl}/api/payments/resume-checkout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resumePayment),
      },
    );

    const resumeResult = await resumeResponse.json();
    console.log(
      "✅ Resume Checkout:",
      resumeResult.status === "success" ? "SUCCESS" : "FAILED",
    );
    if (resumeResult.checkout_url) {
      console.log("   Checkout URL:", resumeResult.checkout_url);
    }

    // Test 2: Create trading subscription
    console.log("\n2. Testing Trading Subscription...");
    const subscriptionData = {
      customerEmail: "trader@example.com",
    };

    const subResponse = await fetch(
      `${baseUrl}/api/payments/trading-subscription`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscriptionData),
      },
    );

    const subResult = await subResponse.json();
    console.log(
      "✅ Trading Subscription:",
      subResult.status === "success" ? "SUCCESS" : "FAILED",
    );
    if (subResult.checkout_url) {
      console.log("   Subscription URL:", subResult.checkout_url);
    }

    console.log("\n🎉 Payment Integration Tests Completed!");
    console.log("\n📋 Setup Instructions:");
    console.log("1. Get Stripe API keys from dashboard.stripe.com");
    console.log("2. Add keys to .env file:");
    console.log("   STRIPE_SECRET_KEY=sk_test_...");
    console.log("   STRIPE_PUBLISHABLE_KEY=pk_test_...");
    console.log("   STRIPE_WEBHOOK_SECRET=whsec_...");
    console.log("3. Restart server to load new environment variables");
  } catch (error) {
    console.error("❌ Payment Test Error:", error.message);

    if (error.message.includes("No such api_key")) {
      console.log("\n💡 Stripe API key not configured. Add to .env:");
      console.log("   STRIPE_SECRET_KEY=sk_test_your_key_here");
    }
  }
}

testPayments();
