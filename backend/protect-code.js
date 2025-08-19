#!/usr/bin/env node

/**
 * CODE PROTECTION SCRIPT - SAME AS YESTERDAY
 * Obfuscates the inventory system to prevent theft
 * © 2025 David Mikulis - All Rights Reserved
 */

const JavaScriptObfuscator = require("javascript-obfuscator");
const fs = require("fs");

console.log("🔒 Starting code protection...");

// Read the source file
const sourceCode = fs.readFileSync("./inventory-system.js", "utf8");

// Obfuscation options - WORKING VERSION LIKE YESTERDAY
const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: false, // Disabled to prevent breaking
  numbersToExpressions: true,
  simplify: true,
  stringArrayShuffle: true,
  splitStrings: false, // Disabled to prevent breaking
  stringArray: true,
  stringArrayThreshold: 0.8,
  transformObjectKeys: false, // Disabled to prevent breaking
  unicodeEscapeSequence: false,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  deadCodeInjection: false, // Disabled to prevent breaking
  debugProtection: true,
  debugProtectionInterval: 1000,
  disableConsoleOutput: false, // Keep console for debugging
  domainLock: [],
  reservedNames: [
    "^console$",
    "^require$",
    "^module$",
    "^exports$",
    "^app$",
    "^express$",
    "^cors$",
    "^helmet$",
    "^jwt$",
    "^bcrypt$",
  ],
  seed: 12345,
};

console.log("🔐 Applying advanced obfuscation...");

// Obfuscate the code
const obfuscationResult = JavaScriptObfuscator.obfuscate(
  sourceCode,
  obfuscationOptions,
);

// Write the obfuscated code
fs.writeFileSync(
  "./inventory-system-protected.js",
  obfuscationResult.getObfuscatedCode(),
);

// Create backup of original
fs.writeFileSync("./inventory-system-original.js", sourceCode);

console.log("✅ Code protection complete!");
console.log("📁 Protected file: inventory-system-protected.js");
console.log("📁 Original backup: inventory-system-original.js");
console.log("🔒 Code is now protected against theft - SAME AS YESTERDAY!");
