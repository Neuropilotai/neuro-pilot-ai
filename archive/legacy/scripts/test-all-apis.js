#!/usr/bin/env node

/**
 * Test All API Configurations
 */

const { Client } = require('@notionhq/client');
const OpenAI = require('openai');
const stripe = require('stripe');
require('dotenv').config();

async function testAllAPIs() {
    console.log('🧪 Testing All API Configurations...\n');
    
    let results = {
        notion: false,
        openai: false,
        stripe: false
    };

    // Test 1: Notion
    console.log('1️⃣ Testing Notion API...');
    try {
        const notion = new Client({ auth: process.env.NOTION_TOKEN });
        const user = await notion.users.me();
        console.log(`✅ Notion connected as: ${user.name || 'Integration User'}`);
        results.notion = true;
    } catch (error) {
        console.log(`❌ Notion failed: ${error.message}`);
    }

    // Test 2: OpenAI
    console.log('\n2️⃣ Testing OpenAI API...');
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const models = await openai.models.list();
        console.log(`✅ OpenAI connected: ${models.data.length} models available`);
        results.openai = true;
    } catch (error) {
        console.log(`❌ OpenAI failed: ${error.message}`);
    }

    // Test 3: Stripe
    console.log('\n3️⃣ Testing Stripe API...');
    try {
        const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);
        const balance = await stripeClient.balance.retrieve();
        console.log(`✅ Stripe connected: ${balance.object === 'balance' ? 'Balance accessible' : 'Unknown'}`);
        results.stripe = true;
    } catch (error) {
        console.log(`❌ Stripe failed: ${error.message}`);
    }

    // Summary
    console.log('\n📊 API Configuration Summary:');
    console.log('==============================');
    console.log(`Notion:  ${results.notion ? '✅ Working' : '❌ Not configured'}`);
    console.log(`OpenAI:  ${results.openai ? '✅ Working' : '❌ Not configured'}`);
    console.log(`Stripe:  ${results.stripe ? '✅ Working' : '❌ Not configured'}`);
    
    const totalWorking = Object.values(results).filter(v => v).length;
    
    if (totalWorking === 3) {
        console.log('\n🎉 All APIs configured successfully!');
        console.log('🚀 Your automated resume service is ready to launch!');
        console.log('\nNext step: Run the Notion setup script:');
        console.log('node notion-integration-setup.js');
    } else {
        console.log(`\n⚠️  ${totalWorking}/3 APIs configured`);
        console.log('Please configure the remaining APIs in your .env file');
    }
}

testAllAPIs();