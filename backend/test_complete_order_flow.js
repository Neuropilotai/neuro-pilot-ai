require('dotenv').config();
const EmailOrderSystem = require('./email_order_system');
const PDFResumeGenerator = require('./pdf_resume_generator');
const fs = require('fs').promises;
const path = require('path');

async function testCompleteOrderFlow() {
    console.log('🚀 Testing Complete Order Flow with PDF Generation\n');
    
    const emailSystem = new EmailOrderSystem();
    const pdfGenerator = new PDFResumeGenerator();
    
    // Sample order data (what customer would enter in form)
    const sampleOrderData = {
        orderId: 'TEST-' + Date.now(),
        fullName: 'John Michael Smith',
        email: 'neuro.pilot.ai@gmail.com',  // Send test to your email
        phone: '+1 (555) 123-4567',
        package: 'professional',
        targetRole: 'Senior IT Manager',
        industry: 'Food Services',
        experience: '11-15',
        keywords: 'IT Management, Project Management, Digital Transformation, Team Leadership, Budget Management, Vendor Relations, Cloud Computing, Data Analytics',
        jobDescription: 'Seeking a Senior IT Manager position to lead digital transformation initiatives and manage cross-functional teams in a fast-paced food services environment.',
        resumeUploaded: false,
        paymentReceived: true,
        status: 'processing',
        createdAt: new Date().toISOString()
    };
    
    console.log('📋 Test Order Details:');
    console.log(`   Customer: ${sampleOrderData.fullName}`);
    console.log(`   Email: ${sampleOrderData.email}`);
    console.log(`   Target Role: ${sampleOrderData.targetRole}`);
    console.log(`   Industry: ${sampleOrderData.industry}`);
    console.log(`   Package: ${sampleOrderData.package}\n`);
    
    try {
        // Step 1: Generate PDF Resume
        console.log('🤖 Step 1: Generating AI-Optimized PDF Resume...');
        const pdfResult = await pdfGenerator.generateProfessionalResume(sampleOrderData);
        
        if (!pdfResult.success) {
            throw new Error('PDF generation failed: ' + pdfResult.error);
        }
        
        console.log(`✅ PDF Resume generated: ${pdfResult.filename}`);
        console.log(`📄 File path: ${pdfResult.filePath}\n`);
        
        // Step 2: Send completion email with PDF attachment
        console.log('📧 Step 2: Sending completion email with PDF attachment...');
        
        const completionTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .success-box { background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
        .attachment-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border: 2px dashed #4CAF50; }
        .tips { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #4CAF50; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎉 Your Resume is Ready!</h1>
        <p>Professional AI-Generated Resume</p>
    </div>
    <div class="content">
        <h2>Congratulations ${sampleOrderData.fullName}!</h2>
        
        <div class="success-box">
            <h3>✅ Your AI-Optimized Resume is Complete!</h3>
            <p><strong>Package:</strong> ${sampleOrderData.package.charAt(0).toUpperCase() + sampleOrderData.package.slice(1)} ($59)</p>
            <p><strong>Target Role:</strong> ${sampleOrderData.targetRole}</p>
            <p><strong>Industry:</strong> ${sampleOrderData.industry}</p>
        </div>
        
        <div class="attachment-box">
            <h3>📎 Your Documents:</h3>
            <p>✅ <strong>${pdfResult.filename}</strong> - Professional PDF Resume</p>
            <p>🎯 ATS-Optimized for ${sampleOrderData.targetRole}</p>
            <p>🤖 Created by 4 Specialized AI Agents</p>
        </div>
        
        <div class="tips">
            <h3>💡 Quick Tips for Success:</h3>
            <ul>
                <li><strong>Review Carefully:</strong> Check all details for accuracy</li>
                <li><strong>Customize per Application:</strong> Tailor keywords for each job</li>
                <li><strong>Use ATS Keywords:</strong> We've optimized for ${sampleOrderData.industry} industry</li>
                <li><strong>Professional Format:</strong> Ready for both online applications and printing</li>
            </ul>
        </div>
        
        <h3>🚀 What's Included:</h3>
        <ul>
            <li>✅ Professional PDF Resume (attached)</li>
            <li>✅ ATS-Optimized keywords for ${sampleOrderData.targetRole}</li>
            <li>✅ Industry-specific formatting for ${sampleOrderData.industry}</li>
            <li>✅ ${sampleOrderData.experience} years experience highlighted</li>
            <li>✅ Core competencies: ${sampleOrderData.keywords.split(',').slice(0,3).join(', ')}</li>
        </ul>
        
        <p><strong>Need Revisions?</strong><br>
        We offer free minor revisions within 7 days. Simply reply to this email with your requested changes.</p>
        
        <p><strong>Questions or Issues?</strong><br>
        Contact us at: <a href="mailto:support@neuropilot-ai.com">support@neuropilot-ai.com</a></p>
        
        <p>Best of luck with your job search! We're confident your new resume will help you land that ${sampleOrderData.targetRole} position.</p>
        
        <p><strong>Thank you for choosing Neuro.Pilot.AI!</strong></p>
        
        <p><em>- The Neuro.Pilot.AI Team</em><br>
        🤖 Powered by 4 Specialized AI Agents</p>
    </div>
</body>
</html>
        `;

        const emailResult = await emailSystem.transporter.sendMail({
            from: '"Neuro.Pilot.AI" <Neuro.Pilot.AI@gmail.com>',
            to: sampleOrderData.email,
            subject: `🎉 Your ${sampleOrderData.targetRole} Resume is Ready! - Neuro.Pilot.AI`,
            html: completionTemplate,
            text: `Your AI-optimized resume is ready!\n\nHi ${sampleOrderData.fullName}!\n\nYour professional resume for ${sampleOrderData.targetRole} is attached to this email.\n\nPackage: ${sampleOrderData.package}\nTarget Role: ${sampleOrderData.targetRole}\nIndustry: ${sampleOrderData.industry}\n\nThank you for choosing Neuro.Pilot.AI!\n\n- The AI Resume Team`,
            attachments: [{
                filename: pdfResult.filename,
                path: pdfResult.filePath,
                contentType: 'application/pdf'
            }]
        });
        
        console.log('✅ Email sent successfully!');
        console.log(`📧 Message ID: ${emailResult.messageId}`);
        console.log(`📎 PDF Attached: ${pdfResult.filename}\n`);
        
        // Step 3: Save order record
        console.log('💾 Step 3: Saving order record...');
        const ordersDir = './completed_orders';
        await fs.mkdir(ordersDir, { recursive: true });
        
        const orderRecord = {
            ...sampleOrderData,
            status: 'completed',
            completedAt: new Date().toISOString(),
            deliveredFiles: {
                resume: pdfResult.filePath,
                filename: pdfResult.filename
            },
            emailDelivery: {
                messageId: emailResult.messageId,
                sentTo: sampleOrderData.email,
                sentAt: new Date().toISOString()
            }
        };
        
        const orderPath = path.join(ordersDir, `order_${orderRecord.orderId}.json`);
        await fs.writeFile(orderPath, JSON.stringify(orderRecord, null, 2));
        
        console.log(`✅ Order record saved: ${orderPath}\n`);
        
        // Step 4: Test Results Summary
        console.log('🎯 TEST COMPLETED SUCCESSFULLY!\n');
        console.log('📊 Test Results Summary:');
        console.log('├── ✅ PDF Generation: Working');
        console.log('├── ✅ Email Delivery: Working');
        console.log('├── ✅ File Attachments: Working');
        console.log('├── ✅ Order Tracking: Working');
        console.log('└── ✅ Complete Flow: Working\n');
        
        console.log('📧 Check your email at: neuro.pilot.ai@gmail.com');
        console.log('📄 You should receive a professional PDF resume!');
        console.log(`📁 Local file saved at: ${pdfResult.filePath}`);
        
        return {
            success: true,
            orderId: orderRecord.orderId,
            resumePath: pdfResult.filePath,
            filename: pdfResult.filename,
            messageId: emailResult.messageId
        };
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
if (require.main === module) {
    testCompleteOrderFlow()
        .then(result => {
            if (result.success) {
                console.log('\n🎉 All systems are working perfectly!');
                console.log('The customer order flow is ready for production.');
            } else {
                console.log('\n❌ Test failed. Please check the error above.');
            }
            process.exit(0);
        })
        .catch(console.error);
}

module.exports = testCompleteOrderFlow;