#!/usr/bin/env node

// Frontend security testing script

const fs = require('fs');
const path = require('path');

console.log('🔒 FRONTEND SECURITY TEST');
console.log('========================');

// Test 1: Check for hardcoded promo codes in frontend files
console.log('\n1. Scanning for hardcoded promo codes in frontend...');
const frontendFiles = [
    'order_page.html',
    'frontend/index.html',
    'frontend/order-form.html',
    'backend/public/order.html'
];

let foundHardcodedCodes = false;
const promoCodePatterns = ['FAMILY2025', 'TEST50', 'FIRST10', 'WELCOME20'];

frontendFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        promoCodePatterns.forEach(code => {
            if (content.includes(code)) {
                console.log(`❌ FAIL: Found hardcoded promo code '${code}' in ${file}`);
                foundHardcodedCodes = true;
            }
        });
    }
});

if (!foundHardcodedCodes) {
    console.log('✅ PASS: No hardcoded promo codes found in frontend files');
}

// Test 2: Check for console logs exposing promo codes
console.log('\n2. Scanning for console logs exposing promo codes...');
let foundConsoleLeaks = false;

frontendFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            if (line.includes('console.log') && 
                (line.toLowerCase().includes('promo') || 
                 promoCodePatterns.some(code => line.includes(code)))) {
                console.log(`❌ FAIL: Found promo code console log in ${file}:${index + 1}`);
                console.log(`   Line: ${line.trim()}`);
                foundConsoleLeaks = true;
            }
        });
    }
});

if (!foundConsoleLeaks) {
    console.log('✅ PASS: No console logs exposing promo codes found');
}

// Test 3: Check for promo code arrays or objects
console.log('\n3. Scanning for promo code data structures...');
let foundPromoStructures = false;

frontendFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Look for promo code objects or arrays
        if (content.includes('promoCodes') && content.includes('{') && 
            promoCodePatterns.some(code => content.includes(code))) {
            console.log(`❌ FAIL: Found promo code data structure in ${file}`);
            foundPromoStructures = true;
        }
    }
});

if (!foundPromoStructures) {
    console.log('✅ PASS: No promo code data structures found in frontend');
}

// Test 4: Verify server-side validation is intact
console.log('\n4. Verifying server-side promo code validation...');
const serverFile = path.join(__dirname, 'railway-server-production.js');
if (fs.existsSync(serverFile)) {
    const content = fs.readFileSync(serverFile, 'utf8');
    
    if (content.includes('process.env.PROMO_CODES') && 
        content.includes('/api/public/validate-promo')) {
        console.log('✅ PASS: Server-side promo code validation is intact');
    } else {
        console.log('❌ FAIL: Server-side promo code validation may be compromised');
    }
} else {
    console.log('⚠️  WARNING: Server file not found for validation');
}

console.log('\n🎉 FRONTEND SECURITY TEST COMPLETE');
console.log('==================================');

if (!foundHardcodedCodes && !foundConsoleLeaks && !foundPromoStructures) {
    console.log('✅ ALL TESTS PASSED - Frontend is secure!');
    process.exit(0);
} else {
    console.log('❌ SECURITY ISSUES FOUND - Fix required before production!');
    process.exit(1);
}