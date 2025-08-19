const express = require("express");
const router = express.Router();
const { UserModel, getDb } = require("../db/database");
const { authenticateToken } = require("../middleware/auth");

router.get("/orders", authenticateToken, async (req, res) => {
  try {
    const orders = await UserModel.getAllOrders(req.user.id);

    res.json({
      orders,
      total: orders.length,
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ error: "Failed to get orders" });
  }
});

router.get("/orders/:orderId", authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const order = await db.get(
      "SELECT * FROM resume_orders WHERE orderId = ? AND userId = ?",
      [req.params.orderId, req.user.id],
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ order });
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({ error: "Failed to get order" });
  }
});

router.get("/orders/:orderId/download", authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const order = await db.get(
      "SELECT * FROM resume_orders WHERE orderId = ? AND userId = ?",
      [req.params.orderId, req.user.id],
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (!order.generatedResume) {
      return res.status(404).json({ error: "Resume not yet generated" });
    }

    const resumeData = JSON.parse(order.generatedResume);

    // Generate downloadable content based on format
    const format = req.query.format || "html";

    if (format === "html") {
      const htmlContent = generateHTMLResume(resumeData, order.package);
      res.setHeader("Content-Type", "text/html");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="resume_${order.orderId}.html"`,
      );
      res.send(htmlContent);
    } else if (format === "txt") {
      const textContent = generateTextResume(resumeData);
      res.setHeader("Content-Type", "text/plain");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="resume_${order.orderId}.txt"`,
      );
      res.send(textContent);
    } else if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="resume_${order.orderId}.json"`,
      );
      res.json(resumeData);
    } else {
      res
        .status(400)
        .json({ error: "Unsupported format. Use html, txt, or json" });
    }
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ error: "Failed to download resume" });
  }
});

function generateHTMLResume(resumeData, packageType) {
  const personalInfo = resumeData.personal_info || {};
  const name = personalInfo.name || "Professional Name";
  const email = personalInfo.email || "email@example.com";
  const phone = personalInfo.phone || "+1 (555) 123-4567";
  const location = personalInfo.location || "Location";
  const summary =
    resumeData.summary || "Professional summary will be displayed here.";
  const experience = resumeData.experience || [];
  const education = resumeData.education || [];
  const skills = resumeData.skills || [];
  const certifications = resumeData.certifications || [];

  const isPremium = packageType === "executive";
  const bgColor = isPremium
    ? "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)"
    : "#ffffff";
  const borderColor = isPremium ? "3px solid #667eea" : "2px solid #333";
  const nameSize = isPremium ? "2.5rem" : "2rem";
  const accentColor = isPremium ? "#667eea" : "#333";

  const experienceHtml = experience
    .map(
      (exp) => `
        <div class="experience-item">
            <div class="job-title">${exp.title || "Position Title"}</div>
            <div class="company">${exp.company || "Company Name"} | ${exp.duration || "Duration"}</div>
            <p>${exp.description || "Job description and achievements."}</p>
        </div>
    `,
    )
    .join("");

  const educationHtml = education
    .map(
      (edu) => `
        <div class="education-item">
            <div class="degree">${edu.degree || "Degree"}</div>
            <div class="school">${edu.school || "Institution"} | ${edu.year || "Year"}</div>
        </div>
    `,
    )
    .join("");

  const skillsHtml = skills
    .map((skill) => `<span class="skill">${skill}</span>`)
    .join("");

  const certificationsHtml =
    certifications.length > 0
      ? `
        <div class="section">
            <div class="section-title">Certifications</div>
            <ul>
                ${certifications.map((cert) => `<li>${cert}</li>`).join("")}
            </ul>
        </div>
    `
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name} - Resume</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: ${bgColor};
        }
        .header {
            text-align: center;
            border-bottom: ${borderColor};
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .name {
            font-size: ${nameSize};
            font-weight: bold;
            color: ${accentColor};
            margin-bottom: 10px;
        }
        .contact {
            font-size: 1.1rem;
            color: #666;
        }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 1.4rem;
            font-weight: bold;
            color: ${accentColor};
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
            margin-bottom: 15px;
        }
        .experience-item, .education-item {
            margin-bottom: 20px;
            padding: ${isPremium ? "15px" : "10px"};
            background: ${isPremium ? "rgba(255, 255, 255, 0.8)" : "#f9f9f9"};
            border-radius: ${isPremium ? "10px" : "5px"};
            ${isPremium ? "box-shadow: 0 2px 10px rgba(0,0,0,0.1);" : ""}
        }
        .job-title, .degree {
            font-weight: bold;
            font-size: 1.2rem;
            color: ${accentColor};
        }
        .company, .school {
            font-style: italic;
            color: #666;
            margin-bottom: 5px;
        }
        .skills {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        .skill {
            background: ${isPremium ? "linear-gradient(45deg, #667eea, #764ba2)" : "#333"};
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9rem;
        }
        .premium-badge {
            ${isPremium ? "display: block;" : "display: none;"}
            position: absolute;
            top: 10px;
            right: 10px;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 0.8rem;
            font-weight: bold;
        }
        @media print {
            body { background: white; }
            .premium-badge { display: none; }
        }
    </style>
</head>
<body>
    <div class="premium-badge">Premium Resume</div>
    
    <div class="header">
        <div class="name">${name}</div>
        <div class="contact">${email} | ${phone} | ${location}</div>
    </div>

    <div class="section">
        <div class="section-title">Professional Summary</div>
        <p>${summary}</p>
    </div>

    <div class="section">
        <div class="section-title">Work Experience</div>
        ${experienceHtml}
    </div>

    <div class="section">
        <div class="section-title">Education</div>
        ${educationHtml}
    </div>

    <div class="section">
        <div class="section-title">Skills</div>
        <div class="skills">${skillsHtml}</div>
    </div>

    ${certificationsHtml}

    <div style="text-align: center; margin-top: 40px; font-size: 0.8rem; color: #888;">
        Generated by Neuro.Pilot.AI - ${packageType.charAt(0).toUpperCase() + packageType.slice(1)} Package
    </div>
</body>
</html>`;
}

