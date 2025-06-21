#!/usr/bin/env node

// Create Stripe Payment Links for AI Resume Packages
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function createPaymentLinks() {
  console.log('🔗 Creating Stripe Payment Links for AI Resume Packages...');
  console.log('🔑 Using key:', process.env.STRIPE_SECRET_KEY?.substring(0, 15) + '...');
  console.log('🌍 Mode:', process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 'TEST');
  console.log('');

  // Load product data
  const fs = require('fs');
  let productData;
  
  try {
    productData = JSON.parse(fs.readFileSync('stripe_products_live.json', 'utf8'));
    console.log('✅ Loaded live product data');
  } catch (error) {
    console.error('❌ Could not load product data:', error.message);
    console.log('💡 Run: node create_live_products.js first');
    return;
  }

  const paymentLinks = {};

  try {
    console.log('🔗 Creating payment links...\n');

    // Create payment links for each package
    for (const [packageType, packageData] of Object.entries(productData.resume)) {
      console.log(`📦 Creating payment link for ${packageType} package...`);
      
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [
          {
            price: packageData.price,
            quantity: 1,
          },
        ],
        after_completion: {
          type: 'redirect',
          redirect: {
            url: 'https://62b6-23-233-176-252.ngrok-free.app/order-confirmation?session={CHECKOUT_SESSION_ID}&package=' + packageType + '&price=' + (packageData.amount / 100)
          }
        },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        shipping_address_collection: {
          allowed_countries: ['US', 'CA', 'GB', 'AU', 'FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'CH', 'AT', 'IE', 'PT', 'FI', 'SE', 'NO', 'DK']
        },
        metadata: {
          package_type: packageType,
          product_category: 'ai_resume',
          price_usd: (packageData.amount / 100).toString()
        }
      });

      console.log(`✅ Payment link created: ${paymentLink.url}`);
      
      paymentLinks[packageType] = {
        url: paymentLink.url,
        id: paymentLink.id,
        price: packageData.amount / 100,
        product_id: packageData.product,
        price_id: packageData.price
      };
    }

    // Save payment links to file
    fs.writeFileSync('stripe_payment_links.json', JSON.stringify(paymentLinks, null, 2));
    console.log('\n💾 Payment links saved to: stripe_payment_links.json');

    // Display results
    console.log('\n🎉 PAYMENT LINKS CREATED SUCCESSFULLY!');
    console.log('\n📋 Your Direct Payment Links:');
    console.log('=' .repeat(80));
    
    for (const [packageType, linkData] of Object.entries(paymentLinks)) {
      console.log(`\n📦 ${packageType.toUpperCase()} PACKAGE - $${linkData.price}`);
      console.log(`🔗 Direct Link: ${linkData.url}`);
      console.log(`📱 Short URL: ${linkData.url.replace('https://buy.stripe.com/', 'stripe.com/')}`);
    }

    console.log('\n' + '=' .repeat(80));
    console.log('\n💡 How to use these links:');
    console.log('1. 📤 Share directly with customers');
    console.log('2. 📱 Post on social media');
    console.log('3. 📧 Include in emails');
    console.log('4. 🔗 Embed on websites');
    console.log('5. 💬 Send via messaging apps');

    console.log('\n🎯 Benefits of Payment Links:');
    console.log('✅ No website needed');
    console.log('✅ Mobile optimized');
    console.log('✅ Automatic receipts');
    console.log('✅ Real-time payments');
    console.log('✅ Global currency support');

    return paymentLinks;

  } catch (error) {
    console.error('❌ Error creating payment links:', error.message);
    
    if (error.code === 'api_key_invalid') {
      console.log('\n🔑 Check your Stripe API key in .env file');
    }
    
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createPaymentLinks()
    .then(() => {
      console.log('\n🚀 Payment links ready for customers!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Failed to create payment links:', error);
      process.exit(1);
    });
}

module.exports = { createPaymentLinks };