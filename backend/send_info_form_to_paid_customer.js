require('dotenv').config();
const EmailOrderSystem = require('./email_order_system');
const fs = require('fs').promises;

async function sendInfoFormToPaidCustomer() {
    const emailSystem = new EmailOrderSystem();
    
    console.log('🎯 Sending info collection form to paid customer...\n');
    
    // Get customer email
    const customerEmail = process.argv[2] || 'customer@example.com';
    const customerName = process.argv[3] || 'Valued Customer';
    
    console.log(`📧 Sending to: ${customerEmail}`);
    console.log(`👤 Customer: ${customerName}\n`);
    
    // Create info collection email template
    const infoFormTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .form-section { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #4CAF50; }
        .button { display: inline-block; padding: 15px 30px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .highlight { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎉 Payment Received!</h1>
        <p>Now let's create your perfect resume</p>
    </div>
    <div class="content">
        <h2>Hi ${customerName}!</h2>
        
        <div class="highlight">
            <strong>✅ Your payment has been processed successfully!</strong><br>
            We're ready to create your AI-optimized resume.
        </div>
        
        <p>To create the perfect resume for you, we need some details about your target job and background.</p>
        
        <div style="text-align: center;">
            <a href="https://a373-23-233-176-252.ngrok-free.app/order-form.html?email=${encodeURIComponent(customerEmail)}&paid=true" class="button">
                📝 Complete Your Job Details
            </a>
        </div>
        
        <div class="form-section">
            <h3>What we need from you:</h3>
            <ul>
                <li><strong>Target Job Title</strong> (e.g., Software Engineer, Marketing Manager)</li>
                <li><strong>Industry</strong> (Technology, Healthcare, Finance, etc.)</li>
                <li><strong>Years of Experience</strong></li>
                <li><strong>Key Skills</strong> you want to highlight</li>
                <li><strong>Job Description</strong> (if you have a specific role in mind)</li>
                <li><strong>Current Resume</strong> (optional - helps us enhance it)</li>
            </ul>
        </div>
        
        <h3>🤖 What happens next?</h3>
        <ol>
            <li>Click the button above to fill out your details (5 minutes)</li>
            <li>Upload your current resume (optional)</li>
            <li>Our 4 AI agents will analyze and create your optimized resume</li>
            <li>You'll receive your completed resume within 24-48 hours</li>
        </ol>
        
        <div class="highlight">
            <strong>⚡ Quick Option:</strong> Reply to this email with:
            <br>• Target job title
            <br>• Your industry  
            <br>• Years of experience
            <br>• Attach your current resume (if you have one)
        </div>
        
        <p>Questions? Just reply to this email!</p>
        
        <p>Thank you for choosing Neuro.Pilot.AI!</p>
        
        <p><em>- Your AI Resume Team</em></p>
    </div>
</body>
</html>
    `;

    try {
        // Send the info collection email
        const result = await emailSystem.transporter.sendMail({
            from: '"Neuro.Pilot.AI" <Neuro.Pilot.AI@gmail.com>',
            to: customerEmail,
            subject: '📝 Complete Your Resume Details - Payment Received!',
            html: infoFormTemplate,
            text: `Hi ${customerName}!\n\nYour payment has been received! To create your perfect resume, please complete your job details at:\nhttps://a373-23-233-176-252.ngrok-free.app/order-form.html?email=${encodeURIComponent(customerEmail)}&paid=true\n\nOr reply to this email with:\n- Target job title\n- Industry\n- Years of experience\n- Current resume (attached)\n\nThank you!\n- Neuro.Pilot.AI Team`
        });

        console.log('✅ Info collection email sent successfully!');
        console.log('📧 Message ID:', result.messageId);
        
        // Create order tracking record for paid customer
        const orderData = {
            orderId: 'PAID-' + Date.now(),
            email: customerEmail,
            name: customerName,
            status: 'awaiting_info',
            paymentReceived: true,
            createdAt: new Date().toISOString(),
            messageId: result.messageId
        };
        
        // Save to pending orders
        const ordersDir = './orders';
        await fs.mkdir(ordersDir, { recursive: true });
        const orderPath = `${ordersDir}/order_${orderData.orderId}.json`;
        await fs.writeFile(orderPath, JSON.stringify(orderData, null, 2));
        
        console.log('📋 Order tracking created:', orderPath);
        console.log('\n🤖 The automated system will process their resume when they respond!');
        
        return { success: true, orderId: orderData.orderId };
        
    } catch (error) {
        console.error('❌ Error sending email:', error.message);
        return { success: false, error: error.message };
    }
}

// Usage: node send_info_form_to_paid_customer.js customer@email.com "Customer Name"
if (require.main === module) {
    sendInfoFormToPaidCustomer()
        .then(result => {
            if (result.success) {
                console.log('\n🎯 Mission accomplished! Customer will receive the info form.');
            } else {
                console.log('\n❌ Failed:', result.error);
            }
            process.exit(0);
        })
        .catch(console.error);
}

module.exports = sendInfoFormToPaidCustomer;