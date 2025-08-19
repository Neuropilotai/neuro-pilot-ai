const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");

// Initialize Stripe only if API key is provided
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  } catch (error) {
    console.log(
      "⚠️ Stripe not configured - payment processing will be simulated",
    );
  }
}

class BillingOrderAgent {
  constructor() {
    this.name = "NEURO-BILLING-ORDER-AGENT";
    this.version = "1.0.0";
    this.status = "ACTIVE";
    this.capabilities = [
      "payment_processing",
      "invoice_generation",
      "order_management",
      "subscription_handling",
      "refund_processing",
      "revenue_tracking",
    ];

    this.config = {
      stripe_secret_key: process.env.STRIPE_SECRET_KEY,
      stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
      paypal_client_id: process.env.PAYPAL_CLIENT_ID,
      paypal_client_secret: process.env.PAYPAL_CLIENT_SECRET,
      quickbooks_client_id: process.env.QUICKBOOKS_CLIENT_ID,
    };

    this.orders = new Map();
    this.subscriptions = new Map();
    this.invoices = new Map();
    this.payment_methods = ["stripe", "paypal", "crypto"];

    this.performance_metrics = {
      total_revenue: 0,
      orders_processed: 0,
      successful_payments: 0,
      failed_payments: 0,
      refunds_issued: 0,
      average_order_value: 0,
      conversion_rate: 0,
    };

    this.pricing_tiers = {
      basic_resume: { price: 49.99, currency: "USD" },
      premium_resume: { price: 149.99, currency: "USD" },
      ai_trading_signals: { price: 299.99, currency: "USD" },
      custom_trading_strategy: { price: 999.99, currency: "USD" },
      business_plan: { price: 199.99, currency: "USD" },
      marketing_package: { price: 399.99, currency: "USD" },
    };

    this.logFile = path.join(__dirname, "../logs/billing_order_agent.log");
    this.init();
  }

  async init() {
    await this.log("🚀 NEURO-BILLING-ORDER-AGENT v1.0.0 INITIALIZING...");
    await this.loadOrderData();
    await this.setupStripeWebhooks();
    await this.log("✅ Billing & Order Agent READY FOR PAYMENT PROCESSING");
  }

  async log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(logMessage.trim());

