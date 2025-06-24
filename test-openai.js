#!/usr/bin/env node

/**
 * Quick OpenAI API Test
 */

const OpenAI = require('openai');
require('dotenv').config();

async function testOpenAI() {
    try {
        if (!process.env.OPENAI_API_KEY) {
            console.log('❌ OPENAI_API_KEY not found in .env file');
            return;
        }

        if (process.env.OPENAI_API_KEY === 'sk-your_openai_api_key_here') {
            console.log('❌ OPENAI_API_KEY still has placeholder value');
            return;
        }

        console.log('🧪 Testing OpenAI connection...');
        
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        // Test API connection
        const models = await openai.models.list();
        console.log('✅ OpenAI connection successful!');
        console.log(`📊 Available models: ${models.data.length}`);

        // Test resume generation
        console.log('🤖 Testing resume generation...');
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a professional resume writer."
                },
                {
                    role: "user",
                    content: "Create a brief professional summary for a software engineer with 3 years experience."
                }
            ],
            max_tokens: 150,
        });

        console.log('✅ Resume generation test successful!');
        console.log('📝 Sample output:');
        console.log(completion.choices[0].message.content);
        
        console.log('\n🎉 OpenAI is ready for resume generation!');

    } catch (error) {
        console.error('❌ OpenAI test failed:', error.message);
        
        if (error.message.includes('Incorrect API key')) {
            console.log('💡 Solution: Check your API key at https://platform.openai.com/api-keys');
        } else if (error.message.includes('insufficient_quota')) {
            console.log('💡 Solution: Add credits to your OpenAI account');
        }
    }
}

testOpenAI();