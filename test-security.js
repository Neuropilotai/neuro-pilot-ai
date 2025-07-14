#!/usr/bin/env node

// Security testing script for production readiness

require('dotenv').config();

console.log('🔒 SECURITY TEST SUITE');
console.log('====================');

// Test 1: API Key Configuration
console.log('\n1. Testing API Key Configuration...');
const apiKey = process.env.API_SECRET_KEY;
if (!apiKey) {
    console.log('❌ FAIL: API_SECRET_KEY not configured');
    process.exit(1);
} else if (apiKey.includes('CHANGE-THIS-IN-PRODUCTION')) {
    console.log('⚠️  WARNING: API_SECRET_KEY contains placeholder - must be changed for production');
} else {
    console.log('✅ PASS: API_SECRET_KEY configured');
}

// Test 2: JWT Secret Configuration
console.log('\n2. Testing JWT Secret Configuration...');
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    console.log('❌ FAIL: JWT_SECRET not configured');
    process.exit(1);
} else if (jwtSecret.includes('change-this-in-production')) {
    console.log('⚠️  WARNING: JWT_SECRET contains placeholder - must be changed for production');
} else {
    console.log('✅ PASS: JWT_SECRET configured');
}

// Test 3: Promo Codes Configuration
console.log('\n3. Testing Promo Codes Configuration...');
const promoCodes = process.env.PROMO_CODES;
if (!promoCodes) {
    console.log('❌ FAIL: PROMO_CODES not configured');
    process.exit(1);
} else {
    try {
        const codes = JSON.parse(promoCodes);
        console.log('✅ PASS: PROMO_CODES configured with', Object.keys(codes).length, 'codes');
    } catch (error) {
        console.log('❌ FAIL: PROMO_CODES contains invalid JSON');
        process.exit(1);
    }
}

// Test 4: OpenAI API Key Configuration
console.log('\n4. Testing OpenAI API Key Configuration...');
const openaiKey = process.env.OPENAI_API_KEY;
if (!openaiKey) {
    console.log('❌ FAIL: OPENAI_API_KEY not configured');
    process.exit(1);
} else if (!openaiKey.startsWith('sk-')) {
    console.log('❌ FAIL: OPENAI_API_KEY has invalid format');
    process.exit(1);
} else {
    console.log('✅ PASS: OPENAI_API_KEY configured');
}

// Test 5: Email Configuration
console.log('\n5. Testing Email Configuration...');
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
if (!emailUser || !emailPass) {
    console.log('⚠️  WARNING: Email system not fully configured');
} else {
    console.log('✅ PASS: Email system configured');
}

console.log('\n🎉 SECURITY TEST COMPLETE');
console.log('========================');
console.log('All critical security tests passed!');
console.log('⚠️  Remember to change placeholder values before production deployment');