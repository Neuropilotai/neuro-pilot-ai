#!/usr/bin/env node
/**
 * GROUP7 E2E Dry Run
 * Simulates the full video production pipeline with mocked external services
 * Usage: node tests/e2e/dry-run.mjs
 */

import crypto from "node:crypto";

// ============================================================================
// MOCK DATA
// ============================================================================

const SAMPLE_ROWS = [
  {
    agent: "Lyra",
    hook: "Most people wait for the future.",
    insight: "We don't wait. We build.",
    cta: "Join Group7. Build with us.",
    voice: "Rachel",
    post_time: "2025-11-03T19:30:00-05:00",
  },
  {
    agent: "Nova",
    hook: "The best ideas die in spreadsheets.",
    insight: "Ship it. Learn. Iterate.",
    cta: "Stop planning. Start building.",
    voice: "Bella",
    post_time: "2025-11-04T14:00:00-05:00",
  },
];

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Generates idempotency key (row_hash) from content
 */
function generateRowHash(row) {
  const input = `${row.agent}|${row.post_time}|${row.hook}|${row.insight}|${row.cta}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 12);
}

/**
 * Simulates async processing with random delay
 */
function simulateDelay(stepName, minMs = 100, maxMs = 500) {
  const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs);
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`  ⏱️  ${stepName} completed in ${ms}ms`);
      resolve();
    }, ms);
  });
}

// ============================================================================
// MOCKED PIPELINE STAGES
// ============================================================================

/**
 * M1: Scheduler (triggers the workflow)
 */
function mockScheduler() {
  console.log("📅 M1: Scheduler triggered (06:00 ET)");
  return {
    run_id: crypto.randomBytes(4).toString("hex"),
    triggered_at: new Date().toISOString(),
  };
}

/**
 * M2: Ingest CSV from storage
 */
async function mockIngest(runId) {
  console.log("\n📥 M2: Ingesting CSV data...");
  await simulateDelay("Fetched from Google Drive", 200, 400);
  return SAMPLE_ROWS;
}

/**
 * M3: Parse and validate data
 */
async function mockParse(rows) {
  console.log("\n🔍 M3: Parsing and validating data...");
  await simulateDelay("Schema validation", 100, 200);

  const validated = rows.map((row) => ({
    ...row,
    row_hash: generateRowHash(row),
    validated: true,
  }));

  console.log(`  ✅ Validated ${validated.length} rows`);
  return validated;
}

/**
 * M4: Iterator with idempotency check
 */
async function mockIterator(rows) {
  console.log("\n🔄 M4: Checking idempotency...");
  const processed = new Set(); // Mock: would be Notion DB in prod

  const toProcess = rows.filter((row) => {
    if (processed.has(row.row_hash)) {
      console.log(`  ⏭️  Skipping duplicate: ${row.row_hash}`);
      return false;
    }
    return true;
  });

  console.log(`  ✅ ${toProcess.length} new rows to process`);
  return toProcess;
}

/**
 * M5: Claude script polish
 */
async function mockClaude(row) {
  console.log(`\n🤖 M5: Polishing script for ${row.agent}...`);
  await simulateDelay("OpenAI GPT-4", 800, 1500);

  const polished = `${row.hook}\n\n${row.insight}\n\n${row.cta}`;
  return {
    ...row,
    script: polished,
    word_count: polished.split(" ").length,
  };
}

/**
 * M6: ElevenLabs TTS
 */
async function mockTTS(row) {
  console.log(`\n🎙️  M6: Generating voiceover (${row.voice})...`);
  await simulateDelay("ElevenLabs API", 600, 1200);

  const audioFile = `/tmp/audio_${row.row_hash}.mp3`;
  return {
    ...row,
    audio_file: audioFile,
    duration_seconds: 15,
  };
}

/**
 * M7: Canva Render
 */
async function mockCanvaRender(row) {
  console.log(`\n🎨 M7: Rendering Canva template...`);
  await simulateDelay("Canva SDK", 1000, 2000);

  const videoFile = `/tmp/video_${row.row_hash}.mp4`;
  return {
    ...row,
    video_file: videoFile,
  };
}

/**
 * M8: CloudConvert merge
 */
async function mockCloudConvert(row) {
  console.log(`\n🎬 M8: Merging audio + video...`);
  await simulateDelay("CloudConvert", 800, 1500);

  const finalFile = `/tmp/final_${row.row_hash}.mp4`;
  return {
    ...row,
    final_file: finalFile,
    file_size_mb: 12.3,
  };
}

/**
 * M9: Upload to Drive
 */
async function mockUpload(row) {
  console.log(`\n☁️  M9: Uploading to Google Drive...`);
  await simulateDelay("Google Drive API", 500, 1000);

  const driveUrl = `https://drive.google.com/file/d/${row.row_hash}/view`;
  return {
    ...row,
    drive_url: driveUrl,
  };
}

