const express = require("express");
const multer = require("multer");
const path = require("path");
const EmailOrderSystem = require("./email_order_system");
const StripeIntegration = require("./stripe_integration");

const router = express.Router();
const emailSystem = new EmailOrderSystem();
const stripeIntegration = new StripeIntegration();

// Configure file upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads");
    await require("fs").promises.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `resume_${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Only PDF, DOC, and DOCX files are allowed"));
    }
  },
});

// Send order form email to customer
router.post("/send-order-form", async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const result = await emailSystem.sendOrderFormEmail(email, name);

    if (result.success) {
      res.json({
        success: true,
        message: "Order form sent successfully",
        orderId: result.orderId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Send order form error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Create order with file upload
router.post("/create", upload.single("resume"), async (req, res) => {
  try {
    const orderData = {
      ...req.body,
      orderId: "AI-" + Date.now(),
      timestamp: new Date().toISOString(),
    };

    // If file was uploaded
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = req.file.path;
      orderData.resumeUploaded = true;
      orderData.resumePath = attachmentPath;
    }

    // Create Stripe checkout session
    const checkoutSession = await stripeIntegration.createResumeCheckout(
      orderData.package,
      orderData.email,
      {
        name: orderData.fullName,
        targetRole: orderData.targetRole,
      },
    );

    // Save order data
    await emailSystem.saveOrder(orderData, attachmentPath);

    // Send confirmation email
    await emailSystem.sendOrderConfirmation(orderData, attachmentPath);

    res.json({
      success: true,
      orderId: orderData.orderId,
      checkoutUrl: checkoutSession.url,
      message: "Order created successfully",
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Handle email with attachment (webhook for email service)
router.post("/email-attachment", async (req, res) => {
  try {
    const { from, subject, attachments } = req.body;

    if (attachments && attachments.length > 0) {
      const attachment = attachments[0];
      const result = await emailSystem.processEmailWithAttachment(
        from,
        attachment,
      );

      if (result.success) {
        // Link attachment to existing order
        // This would typically match the email to an existing order
        res.json({
          success: true,
          message: "Attachment processed",
          filename: result.filename,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } else {
      res.status(400).json({
        success: false,
        error: "No attachment found",
      });
    }
  } catch (error) {
    console.error("Email attachment error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Deliver completed resume
router.post("/deliver-resume", async (req, res) => {
  try {
    const { orderId, resumePath, coverLetterPath } = req.body;

    // Load order data
    const orderPath = path.join(
      __dirname,
      "../orders",
      `order_${orderId}.json`,
    );
    const orderData = JSON.parse(
      await require("fs").promises.readFile(orderPath, "utf8"),
    );

    // Send completed resume
    const result = await emailSystem.sendCompletedResume(
      orderData.email,
      orderData.fullName,
      resumePath,
      coverLetterPath,
    );

    if (result.success) {
      // Update order status
      orderData.status = "completed";
      orderData.completedAt = new Date().toISOString();
      await require("fs").promises.writeFile(
        orderPath,
        JSON.stringify(orderData, null, 2),
      );

      res.json({
        success: true,
        message: "Resume delivered successfully",
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Deliver resume error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get order status
router.get("/status/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderPath = path.join(
      __dirname,
      "../orders",
      `order_${orderId}.json`,
    );

    const orderData = JSON.parse(
      await require("fs").promises.readFile(orderPath, "utf8"),
    );

    res.json({
      success: true,
      order: {
        orderId: orderData.orderId,
        status: orderData.status,
        package: orderData.package,
        createdAt: orderData.createdAt,
        completedAt: orderData.completedAt,
      },
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: "Order not found",
    });
  }
});

module.exports = router;
