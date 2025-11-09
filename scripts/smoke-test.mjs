#!/usr/bin/env node
/**
 * GROUP7 Smoke Test
 * Validates API reachability and local service availability
 * Usage: node scripts/smoke-test.mjs
 */

import { setTimeout as sleep } from "node:timers/promises";
import process from "node:process";

/**
 * Attempts HEAD request, falls back to GET if needed
 */
async function checkEndpoint(url, method = "HEAD") {
  try {
    const response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(5000), // 5s timeout
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

/**
 * Pings an endpoint and reports status
 */
async function ping(name, url) {
  const t0 = performance.now();
  let result = await checkEndpoint(url, "HEAD");

  // Some APIs don't support HEAD, try GET
  if (!result.ok && result.status === 0) {
    result = await checkEndpoint(url, "GET");
  }

  const ms = Math.round(performance.now() - t0);
  const icon = result.ok ? "✅" : "❌";
  const statusText = result.status > 0 ? `HTTP ${result.status}` : "unreachable";

  console.log(
    `${icon} ${name.padEnd(20)} ${`(${ms}ms)`.padEnd(10)} ${statusText}`
  );

  return result.ok;
}

/**
 * Checks if a local port is in use
 */
async function checkPort(port) {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

console.log("🔍 GROUP7 Smoke Test");
console.log("═".repeat(70));
console.log();

// External API checks
const apiChecks = [
  {
    name: "OpenAI API",
    url: "https://api.openai.com/v1/models",
    critical: true,
  },
  {
    name: "ElevenLabs API",
    url: "https://api.elevenlabs.io/v1/voices",
    critical: true,
  },
  {
    name: "CloudConvert API",
    url: "https://api.cloudconvert.com/v2/users/me",
    critical: true,
  },
  {
    name: "Notion API",
    url: "https://api.notion.com/v1/users/me",
    critical: true,
  },
  {
    name: "Metricool API",
    url: "https://api.metricool.com/v1/account",
    critical: false, // Sometimes rate-limited
  },
  {
    name: "Canva API",
    url: "https://api.canva.com/rest/v1/users/me",
    critical: false, // Requires specific auth
  },
];

console.log("🌐 External API Reachability:");
console.log("─".repeat(70));

let passedApis = 0;
let criticalFailed = false;

for (const { name, url, critical } of apiChecks) {
  const ok = await ping(name, url);
  if (ok) passedApis++;
  if (!ok && critical) criticalFailed = true;
  await sleep(100); // Rate limit ourselves
}

// Local service checks
console.log();
console.log("🖥️  Local Services:");
console.log("─".repeat(70));

const serviceUrl =
  process.env.SERVICE_URL_CANVA_RENDER || "http://localhost:3001";
const serviceUrlObj = new URL(serviceUrl);
const servicePort = serviceUrlObj.port || (serviceUrlObj.protocol === "https:" ? 443 : 80);

let serviceOk = false;
if (serviceUrlObj.hostname === "localhost" || serviceUrlObj.hostname === "127.0.0.1") {
  serviceOk = await checkPort(servicePort);
  const icon = serviceOk ? "✅" : "❌";
  console.log(
    `${icon} Canva Render        (port ${servicePort})          ${serviceOk ? "running" : "not running"}`
  );
} else {
  // Remote service
  const t0 = performance.now();
  const result = await checkEndpoint(`${serviceUrl}/health`);
  const ms = Math.round(performance.now() - t0);
  serviceOk = result.ok;
  const icon = serviceOk ? "✅" : "❌";
  console.log(
    `${icon} Canva Render        (${ms}ms)          ${result.ok ? "reachable" : "unreachable"}`
  );
}

// Summary
console.log();
console.log("═".repeat(70));
console.log("📊 Summary:");
console.log(`   External APIs: ${passedApis}/${apiChecks.length} reachable`);
console.log(`   Local Services: ${serviceOk ? "running" : "NOT running"}`);
console.log();

if (criticalFailed) {
  console.error("❌ CRITICAL: One or more critical APIs are unreachable");
  console.error("   This will prevent the pipeline from functioning");
  process.exit(1);
}

if (!serviceOk) {
  console.error("⚠️  WARNING: Canva Render service is not available");
  console.error("   Start it with: cd Group7/apps/canva-render && npm start");
  console.error("   Or set SERVICE_URL_CANVA_RENDER to a remote endpoint");
  process.exit(1);
}

if (passedApis < apiChecks.length) {
  console.log("⚠️  Some non-critical services are unreachable");
  console.log("   Pipeline may work with reduced functionality");
  process.exit(0);
}

console.log("✅ All systems operational!");
process.exit(0);
