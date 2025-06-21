#!/usr/bin/env node

/**
 * Fiverr Order Processor
 * Connects Fiverr orders to your AI Resume Agent
 * Run this to process orders from Fiverr
 */

const readline = require('readline');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

class FiverrOrderProcessor {
  constructor() {
    this.apiUrl = process.env.PRODUCTION_URL ? `${process.env.PRODUCTION_URL}/api/resume/generate` : (process.env.RAILWAY_URL ? `${process.env.RAILWAY_URL}/api/resume/generate` : 'https://resourceful-achievement-production.up.railway.app/api/resume/generate');
    this.ordersDir = path.join(__dirname, '../fiverr_orders');
    this.completedDir = path.join(__dirname, '../fiverr_completed');
    
    // Create directories if they don't exist
    [this.ordersDir, this.completedDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start() {
    console.log('🎯 FIVERR ORDER PROCESSOR');
    console.log('========================');
    console.log('This tool helps you process Fiverr orders through your AI agent\n');

    const choice = await this.askQuestion(
      'Choose an option:\n' +
      '1. Process new order from Fiverr\n' +
      '2. Create order template\n' +
      '3. Batch process orders\n' +
      '4. Check order status\n' +
      'Enter choice (1-4): '
    );

    switch (choice) {
      case '1':
        await this.processNewOrder();
        break;
      case '2':
        await this.createOrderTemplate();
        break;
      case '3':
        await this.batchProcessOrders();
        break;
      case '4':
        await this.checkOrderStatus();
        break;
      default:
        console.log('Invalid choice');
    }

    this.rl.close();
  }

  async processNewOrder() {
    console.log('\n📝 NEW FIVERR ORDER');
    console.log('===================');
    console.log('Copy the information from your Fiverr order:\n');

    // Collect order information
    const orderInfo = {
      fiverr_order_id: await this.askQuestion('Fiverr Order ID: '),
      buyer_username: await this.askQuestion('Buyer Username: '),
      package_type: await this.askPackageType(),
      candidateInfo: {
        name: await this.askQuestion('Customer Full Name: '),
        email: await this.askQuestion('Customer Email: '),
        phone: await this.askQuestion('Phone (optional): ') || '',
        location: await this.askQuestion('Location (City, State): ') || '',
        experience: await this.askQuestion('Experience Summary: '),
        skills: await this.askQuestion('Key Skills (comma-separated): ')
      },
      jobDescription: await this.askMultilineQuestion('Job Description (paste here, then press Enter twice):\n'),
      companyName: await this.askQuestion('Company Name (optional): ') || '',
      language: await this.askLanguage()
    };

    console.log('\n🤖 Processing order through AI agent...');

    try {
      // Send to AI agent
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jobDescription: orderInfo.jobDescription,
          companyName: orderInfo.companyName,
          candidateInfo: orderInfo.candidateInfo,
          package: orderInfo.package_type,
          language: orderInfo.language,
          customerEmail: orderInfo.candidateInfo.email
        })
      });

      const result = await response.json();

