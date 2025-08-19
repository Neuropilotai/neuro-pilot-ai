const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const fs = require("fs");

class StripePayments {
  constructor() {
    this.stripe = stripe;

    // Load product IDs
    try {
      this.productIds = JSON.parse(
        fs.readFileSync("stripe_products.json", "utf8"),
      );
    } catch (error) {
      console.warn(
        "⚠️ stripe_products.json not found. Using price creation method.",
      );
      this.productIds = null;
    }
  }

  // Create checkout session using pre-created products
  async createResumeCheckout(packageType, customerEmail, customerData = {}) {
    try {
      let lineItems;

      if (this.productIds && this.productIds.resume[packageType]) {
        // Use pre-created products
        const priceId = this.productIds.resume[packageType].price;
        lineItems = [
          {
            price: priceId,
            quantity: 1,
          },
        ];
      } else {
        // Fallback to dynamic price creation
        const packages = {
          basic: { name: "AI Resume - Basic", price: 2900 },
          professional: { name: "AI Resume - Professional", price: 5900 },
          executive: { name: "AI Resume - Executive", price: 9900 },
        };

        const pkg = packages[packageType];
        lineItems = [
          {
            price_data: {
              currency: "usd",
              product_data: { name: pkg.name },
              unit_amount: pkg.price,
            },
            quantity: 1,
          },
        ];
      }

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/cancel`,
        customer_email: customerEmail,
        allow_promotion_codes: true, // Allow discount codes
        payment_intent_data: {
          metadata: {
            service: "resume",
            package: packageType,
            customer_name: customerData.name || "",
            job_title: customerData.jobTitle || "",
            timestamp: new Date().toISOString(),
          },
        },
        metadata: {
          service: "resume",
          package: packageType,
          customer_name: customerData.name || "",
        },
      });

      return session;
    } catch (error) {
      console.error("Stripe checkout error:", error);
      throw error;
    }
  }

  async createTradingSubscription(customerEmail, plan = "premium") {
    try {
      let lineItems;

      if (this.productIds && this.productIds.trading[plan]) {
        // Use pre-created products
        const priceId = this.productIds.trading[plan].price;
        lineItems = [
          {
            price: priceId,
            quantity: 1,
          },
        ];
      } else {
        // Fallback to dynamic price creation
        const plans = {
          basic: { name: "AI Trading Signals - Basic", price: 4900 },
          premium: { name: "AI Trading Signals - Premium", price: 9900 },
          pro: { name: "AI Trading Signals - Pro", price: 19900 },
        };

        const selectedPlan = plans[plan];
        lineItems = [
          {
            price_data: {
              currency: "usd",
              product_data: { name: selectedPlan.name },
              unit_amount: selectedPlan.price,
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ];
      }

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "subscription",
        success_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/cancel`,
        customer_email: customerEmail,
        allow_promotion_codes: true,
        subscription_data: {
          metadata: {
            service: "trading",
            plan: plan,
            timestamp: new Date().toISOString(),
          },
        },
      });

      return session;
    } catch (error) {
      console.error("Stripe subscription error:", error);
      throw error;
    }
  }

  // Create discount codes
  async createPromotionCode(couponId, code) {
    try {
      const promotionCode = await this.stripe.promotionCodes.create({
        coupon: couponId,
        code: code,
        active: true,
        max_redemptions: 100,
        metadata: {
          campaign: "launch_special",
        },
      });

      return promotionCode;
    } catch (error) {
      console.error("Error creating promotion code:", error);
      throw error;
    }
  }

  // Create launch discount coupons
  async createLaunchDiscounts() {
    try {
      // 20% off first month for trading
      const tradingCoupon = await this.stripe.coupons.create({
        percent_off: 20,
        duration: "once",
        name: "Launch Special - 20% Off Trading Signals",
        metadata: {
          campaign: "launch",
        },
      });

      // $10 off resume packages
      const resumeCoupon = await this.stripe.coupons.create({
        amount_off: 1000, // $10.00 in cents
        currency: "usd",
        duration: "once",
        name: "Launch Special - $10 Off Resumes",
        metadata: {
          campaign: "launch",
        },
      });

      // Create promotion codes
      await this.createPromotionCode(tradingCoupon.id, "LAUNCH20");
      await this.createPromotionCode(resumeCoupon.id, "SAVE10");

      console.log("✅ Launch discount codes created:");
      console.log("  - LAUNCH20: 20% off trading signals");
      console.log("  - SAVE10: $10 off resume packages");

      return { tradingCoupon, resumeCoupon };
    } catch (error) {
      console.error("Error creating launch discounts:", error);
      throw error;
    }
  }
}

module.exports = StripePayments;
