require("dotenv").config();
const EmailOrderSystem = require("./email_order_system");

async function sendOrderEmailToDavid() {
  const emailSystem = new EmailOrderSystem();

  console.log("🚀 Sending order form email to david.mikulis@sodexo.com...");

  try {
    const result = await emailSystem.sendOrderFormEmail(
      "david.mikulis@sodexo.com",
      "David Mikulis",
    );

    if (result.success) {
      console.log("✅ Email sent successfully!");
      console.log("📧 Message ID:", result.messageId);
      console.log("🆔 Order ID:", result.orderId);
      console.log("\n📝 Next steps:");
      console.log("1. Check your email at david.mikulis@sodexo.com");
      console.log("2. Click the order form link in the email");
      console.log("3. Fill out your job details");
      console.log(
        "4. Upload your current resume (or reply to the email with it attached)",
      );
      console.log("5. The AI will process your resume automatically!");

      // Save order ID for tracking
      const fs = require("fs").promises;
      await fs.writeFile(
        "./pending_order.json",
        JSON.stringify(
          {
            orderId: result.orderId,
            email: "david.mikulis@sodexo.com",
            name: "David Mikulis",
            status: "email_sent",
            sentAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );

      console.log("\n✅ Order tracking file created: pending_order.json");
    } else {
      console.error("❌ Failed to send email:", result.error);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.log("\n📌 Make sure to set up your email credentials:");
    console.log("EMAIL_USER=your-email@gmail.com");
    console.log("EMAIL_PASS=your-app-password");
  }
}

// Run the test
sendOrderEmailToDavid();