/**
 * M10: Schedule on Metricool
 */
async function mockMetricool(row) {
  console.log(`\n📱 M10: Scheduling social media post...`);
  await simulateDelay("Metricool API", 400, 800);

  const postId = `mtrc_${crypto.randomBytes(4).toString("hex")}`;
  return {
    ...row,
    metricool_id: postId,
    scheduled_at: row.post_time,
  };
}

/**
 * M11: Log to Notion
 */
async function mockNotion(row) {
  console.log(`\n📝 M11: Logging to Notion database...`);
  await simulateDelay("Notion API", 300, 600);

  const pageId = `pg_${crypto.randomBytes(4).toString("hex")}`;
  return {
    ...row,
    notion_page_id: pageId,
  };
}

/**
 * M12: Error router (only called on failure)
 */
async function mockErrorRouter(error, row) {
  console.log(`\n🚨 M12: Error detected, routing alert...`);
  console.error(`   Error: ${error.message}`);
  await simulateDelay("Slack + Notion", 200, 400);

  return {
    alerted: true,
    slack_thread: `ts_${Date.now()}`,
    notion_incident: `incident_${crypto.randomBytes(4).toString("hex")}`,
  };
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

async function runPipeline() {
  console.log("═".repeat(70));
  console.log("🎬 GROUP7 E2E DRY RUN - Full Pipeline Simulation");
  console.log("═".repeat(70));

  try {
    // M1: Start workflow
    const schedule = mockScheduler();

    // M2: Ingest data
    const rows = await mockIngest(schedule.run_id);

    // M3: Parse and validate
    const validated = await mockParse(rows);

    // M4: Check idempotency
    const toProcess = await mockIterator(validated);

    // M5-M11: Process each row
    const results = [];
    for (let i = 0; i < toProcess.length; i++) {
      const row = toProcess[i];
      console.log(`\n${"═".repeat(70)}`);
      console.log(`📹 Processing video ${i + 1}/${toProcess.length}: ${row.agent}`);
      console.log(`${"═".repeat(70)}`);

      let processed = row;
      processed = await mockClaude(processed);
      processed = await mockTTS(processed);
      processed = await mockCanvaRender(processed);
      processed = await mockCloudConvert(processed);
      processed = await mockUpload(processed);
      processed = await mockMetricool(processed);
      processed = await mockNotion(processed);

      results.push(processed);
    }

    // Final summary
    console.log(`\n${"═".repeat(70)}`);
    console.log("✅ DRY RUN COMPLETED SUCCESSFULLY");
    console.log("═".repeat(70));
    console.log();
    console.log("📊 Pipeline Summary:");
    console.log(`   Run ID: ${schedule.run_id}`);
    console.log(`   Processed: ${results.length} videos`);
    console.log(`   Total time: ${Math.round((Date.now() - new Date(schedule.triggered_at).getTime()) / 1000)}s`);
    console.log();

    // Output table
    console.log("📋 Results:");
    console.table(
      results.map((r) => ({
        Agent: r.agent,
        RowHash: r.row_hash,
        Script: `${r.word_count} words`,
        Audio: "✅",
        Video: "✅",
        Scheduled: r.metricool_id,
        Notion: r.notion_page_id,
      }))
    );

    console.log();
    console.log("💡 Next Steps:");
    console.log("   1. Run: npm run env:check (validate API keys)");
    console.log("   2. Run: npm run smoke (test real API endpoints)");
    console.log("   3. Deploy canva-render service");
    console.log("   4. Configure Make.com scenario");
    console.log();

    return { success: true, results };
  } catch (error) {
    console.error(`\n${"═".repeat(70)}`);
    console.error("❌ DRY RUN FAILED");
    console.error("═".repeat(70));
    console.error(`Error: ${error.message}`);
    console.error(error.stack);

    // Trigger error router
    await mockErrorRouter(error, {});

    return { success: false, error: error.message };
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

runPipeline()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
