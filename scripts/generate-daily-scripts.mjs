#!/usr/bin/env node
/**
 * Group7 – Daily Script Generator
 * Calls OpenAI to generate 6 short-form video scripts (20–25s),
 * validates the JSON, and writes:
 *   Production/Inputs/GROUP7_Daily_<YYYYMMDD>.json
 *
 * Usage:
 *   node scripts/generate-daily-scripts.mjs
 *   node scripts/generate-daily-scripts.mjs --topic "AI agents" --count 6 --lang en
 *   node scripts/generate-daily-scripts.mjs --agents Lyra,Atlas,Nova,Cipher,Echo,Quantum,Nexus
 *
 * Requires:
 *   - OPENAI_API_KEY in .env
 *   - npm i openai (add to package.json)
 */

import fs from "fs/promises";
import path from "path";
import url from "url";
import crypto from "crypto";
import 'dotenv/config';
import OpenAI from "openai";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/* ---------- CLI args ---------- */
function arg(key, def = undefined) {
  const i = process.argv.indexOf(key);
  if (i === -1) return def;
  const val = process.argv[i + 1];
  if (!val || val.startsWith("--")) return true;
  return val;
}

const TOPIC = arg("--topic", "Autonomous AI for creators & businesses");
const COUNT = Math.max(1, Math.min(12, parseInt(arg("--count", "6"), 10)));
const LANG  = (arg("--lang", "en") || "en").toLowerCase(); // en | fr | en-fr
const AGENTS = (arg("--agents", "Lyra,Atlas,Nova,Cipher,Echo,Quantum,Nexus")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean));

/* ---------- Output file path ---------- */
const today = new Date();
const YYYY = today.getFullYear();
const MM = String(today.getMonth() + 1).padStart(2, "0");
const DD = String(today.getDate()).padStart(2, "0");
const outDir = path.resolve(process.cwd(), "Production", "Inputs");
const outFile = path.resolve(outDir, `GROUP7_Daily_${YYYY}${MM}${DD}.json`);

/* ---------- Guards ---------- */
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY in .env");
  process.exit(1);
}

/* ---------- Helper: schema validation ---------- */
function sanitizeText(s) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function validateItems(items) {
  if (!Array.isArray(items)) throw new Error("Model did not return an array.");
  const out = [];
  items.forEach((it, i) => {
    const agent = sanitizeText(it.agent || AGENTS[i % AGENTS.length] || "Lyra");
    const hook = sanitizeText(it.hook);
    const insight = sanitizeText(it.insight);
    const cta = sanitizeText(it.cta);
    const duration = Number(it.duration_seconds ?? 22);

    if (!hook || !insight || !cta) {
      throw new Error(`Item #${i + 1} missing hook/insight/cta`);
    }
    if (duration < 18 || duration > 30) {
      // Clamp to 20–25s window we target
      it.duration_seconds = Math.max(20, Math.min(25, Math.round(duration)));
    }

    out.push({
      id: it.id || `g7_${crypto.randomBytes(4).toString("hex")}`,
      agent,
      trend: sanitizeText(it.trend || TOPIC),
      hook,
      insight,
      cta,
      duration_seconds: Math.max(20, Math.min(25, Math.round(it.duration_seconds ?? 22))),
      visual_cues: Array.isArray(it.visual_cues) ? it.visual_cues.slice(0, 5).map(sanitizeText) : [],
    });
  });
  return out;
}