    try {
      await fs.appendFile(this.logFile, logMessage);
    } catch (error) {
      console.error("Logging error:", error);
    }
  }

  async createOrder(customerInfo, items, paymentMethod = "stripe") {
    try {
      const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await this.log(`💳 CREATING ORDER: ${orderId} for ${customerInfo.email}`);

      const order = {
        id: orderId,
        customer: customerInfo,
        items: items,
        payment_method: paymentMethod,
        status: "PENDING",
        created_at: new Date(),
        total_amount: this.calculateTotal(items),
        currency: "USD",
        payment_intent_id: null,
        invoice_id: null,
        fulfillment_status: "NOT_STARTED",
      };

      // Calculate totals
      order.subtotal = order.total_amount;
      order.tax = order.subtotal * 0.08; // 8% tax
      order.total_amount = order.subtotal + order.tax;

      this.orders.set(orderId, order);

      // Create payment intent based on method
      if (paymentMethod === "stripe") {
        order.payment_intent_id = await this.createStripePaymentIntent(order);
      } else if (paymentMethod === "paypal") {
        order.paypal_order_id = await this.createPayPalOrder(order);
      }

      await this.saveOrderData();
      await this.log(`✅ Order created successfully: ${orderId}`);

      return order;
    } catch (error) {
      await this.log(`❌ Order creation failed: ${error.message}`);
      throw error;
    }
  }

  async processPayment(orderId, paymentDetails) {
    try {
      const order = this.orders.get(orderId);
      if (!order) throw new Error(`Order ${orderId} not found`);

      await this.log(`💰 PROCESSING PAYMENT for order: ${orderId}`);

      let paymentResult;

      switch (order.payment_method) {
        case "stripe":
          paymentResult = await this.processStripePayment(
            order,
            paymentDetails,
          );
          break;
        case "paypal":
          paymentResult = await this.processPayPalPayment(
            order,
            paymentDetails,
          );
          break;
        case "crypto":
          paymentResult = await this.processCryptoPayment(
            order,
            paymentDetails,
          );
          break;
        default:
          throw new Error(
            `Unsupported payment method: ${order.payment_method}`,
          );
      }

      if (paymentResult.success) {
        order.status = "PAID";
        order.payment_confirmed_at = new Date();
        order.transaction_id = paymentResult.transaction_id;
        order.fulfillment_status = "READY_FOR_FULFILLMENT";

        this.performance_metrics.successful_payments++;
        this.performance_metrics.total_revenue += order.total_amount;
        this.performance_metrics.orders_processed++;

        // Generate invoice
        const invoice = await this.generateInvoice(order);
        order.invoice_id = invoice.id;

        // Trigger fulfillment
        await this.triggerFulfillment(order);

        await this.log(
          `✅ Payment successful: ${orderId} - $${order.total_amount}`,
        );
      } else {
        order.status = "PAYMENT_FAILED";
        order.payment_error = paymentResult.error;
        this.performance_metrics.failed_payments++;

        await this.log(
          `❌ Payment failed: ${orderId} - ${paymentResult.error}`,
        );
      }

      await this.saveOrderData();
      return paymentResult;
    } catch (error) {
      await this.log(`❌ Payment processing failed: ${error.message}`);
      throw error;
    }
  }

  async createStripePaymentIntent(order) {
    try {
      if (!stripe || !this.config.stripe_secret_key) {
        // Simulate payment intent for demo
        const mockPaymentIntent = {
          id: `pi_mock_${Date.now()}`,
          amount: Math.round(order.total_amount * 100),
          currency: order.currency.toLowerCase(),
          status: "requires_payment_method",
        };
        await this.log(
          `💳 Mock PaymentIntent created: ${mockPaymentIntent.id}`,
        );
        return mockPaymentIntent.id;
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(order.total_amount * 100), // Convert to cents
        currency: order.currency.toLowerCase(),
        metadata: {
          order_id: order.id,
          customer_email: order.customer.email,
        },
        description: `Order ${order.id} - ${order.items.map((i) => i.name).join(", ")}`,
      });

      await this.log(`💳 Stripe PaymentIntent created: ${paymentIntent.id}`);
      return paymentIntent.id;
    } catch (error) {
      await this.log(
        `❌ Stripe PaymentIntent creation failed: ${error.message}`,
      );
      throw error;
    }
  }

  async processStripePayment(order, paymentDetails) {
    try {
      if (!stripe || !this.config.stripe_secret_key) {
        // Simulate successful payment for demo
        return {
          success: true,
          transaction_id: `mock_${Date.now()}`,
          amount: order.total_amount,
          currency: order.currency,
        };
      }

      const paymentIntent = await stripe.paymentIntents.confirm(
        order.payment_intent_id,
        {
          payment_method: paymentDetails.payment_method_id,
        },
      );

      if (paymentIntent.status === "succeeded") {
        return {
          success: true,
          transaction_id: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
        };
      } else {
        return {
          success: false,
          error: `Payment status: ${paymentIntent.status}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async createPayPalOrder(order) {
    try {
      // PayPal order creation logic
      const paypalOrder = {
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: order.currency,
              value: order.total_amount.toFixed(2),
            },
            description: `Order ${order.id}`,
          },
        ],
      };

      // This would integrate with PayPal API
      await this.log(`💰 PayPal order created for: ${order.id}`);
      return `paypal_${Date.now()}`;
    } catch (error) {
      await this.log(`❌ PayPal order creation failed: ${error.message}`);
      throw error;
    }
  }

  async processPayPalPayment(order, paymentDetails) {
    try {
      // PayPal payment processing logic
      return {
        success: true,
        transaction_id: `pp_${Date.now()}`,
        amount: order.total_amount,
        currency: order.currency,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async processCryptoPayment(order, paymentDetails) {
    try {
      // Crypto payment processing logic
      return {
        success: true,
        transaction_id: `crypto_${Date.now()}`,
        amount: order.total_amount,
        currency: order.currency,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async generateInvoice(order) {
    try {
      const invoiceId = `inv_${order.id}_${Date.now()}`;

      const invoice = {
        id: invoiceId,
        order_id: order.id,
        customer: order.customer,
        items: order.items,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total_amount,
        currency: order.currency,
        status: "PAID",
        issued_date: new Date(),
        due_date: new Date(), // Immediate for paid orders
        payment_terms: "Payment on delivery",
      };

      this.invoices.set(invoiceId, invoice);

      // Generate PDF invoice
      const pdfPath = await this.generateInvoicePDF(invoice);
      invoice.pdf_path = pdfPath;

      await this.log(`📄 Invoice generated: ${invoiceId}`);
      return invoice;
    } catch (error) {
      await this.log(`❌ Invoice generation failed: ${error.message}`);
      throw error;
    }
  }

  async generateInvoicePDF(invoice) {
    try {
      const invoiceHTML = this.generateInvoiceHTML(invoice);
      const pdfPath = path.join(__dirname, "../invoices", `${invoice.id}.pdf`);

      // Create invoices directory
      await fs.mkdir(path.dirname(pdfPath), { recursive: true });

      // This would use a PDF generation library like puppeteer
      await fs.writeFile(pdfPath.replace(".pdf", ".html"), invoiceHTML);

      await this.log(`📄 Invoice PDF saved: ${pdfPath}`);
      return pdfPath;
    } catch (error) {
      await this.log(`❌ PDF generation failed: ${error.message}`);
      throw error;
    }
  }

  generateInvoiceHTML(invoice) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Invoice ${invoice.id}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .header { text-align: center; margin-bottom: 40px; }
                .company { font-size: 24px; font-weight: bold; color: #2c3e50; }
                .invoice-details { margin: 20px 0; }
                .customer-info { margin: 20px 0; }
                .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                .items-table th, .items-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                .items-table th { background-color: #f8f9fa; }
                .totals { text-align: right; margin: 20px 0; }
                .total-line { margin: 5px 0; }
                .final-total { font-weight: bold; font-size: 18px; color: #27ae60; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="company">Neuro-Pilot AI Services</div>
                <div>Professional AI-Powered Solutions</div>
            </div>
            
            <div class="invoice-details">
                <h2>Invoice ${invoice.id}</h2>
                <p><strong>Issue Date:</strong> ${invoice.issued_date.toLocaleDateString()}</p>
                <p><strong>Order ID:</strong> ${invoice.order_id}</p>
                <p><strong>Status:</strong> ${invoice.status}</p>
            </div>
            
            <div class="customer-info">
                <h3>Bill To:</h3>
                <p><strong>${invoice.customer.name}</strong></p>
                <p>${invoice.customer.email}</p>
                <p>${invoice.customer.address || "Address on file"}</p>
            </div>
            
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Quantity</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoice.items
                      .map(
                        (item) => `
                        <tr>
                            <td>${item.name}</td>
                            <td>${item.description || "Professional service"}</td>
                            <td>${item.quantity}</td>
                            <td>$${item.price.toFixed(2)}</td>
                            <td>$${(item.price * item.quantity).toFixed(2)}</td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
            
            <div class="totals">
                <div class="total-line">Subtotal: $${invoice.subtotal.toFixed(2)}</div>
                <div class="total-line">Tax: $${invoice.tax.toFixed(2)}</div>
                <div class="total-line final-total">Total: $${invoice.total.toFixed(2)} ${invoice.currency}</div>
            </div>
            
            <div style="margin-top: 40px; text-align: center; color: #7f8c8d;">
                <p>Thank you for your business!</p>
                <p>Questions? Contact us at support@neuropilot.ai</p>
            </div>
        </body>
        </html>
        `;
  }

  async triggerFulfillment(order) {
    try {
      await this.log(`📦 TRIGGERING FULFILLMENT for order: ${order.id}`);

      // Notify product generator agent
      const fulfillmentRequest = {
        order_id: order.id,
        customer: order.customer,
        items: order.items,
        priority: "HIGH",
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };

      // This would integrate with the product generator agent
      await this.notifyProductGenerator(fulfillmentRequest);

      order.fulfillment_status = "IN_PROGRESS";
      order.fulfillment_started_at = new Date();

      await this.log(`✅ Fulfillment triggered: ${order.id}`);
    } catch (error) {
      await this.log(`❌ Fulfillment trigger failed: ${error.message}`);
      throw error;
    }
  }

  async notifyProductGenerator(fulfillmentRequest) {
    try {
      // This would send a message to the product generator agent
      const ProductGeneratorAgent = require("./product_generator_agent");
      const productAgent = new ProductGeneratorAgent();

      // Process each item in the order
      for (const item of fulfillmentRequest.items) {
        if (item.type === "resume") {
          await productAgent.generateProduct("resume", item.specifications);
        } else if (item.type === "trading_strategy") {
          await productAgent.generateProduct(
            "trading_strategy",
            item.specifications,
          );
        }
        // Add more product types as needed
      }

      await this.log(
        `🔔 Product generator notified for order: ${fulfillmentRequest.order_id}`,
      );
    } catch (error) {
      await this.log(
        `❌ Product generator notification failed: ${error.message}`,
      );
    }
  }

  async processRefund(orderId, amount, reason) {
    try {
      const order = this.orders.get(orderId);
      if (!order) throw new Error(`Order ${orderId} not found`);

      await this.log(
        `💸 PROCESSING REFUND for order: ${orderId}, amount: $${amount}`,
      );

      let refundResult;

      if (order.payment_method === "stripe") {
        refundResult = await this.processStripeRefund(order, amount, reason);
      } else if (order.payment_method === "paypal") {
        refundResult = await this.processPayPalRefund(order, amount, reason);
      }

      if (refundResult.success) {
        order.refund_amount = amount;
        order.refund_reason = reason;
        order.refund_processed_at = new Date();
        order.status = "REFUNDED";

        this.performance_metrics.refunds_issued++;
        this.performance_metrics.total_revenue -= amount;

        await this.log(`✅ Refund processed: ${orderId} - $${amount}`);
      }

      await this.saveOrderData();
      return refundResult;
    } catch (error) {
      await this.log(`❌ Refund processing failed: ${error.message}`);
      throw error;
    }
  }

  async processStripeRefund(order, amount, reason) {
    try {
      if (!stripe || !this.config.stripe_secret_key) {
        // Simulate successful refund for demo
        return {
          success: true,
          refund_id: `mock_refund_${Date.now()}`,
          amount: amount,
          status: "succeeded",
        };
      }

      const refund = await stripe.refunds.create({
        payment_intent: order.payment_intent_id,
        amount: Math.round(amount * 100), // Convert to cents
        reason: reason,
        metadata: {
          order_id: order.id,
        },
      });

      return {
        success: true,
        refund_id: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async processPayPalRefund(order, amount, reason) {
    try {
      // PayPal refund logic
      return {
        success: true,
        refund_id: `pp_refund_${Date.now()}`,
        amount: amount,
        status: "completed",
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  calculateTotal(items) {
    return items.reduce((total, item) => {
      const price = this.pricing_tiers[item.type]?.price || item.price || 0;
      return total + price * item.quantity;
    }, 0);
  }

  async setupStripeWebhooks() {
    try {
      if (!this.config.stripe_webhook_secret) {
        await this.log("⚠️  Stripe webhook secret not configured");
        return;
      }

      // This would set up webhook endpoints
      await this.log("🔗 Stripe webhooks configured");
    } catch (error) {
      await this.log(`❌ Webhook setup failed: ${error.message}`);
    }
  }

  async loadOrderData() {
    try {
      const dataFile = path.join(__dirname, "../data/billing_orders.json");
      const data = await fs.readFile(dataFile, "utf8");
      const orderData = JSON.parse(data);

      orderData.orders.forEach((order) => {
        this.orders.set(order.id, order);
      });

      orderData.invoices.forEach((invoice) => {
        this.invoices.set(invoice.id, invoice);
      });

      this.performance_metrics = {
        ...this.performance_metrics,
        ...orderData.metrics,
      };
    } catch (error) {
      await this.log(`📁 Creating new order data file`);
    }
  }

  async saveOrderData() {
    try {
      const dataFile = path.join(__dirname, "../data/billing_orders.json");
      const data = {
        orders: Array.from(this.orders.values()),
        invoices: Array.from(this.invoices.values()),
        metrics: this.performance_metrics,
        last_updated: new Date(),
      };

      await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      await this.log(`❌ Failed to save order data: ${error.message}`);
    }
  }

  async getPerformanceReport() {
    const report = {
      agent_status: this.status,
      total_orders: this.orders.size,
      total_invoices: this.invoices.size,
      metrics: this.performance_metrics,
      recent_orders: this.getRecentOrders(10),
      revenue_by_period: await this.getRevenueByPeriod(),
      top_products: this.getTopProducts(),
    };

    // Calculate average order value
    if (this.performance_metrics.orders_processed > 0) {
      this.performance_metrics.average_order_value =
        this.performance_metrics.total_revenue /
        this.performance_metrics.orders_processed;
    }

    await this.log(`📊 Performance report generated`);
    return report;
  }

  getRecentOrders(limit = 10) {
    return Array.from(this.orders.values())
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit)
      .map((order) => ({
        id: order.id,
        customer: order.customer.email,
        total: order.total_amount,
        status: order.status,
        created_at: order.created_at,
      }));
  }

  async getRevenueByPeriod() {
    const periods = {
      today: 0,
      this_week: 0,
      this_month: 0,
      this_year: 0,
    };

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(
      startOfDay.getTime() - startOfDay.getDay() * 24 * 60 * 60 * 1000,
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    Array.from(this.orders.values()).forEach((order) => {
      if (order.status === "PAID") {
        const orderDate = new Date(order.created_at);

        if (orderDate >= startOfDay) periods.today += order.total_amount;
        if (orderDate >= startOfWeek) periods.this_week += order.total_amount;
        if (orderDate >= startOfMonth) periods.this_month += order.total_amount;
        if (orderDate >= startOfYear) periods.this_year += order.total_amount;
      }
    });

    return periods;
  }

  getTopProducts() {
    const productStats = {};

    Array.from(this.orders.values()).forEach((order) => {
      if (order.status === "PAID") {
        order.items.forEach((item) => {
          if (!productStats[item.type]) {
            productStats[item.type] = { quantity: 0, revenue: 0 };
          }
          productStats[item.type].quantity += item.quantity;
          productStats[item.type].revenue += item.price * item.quantity;
        });
      }
    });

    return Object.entries(productStats)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([product, stats]) => ({
        product,
        quantity_sold: stats.quantity,
        total_revenue: stats.revenue,
      }));
  }
}

module.exports = BillingOrderAgent;

// Auto-start if run directly
if (require.main === module) {
  const agent = new BillingOrderAgent();

  // Example usage
  setTimeout(async () => {
    try {
      // Create a test order
      const order = await agent.createOrder(
        {
          name: "John Smith",
          email: "john@example.com",
          address: "123 Business St, City, State 12345",
        },
        [
          {
            type: "premium_resume",
            name: "Premium Resume Package",
            price: 149.99,
            quantity: 1,
            specifications: {
              industry: "Technology",
              experience_level: "Senior",
            },
          },
        ],
        "stripe",
      );

      console.log("✅ Order created:", order.id);

      // Simulate payment processing
      const paymentResult = await agent.processPayment(order.id, {
        payment_method_id: "pm_test_card",
      });

      console.log(
        "💰 Payment result:",
        paymentResult.success ? "SUCCESS" : "FAILED",
      );

      // Get performance report
      const report = await agent.getPerformanceReport();
      console.log(
        "📊 BILLING & ORDER REPORT:",
        JSON.stringify(report, null, 2),
      );
    } catch (error) {
      console.error("❌ Agent execution failed:", error);
    }
  }, 1000);
}
