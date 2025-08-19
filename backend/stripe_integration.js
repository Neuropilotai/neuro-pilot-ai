const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

class StripeIntegration {
  constructor() {
    this.stripe = stripe;
  }

  async createResumeCheckout(packageType, customerEmail, customerData) {
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
        description: "Premium package with 30-day revision guarantee",
      },
    };

    const pkg = packages[packageType];
    if (!pkg) throw new Error("Invalid package type");

    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
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
        ],
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/cancel`,
        customer_email: customerEmail,
        allow_promotion_codes: true, // Allow discount codes
        metadata: {
          service: "resume",
          package: packageType,
          customer_name: customerData.name || "",
          target_role: customerData.targetRole || "",
        },
      });

      return session;
    } catch (error) {
      console.error("Stripe checkout error:", error);
      throw error;
    }
  }

  async createTradingSubscription(plan, customerEmail, customerData) {
    const plans = {
      basic: {
        name: "AI Trading Signals - Basic Plan",
        price: 4900, // $49.00/month
        description: "Daily AI trading signals for major stocks",
      },
      premium: {
        name: "AI Trading Signals - Premium Plan",
        price: 9900, // $99.00/month
        description: "Real-time signals with advanced analytics",
      },
      pro: {
        name: "AI Trading Signals - Pro Plan",
        price: 19900, // $199.00/month
        description: "Professional package with custom strategies",
      },
    };

    const selectedPlan = plans[plan];
    if (!selectedPlan) throw new Error("Invalid plan type");

    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: selectedPlan.name,
                description: selectedPlan.description,
              },
              unit_amount: selectedPlan.price,
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/cancel`,
        customer_email: customerEmail,
        allow_promotion_codes: true,
        metadata: {
          service: "trading",
          plan: plan,
          customer_name: customerData.name || "",
        },
      });

      return session;
    } catch (error) {
      console.error("Stripe subscription error:", error);
      throw error;
    }
  }

  async retrieveSession(sessionId) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      return session;
    } catch (error) {
      console.error("Error retrieving session:", error);
      throw error;
    }
  }

  async createPromotionCodes() {
    try {
      // Create 20% off coupon for trading
      const tradingCoupon = await this.stripe.coupons.create({
        percent_off: 20,
        duration: "once",
        name: "Launch Special - 20% Off First Month",
      });

      // Create $10 off coupon for resumes
      const resumeCoupon = await this.stripe.coupons.create({
        amount_off: 1000, // $10.00 in cents
        currency: "usd",
        duration: "once",
        name: "Launch Special - $10 Off Resume",
      });

      // Create promotion codes
      await this.stripe.promotionCodes.create({
        coupon: tradingCoupon.id,
        code: "LAUNCH20",
      });

      await this.stripe.promotionCodes.create({
        coupon: resumeCoupon.id,
        code: "SAVE10",
      });

      console.log("✅ Promotion codes created: LAUNCH20, SAVE10");
      return { tradingCoupon, resumeCoupon };
    } catch (error) {
      console.error("Error creating promotion codes:", error);
      // Don't throw - promotion codes are optional
    }
  }
}

module.exports = StripeIntegration;
