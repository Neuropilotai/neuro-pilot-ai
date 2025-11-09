#!/usr/bin/env node
/**
 * Group7 Trend Engine
 *
 * Pulls live TikTok/social trend metadata and updates the Claude Super Prompt
 * with the top 3 active trends before daily video generation.
 *
 * Features:
 * - Multi-source trend detection (TikTok, Twitter/X, Reddit, YouTube)
 * - AI/Creator/FutureOfWork relevance filtering
 * - Auto-updates prompts/claude_super_prompt_v2.json
 * - Fallback to cached trends if APIs fail
 *
 * Usage:
 *   node scripts/trend-engine.mjs
 *   node scripts/trend-engine.mjs --sources tiktok,twitter
 *   node scripts/trend-engine.mjs --output prompts/custom_prompt.json
 *
 * Environment Variables:
 *   RAPIDAPI_KEY - Optional for TikTok API access
 *   TWITTER_BEARER_TOKEN - Optional for Twitter trends
 */

import fs from "fs/promises";
import path from "path";
import url from "url";
import 'dotenv/config';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/* ---------- CLI args ---------- */
function arg(key, def = undefined) {
  const i = process.argv.indexOf(key);
  if (i === -1) return def;
  const val = process.argv[i + 1];
  if (!val || val.startsWith("--")) return true;
  return val;
}

const SOURCES = (arg("--sources", "tiktok,twitter,reddit") || "tiktok,twitter,reddit")
  .split(",")
  .map(s => s.trim().toLowerCase());
const OUTPUT = arg("--output", path.resolve(process.cwd(), "prompts/claude_super_prompt_v2.json"));
const CACHE_FILE = path.resolve(process.cwd(), "prompts/.trend_cache.json");

/* ---------- Trend categories we care about ---------- */
const RELEVANT_KEYWORDS = [
  "ai", "artificial intelligence", "automation", "creator",
  "content creation", "future of work", "group7", "autonomous",
  "machine learning", "chatgpt", "openai", "tech", "startup",
  "productivity", "business", "entrepreneur", "digital marketing"
];

/* ---------- Trend Sources ---------- */

/**
 * Source 1: TikTok via RapidAPI (requires RAPIDAPI_KEY)
 */