function generateTextResume(resumeData) {
  const personalInfo = resumeData.personal_info || {};
  const name = (personalInfo.name || "PROFESSIONAL NAME").toUpperCase();
  const email = personalInfo.email || "email@example.com";
  const phone = personalInfo.phone || "+1 (555) 123-4567";
  const location = personalInfo.location || "Location";
  const summary =
    resumeData.summary || "Professional summary will be displayed here.";
  const experience = resumeData.experience || [];
  const education = resumeData.education || [];
  const skills = resumeData.skills || [];
  const certifications = resumeData.certifications || [];

  const experienceText = experience
    .map(
      (exp) => `
${exp.title || "Position Title"}
${exp.company || "Company Name"} | ${exp.duration || "Duration"}
${exp.description || "Job description and achievements."}
`,
    )
    .join("\n");

  const educationText = education
    .map(
      (edu) => `
${edu.degree || "Degree"}
${edu.school || "Institution"} | ${edu.year || "Year"}
`,
    )
    .join("\n");

  const skillsText = skills.join(", ");

  const certificationsText =
    certifications.length > 0
      ? `

CERTIFICATIONS
-------------------------------------------
${certifications.map((cert) => `• ${cert}`).join("\n")}`
      : "";

  return `===========================================
${name}
===========================================

Contact Information:
Email: ${email}
Phone: ${phone}
Location: ${location}

PROFESSIONAL SUMMARY
-------------------------------------------
${summary}

WORK EXPERIENCE
-------------------------------------------${experienceText}

EDUCATION
-------------------------------------------${educationText}

SKILLS
-------------------------------------------
${skillsText}${certificationsText}

-------------------------------------------
Generated by Neuro.Pilot.AI`;
}

router.get("/subscription", authenticateToken, async (req, res) => {
  try {
    const subscription = await UserModel.getSubscription(req.user.id);

    res.json({
      subscription: subscription || null,
      hasActiveSubscription: !!subscription,
    });
  } catch (error) {
    console.error("Get subscription error:", error);
    res.status(500).json({ error: "Failed to get subscription" });
  }
});

router.get("/stats", authenticateToken, async (req, res) => {
  try {
    const db = getDb();

    const totalOrders = await db.get(
      "SELECT COUNT(*) as count FROM resume_orders WHERE userId = ?",
      [req.user.id],
    );

    const completedOrders = await db.get(
      'SELECT COUNT(*) as count FROM resume_orders WHERE userId = ? AND status = "completed"',
      [req.user.id],
    );

    const totalSpent = await db.get(
      'SELECT SUM(price) as total FROM resume_orders WHERE userId = ? AND status = "completed"',
      [req.user.id],
    );

    const recentOrders = await db.all(
      "SELECT * FROM resume_orders WHERE userId = ? ORDER BY createdAt DESC LIMIT 5",
      [req.user.id],
    );

    res.json({
      stats: {
        totalOrders: totalOrders.count,
        completedOrders: completedOrders.count,
        totalSpent: totalSpent.total || 0,
        averageOrderValue:
          totalOrders.count > 0
            ? (totalSpent.total || 0) / totalOrders.count
            : 0,
      },
      recentOrders,
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Failed to get statistics" });
  }
});

router.get("/preferences", authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const preferences = await db.get(
      "SELECT * FROM user_preferences WHERE userId = ?",
      [req.user.id],
    );

    res.json({
      preferences: preferences || {
        language: "en",
        resumeStyle: "professional",
        notifications: true,
      },
    });
  } catch (error) {
    console.error("Get preferences error:", error);
    res.status(500).json({ error: "Failed to get preferences" });
  }
});

router.put("/preferences", authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const { language, resumeStyle, notifications } = req.body;

    await db.exec(`
            CREATE TABLE IF NOT EXISTS user_preferences (
                userId INTEGER PRIMARY KEY,
                language TEXT DEFAULT 'en',
                resumeStyle TEXT DEFAULT 'professional',
                notifications BOOLEAN DEFAULT true,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

    await db.run(
      `
            INSERT INTO user_preferences (userId, language, resumeStyle, notifications)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(userId) DO UPDATE SET
                language = excluded.language,
                resumeStyle = excluded.resumeStyle,
                notifications = excluded.notifications,
                updatedAt = CURRENT_TIMESTAMP
        `,
      [
        req.user.id,
        language || "en",
        resumeStyle || "professional",
        notifications !== false,
      ],
    );

    res.json({ message: "Preferences updated successfully" });
  } catch (error) {
    console.error("Update preferences error:", error);
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

module.exports = router;
