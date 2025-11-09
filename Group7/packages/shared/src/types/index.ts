/**
 * Shared TypeScript types for GROUP7
 */

export interface VideoJob {
  date: string;           // YYYY-MM-DD
  agent: string;          // Lyra, Atlas, etc.
  sequence: number;       // 1-7
  hook: string;
  insight: string;
  cta: string;
  caption: string;
  hashtags: string;
  post_time: string;
  voice_id: string;
  voice_name?: string;    // Rachel, Bella, etc.
}

export interface VideoAssets {
  job_key: string;
  script: string;
  audio_url?: string;
  video_url?: string;
  final_url?: string;
  thumbnail_url?: string;
}

export interface PipelineResult {
  success: boolean;
  job_key: string;
  assets: VideoAssets;
  metadata: {
    duration_ms: number;
    file_size_bytes?: number;
    created_at: string;
  };
  errors?: string[];
}

export interface ServiceConfig {
  openai_api_key: string;
  elevenlabs_api_key: string;
  cloudconvert_api_key: string;
  canva_app_id: string;
  canva_app_secret: string;
  canva_template_id: string;
  notion_token: string;
  metricool_token: string;
  log_level?: string;
}

export interface RetryConfig {
  max_attempts: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
}

export interface IdempotencyStore {
  [job_key: string]: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    attempts: number;
    first_attempt: string;
    last_attempt: string;
    result?: any;
    error?: string;
  };
}
