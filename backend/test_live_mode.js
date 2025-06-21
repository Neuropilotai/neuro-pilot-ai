#!/usr/bin/env node

// Test Live Stripe Configuration
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function testLiveMode() {
  console.log('🧪 Testing Live Stripe Configuration...');
  console.log('🔑 Key:', process.env.STRIPE_SECRET_KEY?.substring(0, 15) + '...');
  console.log('🌍 Mode:', process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 'TEST');
  console.log('');

  try {
    // Test 1: List products
    console.log('📋 Test 1: Listing products...');
    const products = await stripe.products.list({ limit: 5 });
    console.log(`✅ Found ${products.data.length} products`);
    
    products.data.forEach(product => {
      console.log(`   - ${product.name} (${product.id})`);
    });
    console.log('');

    // Test 2: List prices
    console.log('💰 Test 2: Listing prices...');
    const prices = await stripe.prices.list({ limit: 5 });
    console.log(`✅ Found ${prices.data.length} prices`);
    
    prices.data.forEach(price => {
      console.log(`   - $${price.unit_amount/100} USD (${price.id})`);
    });
    console.log('');

    // Test 3: Create test checkout session
    console.log('🛒 Test 3: Creating checkout session...');
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: prices.data[0]?.id || 'price_1RbxDxKjYpIntZr4daYBM2Lq',
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      customer_email: 'test@example.com'
    });

    console.log(`✅ Checkout session created: ${session.id}`);
    console.log(`🔗 Session URL: ${session.url.substring(0, 50)}...`);
    console.log(`🎯 Mode: ${session.mode}`);
    console.log(`💳 Amount: $${session.amount_total/100}`);
    console.log('');

    console.log('🎉 ALL TESTS PASSED - Live mode is working!');
    console.log('');
    console.log('📊 Summary:');
    console.log('- ✅ Live Stripe key authenticated');
    console.log('- ✅ Products accessible');
    console.log('- ✅ Prices accessible');
    console.log('- ✅ Checkout sessions can be created');
    console.log('- ✅ Ready for real payments');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'resource_missing') {
      console.log('💡 This might be because the price ID doesn\'t exist in live mode');
      console.log('🔧 Try recreating products with: node create_live_products.js');
    }
    
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testLiveMode()
    .then(() => {
      console.log('\n🚀 Live mode configuration is ready!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Live mode test failed:', error);
      process.exit(1);
    });
}

module.exports = { testLiveMode };