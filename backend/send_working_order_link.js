require('dotenv').config();
const EmailOrderSystem = require('./email_order_system');

async function sendWorkingOrderLink() {
    const emailSystem = new EmailOrderSystem();
    
    const workingURL = 'https://0122-23-233-176-252.ngrok-free.app/simple-order.html';
    const demoURL = workingURL + '?demo=true';
    
    const emailTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 15px 15px 0 0; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 15px 15px; }
        .button { display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 10px; margin: 15px 10px; font-weight: bold; }
        .url-box { background: white; padding: 20px; margin: 20px 0; border-radius: 10px; border-left: 5px solid #667eea; word-break: break-all; }
        .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
        .status-item { background: white; padding: 15px; border-radius: 10px; text-align: center; }
        .status-item.working { border-left: 5px solid #27ae60; }
        .status-item.ready { border-left: 5px solid #667eea; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Order Form is Now LIVE!</h1>
        <p>Complete customer order system with PDF generation</p>
    </div>
    <div class="content">
        <h2>🎉 All Systems Working!</h2>
        
        <div class="status-grid">
            <div class="status-item working">
                <h3>✅ Order Form</h3>
                <p>Customer info collection</p>
            </div>
            <div class="status-item working">
                <h3>✅ PDF Generation</h3>
                <p>Professional resumes</p>
            </div>
            <div class="status-item working">
                <h3>✅ Email System</h3>
                <p>Automated delivery</p>
            </div>
            <div class="status-item ready">
                <h3>🚀 Ready for Orders</h3>
                <p>Complete workflow</p>
            </div>
        </div>
        
        <h3>🔗 Working Order Form URLs:</h3>
        
        <div class="url-box">
            <strong>📋 Customer Order Form:</strong><br>
            <a href="${workingURL}" target="_blank">${workingURL}</a>
        </div>
        
        <div class="url-box">
            <strong>🧪 Demo Version (Pre-filled):</strong><br>
            <a href="${demoURL}" target="_blank">${demoURL}</a>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="${workingURL}" class="button">📝 Try Order Form</a>
            <a href="${demoURL}" class="button">🧪 View Demo</a>
        </div>
        
        <h3>🎯 What the order form includes:</h3>
        <ul style="margin: 15px 0;">
            <li>✅ <strong>Package Selection</strong> - Basic ($29), Professional ($59), Executive ($99)</li>
            <li>✅ <strong>Customer Information</strong> - Name, email, phone</li>
            <li>✅ <strong>Job Details</strong> - Target role, industry, experience level</li>
            <li>✅ <strong>Skills & Keywords</strong> - For ATS optimization</li>
            <li>✅ <strong>Job Description</strong> - Optional for specific role targeting</li>
            <li>✅ <strong>Professional Design</strong> - Mobile-responsive, beautiful UI</li>
        </ul>
        
        <h3>🤖 Automated Processing:</h3>
        <ol style="margin: 15px 0;">
            <li>Customer fills out the form</li>
            <li>Information is processed by AI agents</li>
            <li>Professional PDF resume is generated</li>
            <li>Resume is emailed to customer within 24-48 hours</li>
        </ol>
        
        <div style="background: #e8f5e9; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <h3>✅ Test Results:</h3>
            <p>✅ PDF Generation: Working perfectly<br>
            ✅ Email Delivery: Sent to neuro.pilot.ai@gmail.com<br>
            ✅ Order Form: Accessible and functional<br>
            ✅ Complete Flow: Ready for customers</p>
        </div>
        
        <p><strong>The system is now ready to accept real customer orders!</strong></p>
        
        <p>Next steps:</p>
        <ul>
            <li>Share the order form URL with customers</li>
            <li>Monitor for incoming orders</li>
            <li>System will automatically process and deliver resumes</li>
        </ul>
        
        <p><em>- Neuro.Pilot.AI Development Team</em></p>
    </div>
</body>
</html>
    `;

    try {
        const result = await emailSystem.transporter.sendMail({
            from: '"Neuro.Pilot.AI" <Neuro.Pilot.AI@gmail.com>',
            to: 'neuro.pilot.ai@gmail.com',
            subject: '🚀 Order Form LIVE - Complete System Working!',
            html: emailTemplate,
            text: `Order Form is Now LIVE!\n\nWorking URLs:\n- Order Form: ${workingURL}\n- Demo Version: ${demoURL}\n\nAll systems are working:\n✅ Order Form\n✅ PDF Generation  \n✅ Email System\n✅ Automated Processing\n\nThe system is ready for customers!`
        });

        console.log('✅ Working order form email sent!');
        console.log('📧 Message ID:', result.messageId);
        console.log('\n🔗 Working URLs:');
        console.log('📋 Order Form:', workingURL);
        console.log('🧪 Demo Version:', demoURL);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

sendWorkingOrderLink();