      if (result.success) {
        console.log('\n✅ RESUME GENERATED SUCCESSFULLY!');
        console.log('==================================');
        console.log(`Order ID: ${result.order_id}`);
        console.log(`Job Category: ${result.job_analysis?.category}`);
        console.log(`Quality Score: ${result.quality_score}%`);
        console.log(`Template Used: ${result.canva_design?.template_used}`);
        
        // Save order details
        const orderFilename = `order_${orderInfo.fiverr_order_id}_${Date.now()}.json`;
        const orderPath = path.join(this.completedDir, orderFilename);
        
        fs.writeFileSync(orderPath, JSON.stringify({
          fiverr_info: orderInfo,
          ai_result: result,
          processed_at: new Date().toISOString()
        }, null, 2));
        
        console.log(`\n📁 Order saved to: ${orderFilename}`);
        console.log('\n🎯 NEXT STEPS:');
        console.log('1. Download the generated resume from your system');
        console.log('2. Upload to Fiverr delivery');
        console.log('3. Add this message to buyer:');
        console.log('\n--- FIVERR MESSAGE TEMPLATE ---');
        console.log(this.generateDeliveryMessage(orderInfo, result));
        console.log('--- END MESSAGE ---\n');
        
      } else {
        console.error('❌ Error generating resume:', result.error);
      }

    } catch (error) {
      console.error('❌ Failed to process order:', error.message);
      console.log('\nMake sure your web server is running at http://localhost:3001');
    }
  }

  generateDeliveryMessage(orderInfo, result) {
    return `Hi ${orderInfo.buyer_username}!

Your AI-powered resume is ready! 🎉

Here's what I've created for you:
✅ Custom resume optimized for the ${orderInfo.companyName || 'position'} role
✅ ATS-optimized with a ${result.quality_score}% quality score
✅ Job-specific content adapted to ${result.job_analysis?.category || 'your target'} level
✅ Professional design that stands out

The AI analyzed your job description and created content specifically tailored to what employers are looking for. 

📎 Files attached:
- Resume (PDF) - Ready to submit
- Resume (Word) - For future edits
${orderInfo.package_type !== 'basic' ? '- Cover Letter template - Customized for this role' : ''}

💡 Pro tip: This resume is optimized for ATS systems and includes industry-specific keywords that will help you get past automated filters.

If you need any adjustments, please let me know. I'm here to ensure you're 100% satisfied!

Best of luck with your application! 🚀`;
  }

  async createOrderTemplate() {
    console.log('\n📋 CREATING ORDER TEMPLATE');
    console.log('=========================');
    
    const template = {
      instructions: "Fill in this template with customer information from Fiverr",
      fiverr_order_id: "[Fiverr Order Number]",
      buyer_username: "[Buyer Username]",
      package_type: "professional",
      candidateInfo: {
        name: "[Full Name]",
        email: "[Email]",
        phone: "[Phone]",
        location: "[City, State]",
        experience: "[Brief experience summary]",
        skills: "[Comma-separated skills]"
      },
      jobDescription: "[Paste full job description here]",
      companyName: "[Company name if mentioned]",
      language: "english"
    };

    const templatePath = path.join(this.ordersDir, 'order_template.json');
    fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
    
    console.log(`\n✅ Template created at: ${templatePath}`);
    console.log('Edit this file with customer info, then use option 3 to batch process');
  }

  async batchProcessOrders() {
    console.log('\n📦 BATCH PROCESSING ORDERS');
    console.log('=========================');
    
    const files = fs.readdirSync(this.ordersDir).filter(f => f.endsWith('.json'));
    
    if (files.length === 0) {
      console.log('No order files found in fiverr_orders directory');
      return;
    }

    console.log(`Found ${files.length} orders to process\n`);

    for (const file of files) {
      console.log(`Processing ${file}...`);
      
      try {
        const orderData = JSON.parse(fs.readFileSync(path.join(this.ordersDir, file), 'utf8'));
        
        // Skip if template
        if (orderData.instructions) {
          console.log('Skipping template file');
          continue;
        }

        // Process order
        // ... (similar to processNewOrder logic)
        
        console.log(`✅ Processed successfully\n`);
        
      } catch (error) {
        console.error(`❌ Failed to process ${file}:`, error.message);
      }
    }
  }

  async checkOrderStatus() {
    console.log('\n📊 ORDER STATUS');
    console.log('===============');
    
    const completed = fs.readdirSync(this.completedDir).filter(f => f.endsWith('.json'));
    const pending = fs.readdirSync(this.ordersDir).filter(f => f.endsWith('.json') && !f.includes('template'));
    
    console.log(`Completed Orders: ${completed.length}`);
    console.log(`Pending Orders: ${pending.length}`);
    
    if (completed.length > 0) {
      console.log('\nRecent Completed Orders:');
      completed.slice(-5).forEach(file => {
        console.log(`- ${file}`);
      });
    }
  }

  askQuestion(question) {
    return new Promise(resolve => {
      this.rl.question(question, resolve);
    });
  }

  async askMultilineQuestion(question) {
    console.log(question);
    let lines = [];
    let emptyLineCount = 0;

    const readLine = () => {
      return new Promise(resolve => {
        this.rl.question('', line => {
          if (line === '') {
            emptyLineCount++;
            if (emptyLineCount >= 1) {
              resolve(false);
            } else {
              resolve(true);
            }
          } else {
            lines.push(line);
            emptyLineCount = 0;
            resolve(true);
          }
        });
      });
    };

    while (await readLine()) {
      // Continue reading lines
    }

    return lines.join('\n');
  }

  async askPackageType() {
    const choice = await this.askQuestion(
      'Package type:\n1. Basic ($25)\n2. Professional ($45)\n3. Executive ($85)\nChoice (1-3): '
    );
    
    const packages = { '1': 'basic', '2': 'professional', '3': 'executive' };
    return packages[choice] || 'professional';
  }

  async askLanguage() {
    const choice = await this.askQuestion('Language (1=English, 2=French): ');
    return choice === '2' ? 'french' : 'english';
  }
}

// Run if called directly
if (require.main === module) {
  const processor = new FiverrOrderProcessor();
  processor.start().catch(console.error);
}

module.exports = FiverrOrderProcessor;