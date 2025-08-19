// Initialize Stripe only if API key is provided
const stripe = process.env.STRIPE_SECRET_KEY
  ? require("stripe")(process.env.STRIPE_SECRET_KEY)
  : null;

class PaymentProcessor {
  constructor() {
    // Load product IDs from file (created by create_stripe_products.js)
    this.loadProductIds();
  }

  loadProductIds() {
    try {
      const fs = require("fs");
      const path = require("path");

      // Try live products first, then fall back to test products
      const liveProductFile = path.join(__dirname, "stripe_products_live.json");
      const testProductFile = path.join(__dirname, "stripe_products.json");

      if (fs.existsSync(liveProductFile)) {
        this.productIds = JSON.parse(fs.readFileSync(liveProductFile, "utf8"));
        console.log("✅ Loaded LIVE Stripe products");
      } else if (fs.existsSync(testProductFile)) {
        this.productIds = JSON.parse(fs.readFileSync(testProductFile, "utf8"));
        console.log("⚠️ Loaded TEST Stripe products");
      } else {
        // Fallback to inline prices if product file doesn't exist
        this.productIds = null;
        console.log("⚠️ No product files found, using inline pricing");
      }
    } catch (error) {
      console.warn(
        "Could not load Stripe product IDs from file, using fallback pricing",
      );
      this.productIds = null;
    }
  }

  // =================
  // SUBSCRIPTION PLANS
  // =================

  async createNeuroSubscription(customerEmail, planType = "basic") {
    if (!stripe) {
      throw new Error(
        "Stripe not configured. Please add STRIPE_SECRET_KEY to environment.",
      );
    }

    const plans = {
      basic: {
        name: "Neuro Basic",
        description: "Essential trading tools and basic AI insights",
        price: 2900, // $29.00
        features: [
          "Basic trading signals",
          "Portfolio tracking",
          "Standard support",
          "Limited API calls",
        ],
      },
      pro: {
        name: "Neuro Pro",
        description: "Advanced AI trading with enhanced features",
        price: 9900, // $99.00
        features: [
          "Advanced AI trading signals",
          "Real-time market analysis",
          "Priority support",
          "Unlimited API calls",
          "Custom indicators",
        ],
      },
      enterprise: {
        name: "Neuro Enterprise",
        description: "Full platform access with dedicated support",
        price: 29900, // $299.00
        features: [
          "All Pro features",
          "Dedicated account manager",
          "Custom integrations",
          "White-label options",
          "Advanced analytics",
        ],
      },
    };

    if (!plans[planType]) {
      throw new Error(`Invalid plan type: ${planType}`);
    }

    const plan = plans[planType];

    // Use product ID if available, otherwise create inline
    const lineItems = this.productIds?.subscriptions?.[planType]
      ? [
          {
            price: this.productIds.subscriptions[planType].price,
            quantity: 1,
          },
        ]
      : [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: plan.name,
                description: plan.description,
                metadata: {
                  features: JSON.stringify(plan.features),
                },
              },
              unit_amount: plan.price,
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "subscription",
      success_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/cancel`,
      customer_email: customerEmail,
      metadata: {
        plan_type: planType,
        product_category: "neuro_subscription",
      },
      subscription_data: {
        metadata: {
          plan_type: planType,
        },
      },
    });

    return session;
  }

  // ===================
  // ONE-TIME PURCHASES
  // ===================

  async createOneTimePurchase(customerEmail, productType) {
    if (!stripe) {
      throw new Error(
        "Stripe not configured. Please add STRIPE_SECRET_KEY to environment.",
      );
    }

    const products = {
      ai_models: {
        name: "Premium AI Models",
        description: "Access to exclusive trading algorithms",
        price: 19900, // $199.00
      },
      historical_data: {
        name: "Historical Data Package",
        description: "10 years of historical market data",
        price: 4900, // $49.00
      },
    };

    if (!products[productType]) {
      throw new Error(`Invalid product type: ${productType}`);
    }

    const product = products[productType];

    // Use product ID if available, otherwise create inline
    const lineItems = this.productIds?.one_time?.[productType]
      ? [
          {
            price: this.productIds.one_time[productType].price,
            quantity: 1,
          },
        ]
      : [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: product.name,
                description: product.description,
              },
              unit_amount: product.price,
            },
            quantity: 1,
          },
        ];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/cancel`,
      customer_email: customerEmail,
      metadata: {
        product_type: productType,
        product_category: "one_time_purchase",
      },
    });

    return session;
  }

  // ===============================
  // LEGACY RESUME ORDERS (Keep existing)
  // ===============================

  async createResumeOrder(customerEmail, packageType) {
    if (!stripe) {
      throw new Error(
        "Stripe not configured. Please add STRIPE_SECRET_KEY to environment.",
      );
    }

    const packages = {
      basic: {
        name: "AI Resume - Basic Package",
        price: 2900, // $29.00
        description: "Professional AI-generated resume with ATS optimization",
      },
      professional: {
        name: "AI Resume - Professional Package",
        price: 5900, // $59.00
        description: "Resume + Cover Letter + LinkedIn optimization",
      },
      executive: {
        name: "AI Resume - Executive Package",
        price: 9900, // $99.00
        description:
          "Premium package with resume, cover letter, LinkedIn, and 30-day revisions",
      },
    };

    if (!packages[packageType]) {
      throw new Error(`Invalid package type: ${packageType}`);
    }

    const pkg = packages[packageType];

    // Use product ID if available, otherwise create inline
    const lineItems = this.productIds?.resume?.[packageType]
      ? [
          {
            price: this.productIds.resume[packageType].price,
            quantity: 1,
          },
        ]
      : [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: pkg.name,
                description: pkg.description,
              },
              unit_amount: pkg.price,
            },
            quantity: 1,
          },
        ];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/cancel`,
      customer_email: customerEmail,
      metadata: {
        package_type: packageType,
        product_category: "resume",
      },
    });

    return session;
  }

  // Legacy method for backward compatibility
  async createTradingSubscription(customerEmail, planType = "pro") {
    return this.createNeuroSubscription(customerEmail, planType);
  }

  // =================
  // UTILITY METHODS
  // =================

  async getCustomerSubscriptions(customerEmail) {
    if (!stripe) {
      throw new Error("Stripe not configured.");
    }

    const customers = await stripe.customers.list({
      email: customerEmail,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return [];
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "active",
    });

    return subscriptions.data;
  }

  async cancelSubscription(subscriptionId) {
    if (!stripe) {
      throw new Error("Stripe not configured.");
    }

    return await stripe.subscriptions.cancel(subscriptionId);
  }

  async getPaymentHistory(customerEmail) {
    if (!stripe) {
      throw new Error("Stripe not configured.");
    }

    const customers = await stripe.customers.list({
      email: customerEmail,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return [];
    }

    const charges = await stripe.charges.list({
      customer: customers.data[0].id,
      limit: 50,
    });

    return charges.data;
  }

  // Get pricing information for frontend display
  getPricingInfo() {
    return {
      subscriptions: {
        basic: { name: "Neuro Basic", price: 29, interval: "month" },
        pro: { name: "Neuro Pro", price: 99, interval: "month" },
        enterprise: { name: "Neuro Enterprise", price: 299, interval: "month" },
      },
      one_time: {
        ai_models: { name: "Premium AI Models", price: 199 },
        historical_data: { name: "Historical Data Package", price: 49 },
      },
      resume: {
        basic: { name: "Basic Resume", price: 29 },
        professional: { name: "Professional Resume", price: 59 },
        executive: { name: "Executive Resume", price: 99 },
      },
    };
  }
}

module.exports = PaymentProcessor;
