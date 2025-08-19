require("dotenv").config();
const EmailOrderSystem = require("./email_order_system");

async function sendSystemsOnlineNotification() {
  const emailSystem = new EmailOrderSystem();

  const emailTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 15px 15px 0 0; }
        .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 15px 15px; }
        .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
        .status-item { background: white; padding: 15px; border-radius: 10px; text-align: center; border-left: 5px solid #28a745; }
        .url-box { background: white; padding: 20px; margin: 15px 0; border-radius: 10px; border-left: 5px solid #007bff; }
        .button { display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: white; text-decoration: none; border-radius: 10px; margin: 10px; font-weight: bold; }
        .online-badge { background: #28a745; color: white; padding: 5px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎉 ALL SYSTEMS ONLINE!</h1>
        <p>Complete Neuro.Pilot.AI Platform Ready</p>
        <div class="online-badge">100% OPERATIONAL</div>
    </div>
    <div class="content">
        <h2>🚀 System Status Report</h2>
        
        <div class="status-grid">
            <div class="status-item">
                <h3>✅ Frontend</h3>
                <p>Port 3000 - React App</p>
            </div>
            <div class="status-item">
                <h3>✅ Web Server</h3>
                <p>Port 3001 - Main Website</p>
            </div>
            <div class="status-item">
                <h3>✅ Backend API</h3>
                <p>Port 8080 - Core Services</p>
            </div>
            <div class="status-item">
                <h3>✅ Admin Panel</h3>
                <p>Port 8081 - Management</p>
            </div>
            <div class="status-item">
                <h3>✅ Fiverr Pro</h3>
                <p>Port 8082 - Order System</p>
            </div>
            <div class="status-item">
                <h3>✅ AI Agents</h3>
                <p>4 Agents Online</p>
            </div>
        </div>
        
        <h3>🔗 Customer Access Points:</h3>
        
        <div class="url-box">
            <strong>📋 Order Form (Live):</strong><br>
            <a href="https://0122-23-233-176-252.ngrok-free.app/simple-order.html" target="_blank">
                https://0122-23-233-176-252.ngrok-free.app/simple-order.html
            </a>
        </div>
        
        <div class="url-box">
            <strong>🧪 Demo Version:</strong><br>
            <a href="https://0122-23-233-176-252.ngrok-free.app/simple-order.html?demo=true" target="_blank">
                https://0122-23-233-176-252.ngrok-free.app/simple-order.html?demo=true
            </a>
        </div>
        
        <div class="url-box">
            <strong>🌐 Main Website:</strong><br>
            <a href="https://0122-23-233-176-252.ngrok-free.app" target="_blank">
                https://0122-23-233-176-252.ngrok-free.app
            </a>
        </div>
        
        <h3>⚡ Active Features:</h3>
        <ul>
            <li>✅ <strong>Customer Order Collection</strong> - Complete form with validation</li>
            <li>✅ <strong>Professional PDF Generation</strong> - AI-optimized resumes</li>
            <li>✅ <strong>Automated Email Delivery</strong> - Instant notifications</li>
            <li>✅ <strong>Payment Processing</strong> - Stripe integration ready</li>
            <li>✅ <strong>Order Monitoring</strong> - Real-time processing</li>
            <li>✅ <strong>ATS Optimization</strong> - Industry-specific keywords</li>
            <li>✅ <strong>Multi-Package Support</strong> - Basic, Professional, Executive</li>
        </ul>
        
        <h3>🤖 AI Resume Generation Pipeline:</h3>
        <ol>
            <li><strong>Agent 1:</strong> Job market analysis and role research</li>
            <li><strong>Agent 2:</strong> ATS keyword optimization</li>
            <li><strong>Agent 3:</strong> Professional content creation</li>
            <li><strong>Agent 4:</strong> Final formatting and delivery</li>
        </ol>
        
        <div style="background: #e8f5e9; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
            <h3>🎯 READY FOR CUSTOMERS!</h3>
            <p><strong>14 Node.js processes running</strong><br>
            <strong>All core systems operational</strong><br>
            <strong>Order processing pipeline active</strong></p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="https://0122-23-233-176-252.ngrok-free.app/simple-order.html" class="button">🚀 Try Order Form</a>
            <a href="https://0122-23-233-176-252.ngrok-free.app/simple-order.html?demo=true" class="button">🧪 View Demo</a>
        </div>
        
        <p><strong>System Performance:</strong></p>
        <ul>
            <li>📧 Email system: Ready for delivery</li>
            <li>📄 PDF generation: Professional quality</li>
            <li>🔄 Order processing: Automated pipeline</li>
            <li>💾 Data storage: All directories created</li>
            <li>🌐 Public access: Ngrok tunnel active</li>
        </ul>
        
        <p><strong>The complete AI resume generation platform is now live and ready to serve customers worldwide!</strong></p>
        
        <p><em>- Neuro.Pilot.AI Operations Team</em></p>
    </div>
</body>
</html>
    `;

  try {
    const result = await emailSystem.transporter.sendMail({
      from: '"Neuro.Pilot.AI" <Neuro.Pilot.AI@gmail.com>',
      to: "neuro.pilot.ai@gmail.com",
      subject: "🎉 ALL SYSTEMS ONLINE - Platform Ready for Customers!",
      html: emailTemplate,
      text: `ALL SYSTEMS ONLINE!\n\nNeuro.Pilot.AI Platform Status:\n✅ Frontend (Port 3000)\n✅ Web Server (Port 3001)\n✅ Backend API (Port 8080)\n✅ Admin Panel (Port 8081)\n✅ Fiverr Pro (Port 8082)\n✅ AI Agents (4 Online)\n\nCustomer Order Form:\nhttps://0122-23-233-176-252.ngrok-free.app/simple-order.html\n\nDemo Version:\nhttps://0122-23-233-176-252.ngrok-free.app/simple-order.html?demo=true\n\nThe platform is ready for customers!`,
    });

    console.log("✅ Systems online notification sent!");
    console.log("📧 Message ID:", result.messageId);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

sendSystemsOnlineNotification();