/* ---------- Prompt (system + user) ---------- */
async function promptBlocks() {
  const langNote = {
    en: "Write in clear, social-first English.",
    fr: "Écris en français clair, format réseaux sociaux.",
    "en-fr": "Alternate English and French lines naturally (bilingual).",
  }[LANG] || "Write in clear, social-first English.";

  // Try to load super prompt if it exists
  let superPrompt = null;
  try {
    const promptPath = path.resolve(process.cwd(), "prompts/claude_super_prompt_v2.json");
    const content = await fs.readFile(promptPath, "utf8");
    superPrompt = JSON.parse(content);
    console.log(`✨ Loaded super prompt (v${superPrompt.version}) with live trends`);
  } catch {
    // Fall back to basic prompt
  }

  const system = superPrompt?.system_prompt || [
    "You are Group7's scriptwriter for short vertical videos (20–25s).",
    "Return STRICT JSON ONLY: an array of objects.",
    "Each object fields:",
    "{ agent, trend, hook, insight, cta, duration_seconds, visual_cues }",
    "- agent: one of: " + AGENTS.join(", "),
    "- trend: short theme aligned to current tech/AI trends.",
    "- hook: 8–12 words, high-curiosity, no clickbait, no emojis.",
    "- insight: 28–38 words, one concrete takeaway or proof.",
    "- cta: 5–8 words, action-oriented for Group7 (follow, watch, discover).",
    "- duration_seconds: integer between 20 and 25.",
    "- visual_cues: array of 2–4 concise scene suggestions.",
    "No leading labels, no prose, JSON array only.",
  ].join("\n");

  const user = [
    `Topic: ${TOPIC}`,
    `Count: ${COUNT}`,
    `Language mode: ${LANG} (${langNote})`,
    "Constraints:",
    "- Absolutely no links, hashtags, or emojis.",
    "- No promises of guaranteed results; be confident but credible.",
    "- Avoid banned claims (medical, financial guarantees).",
    "- Keep brand name as \"Group7\".",
    "Style guidelines:",
    "- Modern, sharp, optimistic; avoid fluff.",
    "- Hooks should feel native to Reels/TikTok/Shorts, no buzzword salad.",
    "- Insights should include a concrete detail (metric, mini-example, or tactic).",
    "- CTA should invite following Group7 or watching more.",
    "",
    "Return an array with COUNT items. Example shape:",
    `[{
      "agent": "Lyra",
      "trend": "Autonomous AI ops",
      "hook": "Autonomous AI already ships while you sleep",
      "insight": "Group7 runs daily learning loops—agents test, measure, and improve. No dashboards to babysit: we deploy, verify, iterate. This is how small teams out-execute.",
      "cta": "Follow Group7 to see how",
      "duration_seconds": 22,
      "visual_cues": ["Lyra speaking", "ticker-style captions", "subtle HUD overlay"]
    }]`,
  ].join("\n");

  return { system, user };
}

/* ---------- OpenAI call with retries ---------- */
async function callOpenAI() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { system, user } = await promptBlocks();
  const model = process.env.GROUP7_OPENAI_MODEL || "gpt-4-1106-preview";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" }, // we'll accept an object but expect array inside
      });

      const content = res.choices?.[0]?.message?.content || "";
      // Some models wrap array in an object; try to find array:
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        // fallback: try to extract array via regex
        const match = content.match(/\[[\s\S]*\]/);
        if (!match) throw new Error("No JSON array found in response.");
        parsed = JSON.parse(match[0]);
      }

      // If object, find first array value
      if (!Array.isArray(parsed)) {
        const firstArray = Object.values(parsed).find((v) => Array.isArray(v));
        if (!firstArray) throw new Error("Response JSON has no array.");
        parsed = firstArray;
      }

      return validateItems(parsed);
    } catch (err) {
      const wait = 800 * attempt;
      console.warn(`⚠️ OpenAI attempt ${attempt} failed: ${err.message || err}`);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

/* ---------- Main ---------- */
(async () => {
  await fs.mkdir(outDir, { recursive: true });
  console.log("▶ Generating scripts with OpenAI…");
  const items = await callOpenAI();

  // Ensure count
  let final = items.slice(0, COUNT);
  // Rotate agents if needed
  final = final.map((it, i) => ({
    ...it,
    agent: it.agent && AGENTS.includes(it.agent) ? it.agent : AGENTS[i % AGENTS.length],
  }));

  await fs.writeFile(outFile, JSON.stringify(final, null, 2), "utf8");
  console.log("✅ Created:", outFile);
  console.log(`   Items: ${final.length} | Agents: ${[...new Set(final.map(x => x.agent))].join(", ")}`);
})();
