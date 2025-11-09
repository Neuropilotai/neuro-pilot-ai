/**
 * GROUP7 Main Orchestrator
 * Coordinates the full video production pipeline:
 * CSV/Notion → Script Polish → TTS → Canva → Merge → Upload → Schedule → Log
 */

import dotenv from 'dotenv';
import {
  logger,
  VideoJob,
  generateJobKey,
  ElevenLabsClient,
  CloudConvertClient,
  MetricoolClient,
  NotionClient,
  retryWithBackoff,
  isRetryableError
} from '@group7/shared';
import axios from 'axios';

// Load environment variables
dotenv.config({ path: '../../.env' });

// ==================== CONFIG ====================

interface Config {
  openai_api_key: string;
  elevenlabs_api_key: string;
  cloudconvert_api_key: string;
  canva_service_url: string;
  canva_template_id: string;
  notion_token: string;
  notion_database_id: string;
  metricool_token: string;
}

function loadConfig(): Config {
  const required = [
    'OPENAI_API_KEY',
    'ELEVENLABS_API_KEY',
    'CLOUDCONVERT_API_KEY',
    'SERVICE_URL_CANVA_RENDER',
    'CANVA_TEMPLATE_ID',
    'NOTION_TOKEN',
    'METRICOOL_API_TOKEN'
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    openai_api_key: process.env.OPENAI_API_KEY!,
    elevenlabs_api_key: process.env.ELEVENLABS_API_KEY!,
    cloudconvert_api_key: process.env.CLOUDCONVERT_API_KEY!,
    canva_service_url: process.env.SERVICE_URL_CANVA_RENDER!,
    canva_template_id: process.env.CANVA_TEMPLATE_ID!,
    notion_token: process.env.NOTION_TOKEN!,
    notion_database_id: process.env.NOTION_DATABASE_ID || '',
    metricool_token: process.env.METRICOOL_API_TOKEN!
  };
}

// ==================== PIPELINE STAGES ====================

class VideoPipeline {
  private config: Config;
  private elevenlabs: ElevenLabsClient;
  private cloudconvert: CloudConvertClient;
  private metricool: MetricoolClient;
  private notion: NotionClient;

  constructor(config: Config) {
    this.config = config;
    this.elevenlabs = new ElevenLabsClient(config.elevenlabs_api_key);
    this.cloudconvert = new CloudConvertClient(config.cloudconvert_api_key);
    this.metricool = new MetricoolClient(config.metricool_token);
    this.notion = new NotionClient(config.notion_token);
  }

