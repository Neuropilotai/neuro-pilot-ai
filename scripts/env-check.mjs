#!/usr/bin/env node
/**
 * GROUP7 Environment Variable Validator
 * Checks all required API keys and configurations
 * Usage: node scripts/env-check.mjs
 */

import fs from "node:fs";
import crypto from "node:crypto";
import process from "node:process";
import path from "node:path";

const REQUIRED = [
  "OPENAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "CLOUDCONVERT_API_KEY",
  "NOTION_TOKEN",
  "METRICOOL_API_TOKEN",
  "CANVA_APP_ID",
  "CANVA_TEMPLATE_ID",
  "SERVICE_URL_CANVA_RENDER",
];

const STORAGE_OPTIONS = {
  google: ["GOOGLE_CREDENTIALS_JSON"],
  onedrive: [
    "ONEDRIVE_CLIENT_ID",
    "ONEDRIVE_CLIENT_SECRET",
    "ONEDRIVE_TENANT_ID",
    "ONEDRIVE_REFRESH_TOKEN",
  ],
};

const OPTIONAL = ["LOG_LEVEL", "RUN_ENV", "FRONTEND_URL"];

// Load .env file if exists
const dotenvPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(dotenvPath)) {
  const lines = fs.readFileSync(dotenvPath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Don't override existing env vars
      process.env[key] ??= value;
    }
  }
  console.log(`✅ Loaded .env from ${dotenvPath}\n`);
} else {
  console.log(`⚠️  No .env file found at ${dotenvPath}\n`);
}

let allOk = true;

// Check required variables
console.log("📋 Required Environment Variables:");
console.log("═".repeat(60));
for (const key of REQUIRED) {
  if (!process.env[key] || process.env[key].includes("REPLACE_WITH")) {
    console.error(`❌ Missing or placeholder: ${key}`);
    allOk = false;
  } else {
    const value = process.env[key];
    const masked =
      value.length > 8
        ? `${value.slice(0, 4)}${"•".repeat(value.length - 8)}${value.slice(-4)}`
        : "set";
    console.log(`✅ ${key.padEnd(30)} = ${masked}`);
  }
}

// Check storage options (at least one required)
console.log("\n☁️  Storage Configuration (choose one):");
console.log("═".repeat(60));
let hasStorage = false;

// Check Google Drive
const hasGoogle = STORAGE_OPTIONS.google.every((key) => process.env[key]);
if (hasGoogle) {
  console.log("✅ Google Drive credentials configured");
  hasStorage = true;
} else {
  console.log("ℹ️  Google Drive not configured");
}

// Check OneDrive
const hasOneDrive = STORAGE_OPTIONS.onedrive.every((key) => process.env[key]);
if (hasOneDrive) {
  console.log("✅ OneDrive credentials configured");
  hasStorage = true;
} else {
  console.log("ℹ️  OneDrive not configured");
}

if (!hasStorage) {
  console.error("\n❌ ERROR: No storage provider configured!");
  console.error("   Configure either Google Drive OR OneDrive credentials");
  allOk = false;
}

// Check optional variables
console.log("\nℹ️  Optional Configuration:");
console.log("═".repeat(60));
for (const key of OPTIONAL) {
  if (process.env[key]) {
    console.log(`✅ ${key.padEnd(30)} = ${process.env[key]}`);
  } else {
    console.log(`ℹ️  ${key.padEnd(30)} = (not set, using defaults)`);
  }
}

// Generate checksum for debugging
const checksumInput = REQUIRED.map((k) => process.env[k] || "").join("|");
const checksum = crypto
  .createHash("sha256")
  .update(checksumInput)
  .digest("hex")
  .slice(0, 12);

console.log("\n🔑 Configuration Checksum:");
console.log("═".repeat(60));
console.log(`   ${checksum}`);

// Final status
console.log("\n📊 Validation Summary:");
console.log("═".repeat(60));
if (allOk) {
  console.log("✅ All required environment variables are configured!");
  console.log("   Ready to run GROUP7 services.");
  process.exit(0);
} else {
  console.error("❌ Environment validation FAILED");
  console.error("   Fix the issues above before running services.");
  console.error("\n💡 Tip: Copy .env.template to .env and fill in your keys:");
  console.error("   cp .env.template .env");
  process.exit(1);
}