async function fetchTikTokTrends() {
  if (!process.env.RAPIDAPI_KEY) {
    console.log("⏭️  Skipping TikTok API (no RAPIDAPI_KEY)");
    return [];
  }

  try {
    const response = await fetch("https://tiktok-scraper7.p.rapidapi.com/feed/trending", {
      method: "GET",
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
        "x-rapidapi-host": "tiktok-scraper7.p.rapidapi.com"
      }
    });

    if (!response.ok) throw new Error(`TikTok API: ${response.status}`);

    const data = await response.json();
    const trends = [];

    // Extract hashtags from trending videos
    if (data.data?.videos) {
      data.data.videos.slice(0, 20).forEach(video => {
        if (video.desc) {
          const hashtags = video.desc.match(/#\w+/g) || [];
          hashtags.forEach(tag => {
            const clean = tag.slice(1).toLowerCase();
            if (isRelevant(clean)) {
              trends.push({
                source: "tiktok",
                keyword: clean,
                type: "hashtag",
                engagement: video.stats?.playCount || 0
              });
            }
          });
        }
      });
    }

    return trends;
  } catch (err) {
    console.warn(`⚠️ TikTok fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Source 2: Twitter/X Trends (requires TWITTER_BEARER_TOKEN)
 */
async function fetchTwitterTrends() {
  if (!process.env.TWITTER_BEARER_TOKEN) {
    console.log("⏭️  Skipping Twitter (no TWITTER_BEARER_TOKEN)");
    return [];
  }

  try {
    // Twitter API v2 - get trends for worldwide (WOEID: 1)
    const response = await fetch("https://api.twitter.com/2/trends/by/woeid/1", {
      headers: {
        "Authorization": `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
      }
    });

    if (!response.ok) throw new Error(`Twitter API: ${response.status}`);

    const data = await response.json();
    const trends = [];

    if (data.data) {
      data.data.slice(0, 30).forEach(trend => {
        const keyword = trend.name.replace(/^#/, "").toLowerCase();
        if (isRelevant(keyword)) {
          trends.push({
            source: "twitter",
            keyword,
            type: "trend",
            engagement: trend.tweet_volume || 0
          });
        }
      });
    }

    return trends;
  } catch (err) {
    console.warn(`⚠️ Twitter fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Source 3: Reddit (public, no auth needed)
 */
async function fetchRedditTrends() {
  try {
    const subreddits = ["artificial", "Entrepreneur", "FutureOfWork", "ChatGPT", "OpenAI"];
    const trends = [];

    for (const sub of subreddits) {
      const response = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, {
        headers: { "User-Agent": "Group7TrendBot/1.0" }
      });

      if (!response.ok) continue;

      const data = await response.json();

      if (data.data?.children) {
        data.data.children.forEach(post => {
          const title = post.data.title.toLowerCase();
          const keywords = extractKeywords(title);
          keywords.forEach(kw => {
            if (isRelevant(kw)) {
              trends.push({
                source: "reddit",
                keyword: kw,
                type: "topic",
                engagement: post.data.score || 0
              });
            }
          });
        });
      }
    }

    return trends;
  } catch (err) {
    console.warn(`⚠️ Reddit fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Source 4: YouTube trending (via RSS, no auth)
 */
async function fetchYouTubeTrends() {
  try {
    // YouTube trending tech feed (public RSS)
    const response = await fetch("https://www.youtube.com/feeds/trending.rss?type=default");

    if (!response.ok) throw new Error(`YouTube RSS: ${response.status}`);

    const xml = await response.text();
    const trends = [];

    // Simple XML parsing for titles
    const titleMatches = xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);

    for (const match of titleMatches) {
      const title = match[1].toLowerCase();
      const keywords = extractKeywords(title);
      keywords.forEach(kw => {
        if (isRelevant(kw)) {
          trends.push({
            source: "youtube",
            keyword: kw,
            type: "video_topic",
            engagement: 100 // Default score
          });
        }
      });
    }

    return trends;
  } catch (err) {
    console.warn(`⚠️ YouTube fetch failed: ${err.message}`);
    return [];
  }
}

/* ---------- Helper functions ---------- */

function isRelevant(keyword) {
  return RELEVANT_KEYWORDS.some(kw =>
    keyword.includes(kw) || kw.includes(keyword)
  );
}

function extractKeywords(text) {
  // Extract meaningful words (3+ chars, not common words)
  const stopwords = ["the", "and", "for", "with", "this", "that", "from", "are", "was"];
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length >= 3 && !stopwords.includes(w));
}

function aggregateAndRank(allTrends) {
  const map = new Map();

  allTrends.forEach(trend => {
    const key = trend.keyword;
    if (!map.has(key)) {
      map.set(key, { ...trend, totalEngagement: 0, sources: [] });
    }
    const existing = map.get(key);
    existing.totalEngagement += trend.engagement;
    if (!existing.sources.includes(trend.source)) {
      existing.sources.push(trend.source);
    }
  });

  // Sort by engagement + multi-source bonus
  return Array.from(map.values())
    .map(t => ({
      ...t,
      score: t.totalEngagement + (t.sources.length * 1000) // Multi-source = higher relevance
    }))
    .sort((a, b) => b.score - a.score);
}

/* ---------- Cache handling ---------- */

async function loadCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, "utf8");
    const cache = JSON.parse(data);
    const age = Date.now() - cache.timestamp;

    // Cache valid for 6 hours
    if (age < 6 * 60 * 60 * 1000) {
      return cache.trends;
    }
  } catch {
    // No cache or invalid
  }
  return null;
}

async function saveCache(trends) {
  await fs.writeFile(
    CACHE_FILE,
    JSON.stringify({ timestamp: Date.now(), trends }, null, 2),
    "utf8"
  );
}

