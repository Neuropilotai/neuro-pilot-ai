const nodemailer = require("nodemailer");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

class EmailOrderSystem {
  constructor() {
    // Configure email transporter
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER || "your-email@gmail.com",
        pass: process.env.EMAIL_PASS || "your-app-password",
      },
    });

    this.orderFormUrl =
      process.env.ORDER_FORM_URL ||
      "https://0122-23-233-176-252.ngrok-free.app/order-form.html";
  }

  // Send initial order form email to customer
  async sendOrderFormEmail(customerEmail, customerName = "") {
    const uniqueOrderId = crypto.randomBytes(16).toString("hex");
    const personalizedUrl = `${this.orderFormUrl}?email=${encodeURIComponent(customerEmail)}&orderId=${uniqueOrderId}`;

    const emailTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; padding: 12px 30px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .packages { margin: 20px 0; }
        .package { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border: 1px solid #ddd; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Neuro.Pilot.AI</h1>
            <p>Your AI-Powered Resume Builder</p>
        </div>
        <div class="content">
            <h2>Hello ${customerName || "there"}!</h2>
            
            <p>Thank you for your interest in our AI Resume Generation service. We're excited to help you create a professional resume that stands out!</p>
            
            <h3>Our Packages:</h3>
            <div class="packages">
                <div class="package">
                    <h4>📄 Basic Package - $29</h4>
                    <p>Professional AI-generated resume with ATS optimization</p>
                </div>
                <div class="package">
                    <h4>💼 Professional Package - $59</h4>
                    <p>Resume + Cover Letter + LinkedIn profile optimization</p>
                </div>
                <div class="package">
                    <h4>🏆 Executive Package - $99</h4>
                    <p>Premium package with 30-day revision guarantee</p>
                </div>
            </div>
            
            <p><strong>Ready to get started?</strong> Click the button below to complete your order form:</p>
            
            <div style="text-align: center;">
                <a href="${personalizedUrl}" class="button">Complete Order Form</a>
            </div>
            
            <p><strong>What happens next?</strong></p>
            <ul>
                <li>Fill out the order form with your job details</li>
                <li>Upload your current resume (optional)</li>
                <li>Select your package and complete payment</li>
                <li>Our 4 AI agents will create your optimized resume within 24-48 hours</li>
            </ul>
            
            <p><strong>Need to attach your resume?</strong><br>
            You can upload your current resume directly in the order form, or reply to this email with your resume attached and we'll include it in your order.</p>
            
            <p>Questions? Feel free to reply to this email or contact us at support@neuropilot-ai.com</p>
        </div>
        <div class="footer">
            <p>© 2025 Neuro.Pilot.AI - Powered by Advanced AI Technology</p>
            <p>This email was sent to ${customerEmail}</p>
        </div>
    </div>
</body>
</html>
        `;

    const mailOptions = {
      from: '"Neuro.Pilot.AI" <noreply@neuropilot-ai.com>',
      to: customerEmail,
      subject: "Your AI Resume Order - Neuro.Pilot.AI",
      html: emailTemplate,
      text: `Welcome to Neuro.Pilot.AI!\n\nComplete your order here: ${personalizedUrl}\n\nOur packages:\n- Basic ($29): AI-generated resume with ATS optimization\n- Professional ($59): Resume + Cover Letter + LinkedIn\n- Executive ($99): Premium with 30-day guarantee\n\nReply with your resume attached if needed!`,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log("Order form email sent:", info.messageId);
      return {
        success: true,
        messageId: info.messageId,
        orderId: uniqueOrderId,
      };
    } catch (error) {
      console.error("Email send error:", error);
      return { success: false, error: error.message };
    }
  }

  // Send order confirmation with details
  async sendOrderConfirmation(orderData, attachmentPath = null) {
    const confirmationTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .order-details { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; border: 1px solid #ddd; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        .status { background: #e8f5e9; padding: 10px; border-radius: 5px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Order Confirmation</h1>
            <p>Thank you for your order!</p>
        </div>
        <div class="content">
            <h2>Hi ${orderData.firstName || orderData.fullName || "there"}!</h2>
            
            <div class="status">
                <strong>✅ Order Received!</strong><br>
                Order ID: ${orderData.orderId || "AI-" + Date.now()}
            </div>
            
            <p>We've received your order and our AI agents are ready to create your professional resume.</p>
            
            <div class="order-details">
                <h3>Order Details:</h3>
                <p><strong>Package:</strong> ${(orderData.packageType || orderData.package || "professional").charAt(0).toUpperCase() + (orderData.packageType || orderData.package || "professional").slice(1)}</p>
                <p><strong>Final Price:</strong> $${orderData.finalPrice || 0}</p>
                ${orderData.originalPrice !== orderData.finalPrice ? `<p><strong>Original Price:</strong> $${orderData.originalPrice || 0}</p>` : ""}
                ${orderData.promoCode ? `<p><strong>Promo Code Applied:</strong> ${orderData.promoCode} (${orderData.discountAmount ? "$" + orderData.discountAmount : ""})</p>` : ""}
                <p><strong>Target Role:</strong> ${orderData.jobTitle || orderData.targetRole || "Professional Role"}</p>
                <p><strong>Industry:</strong> ${orderData.targetIndustry || orderData.industry || "Various"}</p>
                <p><strong>Experience:</strong> ${orderData.careerLevel || orderData.experience || "Professional"}</p>
                ${orderData.skills ? `<p><strong>Key Skills:</strong> ${orderData.skills}</p>` : ""}
                ${attachmentPath ? "<p><strong>Resume Uploaded:</strong> ✅ We received your current resume</p>" : ""}
            </div>
            
            <h3>What's Next?</h3>
            <ol>
                <li>Our 4 specialized AI agents will analyze your information</li>
                <li>They'll create a tailored resume optimized for your target role</li>
                <li>You'll receive your completed resume within 24-48 hours</li>
                <li>We'll email you the final files (PDF & Word formats)</li>
            </ol>
            
            <p><strong>Need to make changes?</strong><br>
            Reply to this email within the next 2 hours if you need to update any information.</p>
            
            <p>Thank you for choosing Neuro.Pilot.AI!</p>
        </div>
        <div class="footer">
            <p>© 2025 Neuro.Pilot.AI - Your Success is Our Mission</p>
            <p>Order confirmation sent to ${orderData.email}</p>
        </div>
    </div>
</body>
</html>
        `;

    const mailOptions = {
      from: '"Neuro.Pilot.AI" <noreply@neuropilot-ai.com>',
      to: orderData.email,
      subject: `Order Confirmation #${orderData.orderId || "AI-" + Date.now()} - Neuro.Pilot.AI`,
      html: confirmationTemplate,
      text: `Order Confirmation\n\nHi ${orderData.firstName || orderData.fullName || "there"}!\n\nWe've received your order for the ${orderData.packageType || "professional"} package.\n\nTarget Role: ${orderData.jobTitle || "Professional Role"}\nIndustry: ${orderData.targetIndustry || "Various"}\nFinal Price: $${orderData.finalPrice || 0}\n\nYour AI-optimized resume will be delivered within 24-48 hours.\n\nThank you for choosing Neuro.Pilot.AI!`,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log("Confirmation email sent:", info.messageId);

      // Save order to database
      await this.saveOrder(orderData, attachmentPath);

      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("Confirmation email error:", error);
      return { success: false, error: error.message };
    }
  }

  // Handle email with resume attachment
  async processEmailWithAttachment(email, attachment) {
    try {
      // Save attachment
      const uploadsDir = path.join(__dirname, "../uploads");
      await fs.mkdir(uploadsDir, { recursive: true });

      const filename = `resume_${Date.now()}_${attachment.filename}`;
      const filepath = path.join(uploadsDir, filename);

      await fs.writeFile(filepath, attachment.content);

      console.log(`Resume saved: ${filename}`);
      return { success: true, filepath, filename };
    } catch (error) {
      console.error("Attachment processing error:", error);
      return { success: false, error: error.message };
    }
  }

  // Save order to database
  async saveOrder(orderData, attachmentPath) {
    const ordersDir = path.join(__dirname, "../orders");
    await fs.mkdir(ordersDir, { recursive: true });

    const orderFile = path.join(
      ordersDir,
      `order_${orderData.orderId || Date.now()}.json`,
    );
    const orderRecord = {
      ...orderData,
      attachmentPath,
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    await fs.writeFile(orderFile, JSON.stringify(orderRecord, null, 2));
    console.log(`Order saved: ${orderFile}`);
  }

  // Send completed resume to customer
  async sendCompletedResume(
    customerEmail,
    customerName,
    resumePath,
    coverLetterPath = null,
  ) {
    const completionTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .success-box { background: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
        .tips { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; border: 1px solid #ddd; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Your Resume is Ready!</h1>
            <p>Created by our AI Expert Team</p>
        </div>
        <div class="content">
            <h2>Congratulations ${customerName}!</h2>
            
            <div class="success-box">
                <h3>🎉 Your Professional Resume is Complete!</h3>
                <p>Please find your documents attached to this email.</p>
            </div>
            
            <div class="tips">
                <h3>Quick Tips for Success:</h3>
                <ul>
                    <li><strong>Review Carefully:</strong> Check all details for accuracy</li>
                    <li><strong>Customize per Application:</strong> Tailor keywords for each job</li>
                    <li><strong>Update Regularly:</strong> Keep your resume current with new achievements</li>
                    <li><strong>Use Both Formats:</strong> PDF for applications, Word for edits</li>
                </ul>
            </div>
            
            <h3>What's Included:</h3>
            <ul>
                <li>✅ ATS-Optimized Resume (PDF & Word)</li>
                ${coverLetterPath ? "<li>✅ Customized Cover Letter Template</li>" : ""}
                <li>✅ Keyword optimization for your target role</li>
                <li>✅ Professional formatting and design</li>
            </ul>
            
            <p><strong>Need Revisions?</strong><br>
            We offer free minor revisions within 7 days. Simply reply to this email with your requested changes.</p>
            
            <p>Best of luck with your job search! We're confident your new resume will help you stand out.</p>
            
            <p>Thank you for choosing Neuro.Pilot.AI!</p>
        </div>
        <div class="footer">
            <p>© 2025 Neuro.Pilot.AI - Empowering Your Career Success</p>
            <p>Leave us a review: Share your experience to help others!</p>
        </div>
    </div>
</body>
</html>
        `;

    const attachments = [
      {
        filename: `${customerName.replace(/\s+/g, "_")}_Resume.pdf`,
        path: resumePath,
      },
    ];

    if (coverLetterPath) {
      attachments.push({
        filename: `${customerName.replace(/\s+/g, "_")}_Cover_Letter.pdf`,
        path: coverLetterPath,
      });
    }

    const mailOptions = {
      from: '"Neuro.Pilot.AI" <noreply@neuropilot-ai.com>',
      to: customerEmail,
      subject: `Your Resume is Ready! - Neuro.Pilot.AI`,
      html: completionTemplate,
      attachments: attachments,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log("Resume delivery email sent:", info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("Resume delivery error:", error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = EmailOrderSystem;