  /**
   * M5: Polish script with GPT-4
   */
  async polishScript(job: VideoJob): Promise<string> {
    const prompt = `You are a viral content creator. Polish this social media script to be engaging and compelling:

Hook: ${job.hook}
Insight: ${job.insight}
CTA: ${job.cta}

Output only the final script, optimized for a 15-second video. Keep it punchy and authentic.`;

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'You are a viral content scriptwriter.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.8
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.openai_api_key}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const polished = response.data.choices[0].message.content.trim();
    logger.info({ job_key: generateJobKey(job) }, 'Script polished with GPT-4');
    return polished;
  }

  /**
   * M6: Generate voiceover with ElevenLabs
   */
  async generateVoiceover(script: string, voiceId: string): Promise<string> {
    const result = await retryWithBackoff(
      () => this.elevenlabs.textToSpeech({
        text: script,
        voice_id: voiceId
      }),
      {
        max_attempts: 3,
        initial_delay_ms: 2000,
        max_delay_ms: 30000,
        backoff_multiplier: 2
      },
      isRetryableError
    );

    // TODO: Upload audio_base64 to Google Drive/OneDrive and get URL
    // For now, return placeholder
    const audioUrl = `data:audio/mp3;base64,${result.audio_base64}`;
    logger.info({ chars: result.character_count }, 'Voiceover generated');
    return audioUrl;
  }

  /**
   * M7: Render Canva template
   */
  async renderCanva(job: VideoJob, script: string, audioUrl: string): Promise<string> {
    const response = await retryWithBackoff(
      () => axios.post(
        `${this.config.canva_service_url}/render`,
        {
          design_id: this.config.canva_template_id,
          data: {
            hook_text: job.hook,
            insight_text: job.insight,
            cta_text: job.cta,
            agent_name: job.agent,
            voice_url: audioUrl
          },
          export: {
            format: 'mp4',
            quality: '1080p'
          }
        }
      ),
      {
        max_attempts: 3,
        initial_delay_ms: 2000,
        max_delay_ms: 30000,
        backoff_multiplier: 2
      },
      isRetryableError
    );

    const videoUrl = response.data.download_url;
    logger.info({ video_url: videoUrl }, 'Canva render complete');
    return videoUrl;
  }

  /**
   * M8: Merge audio + video with CloudConvert
   */
  async mergeAssets(videoUrl: string, audioUrl: string): Promise<string> {
    const finalUrl = await retryWithBackoff(
      () => this.cloudconvert.mergeAudioVideo({
        video_url: videoUrl,
        audio_url: audioUrl,
        output_format: 'mp4',
        quality: '1080p'
      }),
      {
        max_attempts: 3,
        initial_delay_ms: 3000,
        max_delay_ms: 60000,
        backoff_multiplier: 2
      },
      isRetryableError
    );

    logger.info({ final_url: finalUrl }, 'Assets merged');
    return finalUrl;
  }

  /**
   * M9: Upload to Google Drive (TODO: implement)
   */
  async uploadToDrive(videoUrl: string, jobKey: string): Promise<string> {
    // TODO: Implement Google Drive upload
    // For now, return the CloudConvert URL
    logger.info({ job_key: jobKey }, 'Upload to Drive (placeholder)');
    return videoUrl;
  }

  /**
   * M10: Schedule on Metricool
   */
  async schedulePost(job: VideoJob, videoUrl: string): Promise<string> {
    const result = await retryWithBackoff(
      () => this.metricool.schedulePost({
        platforms: ['instagram', 'tiktok', 'youtube'],
        video_url: videoUrl,
        caption: job.caption,
        hashtags: job.hashtags,
        scheduled_time: `${job.date}T${job.post_time}:00-05:00` // ET timezone
      }),
      {
        max_attempts: 3,
        initial_delay_ms: 2000,
        max_delay_ms: 30000,
        backoff_multiplier: 2
      },
      isRetryableError
    );

    logger.info({ post_id: result.post_id, platforms: result.platforms }, 'Post scheduled');
    return result.post_id;
  }

  /**
   * M11: Log to Notion
   */
  async logToNotion(jobKey: string, job: VideoJob, videoUrl: string, duration: number): Promise<string> {
    if (!this.config.notion_database_id) {
      logger.warn('Notion database ID not configured, skipping logging');
      return '';
    }

    const pageId = await this.notion.logProduction(
      this.config.notion_database_id,
      {
        job_key: jobKey,
        status: 'completed',
        job,
        assets: {
          job_key: jobKey,
          script: `${job.hook} ${job.insight} ${job.cta}`,
          final_url: videoUrl
        },
        duration_ms: duration
      }
    );

    logger.info({ page_id: pageId }, 'Logged to Notion');
    return pageId;
  }

  /**
   * Full pipeline: Execute all stages
   */
  async processJob(job: VideoJob): Promise<void> {
    const startTime = Date.now();
    const jobKey = generateJobKey(job);

    logger.info({ job_key: jobKey, agent: job.agent }, 'Starting video production');

    try {
      // Check idempotency (M4)
      if (this.config.notion_database_id) {
        const exists = await this.notion.checkJobExists(this.config.notion_database_id, jobKey);
        if (exists) {
          logger.info({ job_key: jobKey }, 'Job already processed (duplicate), skipping');
          return;
        }
      }

      // M5: Polish script
      const script = await this.polishScript(job);

      // M6: Generate voiceover
      const audioUrl = await this.generateVoiceover(script, job.voice_id);

      // M7: Render Canva
      const videoUrl = await this.renderCanva(job, script, audioUrl);

      // M8: Merge assets (if audio is separate)
      const finalUrl = audioUrl.startsWith('http')
        ? await this.mergeAssets(videoUrl, audioUrl)
        : videoUrl;

      // M9: Upload to Drive
      const driveUrl = await this.uploadToDrive(finalUrl, jobKey);

      // M10: Schedule on Metricool
      await this.schedulePost(job, driveUrl);

      // M11: Log to Notion
      const duration = Date.now() - startTime;
      await this.logToNotion(jobKey, job, driveUrl, duration);

      logger.info({ job_key: jobKey, duration_ms: duration }, 'Video production completed');

    } catch (error: any) {
      logger.error({ job_key: jobKey, error: error.message }, 'Video production failed');

      // Log failure to Notion
      if (this.config.notion_database_id) {
        await this.notion.logProduction(
          this.config.notion_database_id,
          {
            job_key: jobKey,
            status: 'failed',
            job,
            error: error.message,
            duration_ms: Date.now() - startTime
          }
        );
      }

      throw error;
    }
  }
}

// ==================== MAIN ====================

async function main() {
  logger.info('GROUP7 Orchestrator starting...');

  const config = loadConfig();
  const pipeline = new VideoPipeline(config);

  // Example job (in production, this would come from CSV or Notion)
  const sampleJob: VideoJob = {
    date: '2025-11-03',
    agent: 'Lyra',
    sequence: 1,
    hook: 'AI is eating software.',
    insight: 'In 2026, 90% of new startups will be AI-native.',
    cta: 'Build with us at Group7.',
    caption: 'The AI revolution is here.',
    hashtags: '#AI #Automation #Group7',
    post_time: '19:00',
    voice_id: '21m00Tcm4TlvDq8ikWAM' // Rachel
  };

  try {
    await pipeline.processJob(sampleJob);
    logger.info('Orchestrator run completed successfully');
    process.exit(0);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Orchestrator run failed');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { VideoPipeline, loadConfig };