/* ---------- Prompt update ---------- */

async function updateSuperPrompt(topTrends) {
  const promptPath = path.resolve(OUTPUT);

  let basePrompt;
  try {
    const content = await fs.readFile(promptPath, "utf8");
    basePrompt = JSON.parse(content);
  } catch {
    // Create new if doesn't exist
    basePrompt = {
      version: "2.0",
      updated: new Date().toISOString(),
      system_prompt: "",
      active_trends: []
    };
  }

  // Update trends
  basePrompt.active_trends = topTrends.slice(0, 3).map(t => ({
    keyword: t.keyword,
    sources: t.sources,
    score: t.score
  }));
  basePrompt.updated = new Date().toISOString();

  // Inject into system prompt
  const trendText = topTrends
    .slice(0, 3)
    .map(t => `#${t.keyword} (${t.sources.join(", ")})`)
    .join(", ");

  basePrompt.system_prompt = `You are Group7's AI scriptwriter creating viral short-form videos (20-25s).

**Current Trending Topics (Live):**
${trendText}

Focus scripts on these trends while maintaining Group7's voice: modern, sharp, optimistic, no fluff.

Return STRICT JSON: array of video script objects.
Each object must have: agent, trend, hook, insight, cta, duration_seconds, visual_cues.

Guidelines:
- Hook: 8-12 words, high curiosity, native to TikTok/Reels/Shorts
- Insight: 28-38 words, concrete detail or proof
- CTA: 5-8 words, action-oriented
- No emojis, links, or hashtags in scripts
- Duration: 20-25 seconds
- Agents: Lyra, Atlas, Nova, Cipher, Echo, Quantum, Nexus`;

  await fs.writeFile(promptPath, JSON.stringify(basePrompt, null, 2), "utf8");
  return basePrompt;
}

/* ---------- Main ---------- */

(async () => {
  console.log("🔍 Group7 Trend Engine starting...\n");

  // Try to fetch fresh trends
  const allTrends = [];

  if (SOURCES.includes("tiktok")) {
    const tiktok = await fetchTikTokTrends();
    allTrends.push(...tiktok);
    console.log(`📱 TikTok: ${tiktok.length} relevant trends`);
  }

  if (SOURCES.includes("twitter")) {
    const twitter = await fetchTwitterTrends();
    allTrends.push(...twitter);
    console.log(`🐦 Twitter: ${twitter.length} relevant trends`);
  }

  if (SOURCES.includes("reddit")) {
    const reddit = await fetchRedditTrends();
    allTrends.push(...reddit);
    console.log(`🤖 Reddit: ${reddit.length} relevant trends`);
  }

  if (SOURCES.includes("youtube")) {
    const youtube = await fetchYouTubeTrends();
    allTrends.push(...youtube);
    console.log(`📺 YouTube: ${youtube.length} relevant trends`);
  }

  // If no trends fetched, use cache
  if (allTrends.length === 0) {
    console.log("\n⚠️  No trends fetched, checking cache...");
    const cached = await loadCache();
    if (cached) {
      console.log("✅ Using cached trends (< 6 hours old)");
      allTrends.push(...cached);
    } else {
      console.error("❌ No cache available. Cannot proceed.");
      process.exit(1);
    }
  } else {
    // Save fresh trends to cache
    await saveCache(allTrends);
  }

  // Aggregate and rank
  const ranked = aggregateAndRank(allTrends);
  const top3 = ranked.slice(0, 3);

  console.log("\n🔥 Top 3 Trends:");
  top3.forEach((t, i) => {
    console.log(`   ${i + 1}. #${t.keyword} (score: ${t.score}, sources: ${t.sources.join(", ")})`);
  });

  // Update super prompt
  await updateSuperPrompt(ranked);
  console.log(`\n✅ Super Prompt updated: ${OUTPUT}`);

  console.log("\n💡 Next step: Run video generation with fresh trends:");
  console.log("   npm run g7:gen");
})();
