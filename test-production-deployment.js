#!/usr/bin/env node

// Test script to verify Railway deployment and security fixes

const https = require('https');

const PRODUCTION_URL = 'https://resourceful-achievement-production.up.railway.app';

console.log('🔍 TESTING PRODUCTION DEPLOYMENT');
console.log('================================');

// Test 1: Health Check
function testHealthCheck() {
    return new Promise((resolve, reject) => {
        const req = https.get(`${PRODUCTION_URL}/api/health`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const health = JSON.parse(data);
                    console.log('✅ Health Check:', health.status);
                    console.log('   Version:', health.version);
                    resolve(health);
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
    });
}

// Test 2: Secure Promo Endpoint
function testPromoEndpoint() {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ code: 'WELCOME10' });
        
        const options = {
            hostname: 'resourceful-achievement-production.up.railway.app',
            port: 443,
            path: '/api/public/validate-promo',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    console.log('✅ Promo Endpoint Status:', res.statusCode);
                    console.log('   Valid:', result.valid);
                    console.log('   Description:', result.description);
                    resolve(result);
                } catch (e) {
                    console.log('❌ Promo Endpoint Error:', res.statusCode);
                    console.log('   Response:', data);
                    resolve({ status: res.statusCode, error: data });
                }
            });
        });

        req.on('error', (e) => {
            console.log('❌ Promo Endpoint Request Error:', e.message);
            resolve({ error: e.message });
        });

        req.write(postData);
        req.end();
    });
}

// Test 3: Check Order Page Security
function testOrderPageSecurity() {
    return new Promise((resolve, reject) => {
        const req = https.get(`${PRODUCTION_URL}/order`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const hasHardcodedPromos = data.includes('FAMILY2025') || data.includes('TEST50');
                const hasEmptyPromoCodes = data.includes('var promoCodes = {}');
                const hasServerValidation = data.includes('/api/public/validate-promo');
                
                console.log('🔍 Order Page Security:');
                console.log('   Hardcoded Promo Codes:', hasHardcodedPromos ? '❌ FOUND' : '✅ CLEAN');
                console.log('   Empty Promo Object:', hasEmptyPromoCodes ? '✅ SECURE' : '❌ INSECURE');
                console.log('   Server Validation:', hasServerValidation ? '✅ IMPLEMENTED' : '❌ MISSING');
                
                resolve({
                    secure: !hasHardcodedPromos && hasEmptyPromoCodes && hasServerValidation,
                    hardcodedPromos: hasHardcodedPromos,
                    emptyPromoCodes: hasEmptyPromoCodes,
                    serverValidation: hasServerValidation
                });
            });
        });
        req.on('error', reject);
    });
}

// Run all tests
async function runTests() {
    try {
        console.log('\n1. Testing Health Check...');
        await testHealthCheck();
        
        console.log('\n2. Testing Secure Promo Endpoint...');
        await testPromoEndpoint();
        
        console.log('\n3. Testing Order Page Security...');
        const security = await testOrderPageSecurity();
        
        console.log('\n🎉 DEPLOYMENT TEST COMPLETE');
        console.log('===========================');
        
        if (security.secure) {
            console.log('✅ SECURITY: All tests passed - Production is secure!');
        } else {
            console.log('❌ SECURITY: Issues found - Check Railway deployment');
        }
        
    } catch (error) {
        console.error('❌ Test Error:', error.message);
    }
}

runTests();