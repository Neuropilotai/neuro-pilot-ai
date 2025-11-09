/**
 * Retry & Idempotency Module for Group7 Video Factory
 * Ensures reliable video production with deduplication and fault tolerance
 */

import crypto from 'crypto';

// ==================== TYPES ====================

interface VideoJob {
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
}

interface JobResult {
  job_key: string;
  status: 'success' | 'failed' | 'duplicate' | 'retry';
  attempt: number;
  data?: any;
  error?: string;
  timestamp: string;
}

interface RetryConfig {
  max_attempts: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
  retry_on_status?: number[];
}

interface IdempotencyStore {
  [job_key: string]: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    attempts: number;
    first_attempt: string;
    last_attempt: string;
    result?: any;
    error?: string;
  };
}

// ==================== IDEMPOTENCY ====================

/**
 * Generate unique, deterministic job key
 * Format: {date}_{agent}_{sequence}_{hash}
 */
export function generateJobKey(job: VideoJob): string {
  const baseKey = `${job.date}_${job.agent}_${job.sequence}`;

  // Create content hash for additional uniqueness
  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      hook: job.hook,
      insight: job.insight,
      cta: job.cta
    }))
    .digest('hex')
    .substring(0, 8);

  return `${baseKey}_${contentHash}`;
}

/**
 * Check if job already processed (idempotency check)
 */
export function isJobProcessed(
  jobKey: string,
  store: IdempotencyStore
): boolean {
  return (
    store[jobKey] &&
    (store[jobKey].status === 'completed' || store[jobKey].status === 'processing')
  );
}

/**
 * Get or create job entry in idempotency store
 */
export function getOrCreateJob(
  jobKey: string,
  store: IdempotencyStore
): IdempotencyStore[string] {
  if (!store[jobKey]) {
    store[jobKey] = {
      status: 'pending',
      attempts: 0,
      first_attempt: new Date().toISOString(),
      last_attempt: new Date().toISOString()
    };
  }
  return store[jobKey];
}

/**
 * Update job status
 */
export function updateJobStatus(
  jobKey: string,
  store: IdempotencyStore,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  result?: any,
  error?: string
): void {
  if (!store[jobKey]) {
    throw new Error(`Job ${jobKey} not found in store`);
  }

  store[jobKey].status = status;
  store[jobKey].last_attempt = new Date().toISOString();

  if (result) {
    store[jobKey].result = result;
  }

  if (error) {
    store[jobKey].error = error;
  }
}

// ==================== RETRY LOGIC ====================

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(
  attempt: number,
  config: RetryConfig
): number {
  const delay = Math.min(
    config.initial_delay_ms * Math.pow(config.backoff_multiplier, attempt - 1),
    config.max_delay_ms
  );

  // Add jitter (±20%) to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);

  return Math.floor(delay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {
    max_attempts: 3,
    initial_delay_ms: 1000,
    max_delay_ms: 30000,
    backoff_multiplier: 2
  },
  shouldRetry?: (error: any) => boolean
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= config.max_attempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === config.max_attempts) {
        break;
      }

      // Calculate and wait backoff delay
      const delay = calculateBackoff(attempt, config);

      console.log(
        `Retry attempt ${attempt}/${config.max_attempts} ` +
        `after ${delay}ms (error: ${error.message})`
      );

      await sleep(delay);
    }
  }

  throw new Error(
    `Failed after ${config.max_attempts} attempts: ${lastError.message}`
  );
}

/**
 * Determine if error is retryable
 */
export function isRetryableError(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return true;
  }

  // HTTP status codes that are retryable
  const retryableStatuses = [408, 429, 500, 502, 503, 504];
  if (error.response?.status && retryableStatuses.includes(error.response.status)) {
    return true;
  }

  // Rate limiting
  if (error.message?.includes('rate limit')) {
    return true;
  }

  // Temporary failures
  if (error.message?.includes('temporary') || error.message?.includes('timeout')) {
    return true;
  }

  return false;
}

// ==================== MAKE.COM INTEGRATION ====================

/**
 * Make.com compatible retry module
 * Usage: Add as custom module in scenario
 */
export interface MakeRetryModule {
  input: {
    operation: () => Promise<any>;
    job_key: string;
    max_attempts: number;
    initial_delay_ms: number;
  };
  output: {
    success: boolean;
    result?: any;
    error?: string;
    attempts: number;
    job_key: string;
  };
}

export async function makeRetryHandler(
  input: MakeRetryModule['input']
): Promise<MakeRetryModule['output']> {
  const config: RetryConfig = {
    max_attempts: input.max_attempts || 3,
    initial_delay_ms: input.initial_delay_ms || 1000,
    max_delay_ms: 30000,
    backoff_multiplier: 2
  };

  let attempts = 0;

  try {
    const result = await retryWithBackoff(
      async () => {
        attempts++;
        return await input.operation();
      },
      config,
      isRetryableError
    );

    return {
      success: true,
      result,
      attempts,
      job_key: input.job_key
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      attempts,
      job_key: input.job_key
    };
  }
}

// ==================== NOTION PERSISTENCE ====================

/**
 * Save idempotency state to Notion
 */
export async function saveStateToNotion(
  jobKey: string,
  status: string,
  result: any,
  notionToken: string,
  databaseId: string
): Promise<void> {
  const axios = require('axios');

  await axios.post(
    'https://api.notion.com/v1/pages',
    {
      parent: { database_id: databaseId },
      properties: {
        'Job Key': {
          title: [{ text: { content: jobKey } }]
        },
        'Status': {
          select: { name: status }
        },
        'Result': {
          rich_text: [{ text: { content: JSON.stringify(result) } }]
        },
        'Timestamp': {
          date: { start: new Date().toISOString() }
        }
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      }
    }
  );
}

/**
 * Check Notion for existing job
 */
export async function checkNotionForJob(
  jobKey: string,
  notionToken: string,
  databaseId: string
): Promise<boolean> {
  const axios = require('axios');

  const response = await axios.post(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
    {
      filter: {
        property: 'Job Key',
        title: {
          equals: jobKey
        }
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      }
    }
  );

  return response.data.results.length > 0;
}

// ==================== GOOGLE DRIVE PERSISTENCE ====================

/**
 * Save idempotency state to Google Drive (as JSON file)
 */
export async function saveStateToDrive(
  store: IdempotencyStore,
  driveToken: string,
  folderId: string
): Promise<void> {
  const axios = require('axios');

  const filename = `idempotency_state_${new Date().toISOString().split('T')[0]}.json`;
  const content = JSON.stringify(store, null, 2);

  // Upload to Google Drive
  await axios.post(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      name: filename,
      parents: [folderId],
      mimeType: 'application/json'
    },
    {
      headers: {
        'Authorization': `Bearer ${driveToken}`,
        'Content-Type': 'application/json'
      },
      data: content
    }
  );
}

// ==================== USAGE EXAMPLES ====================

/**
 * Example 1: Basic retry with idempotency
 */
export async function example1() {
  const store: IdempotencyStore = {};

  const job: VideoJob = {
    date: '2025-01-15',
    agent: 'Lyra',
    sequence: 1,
    hook: 'AI is eating the world',
    insight: '90% of Fortune 500 will use autonomous agents by 2026.',
    cta: 'Build your AI today',
    caption: 'The AI revolution is here',
    hashtags: '#AI #Automation',
    post_time: '09:00',
    voice_id: '21m00Tcm4TlvDq8ikWAM'
  };

  const jobKey = generateJobKey(job);

  // Check if already processed
  if (isJobProcessed(jobKey, store)) {
    console.log('Job already processed, skipping');
    return store[jobKey].result;
  }

  // Create job entry
  const jobEntry = getOrCreateJob(jobKey, store);
  updateJobStatus(jobKey, store, 'processing');

  try {
    // Execute with retry
    const result = await retryWithBackoff(
      async () => {
        // Your video production logic here
        return { video_url: 'https://example.com/video.mp4' };
      },
      {
        max_attempts: 3,
        initial_delay_ms: 2000,
        max_delay_ms: 30000,
        backoff_multiplier: 2
      },
      isRetryableError
    );

    updateJobStatus(jobKey, store, 'completed', result);
    return result;
  } catch (error: any) {
    updateJobStatus(jobKey, store, 'failed', undefined, error.message);
    throw error;
  }
}

/**
 * Example 2: Make.com integration
 */
export const MAKE_MODULE_CONFIG = {
  "module_name": "Retry with Idempotency",
  "type": "custom",
  "config": {
    "parameters": [
      {
        "name": "job_key",
        "type": "text",
        "required": true,
        "description": "Unique job identifier (date_agent_sequence)"
      },
      {
        "name": "operation_url",
        "type": "url",
        "required": true,
        "description": "Webhook or API endpoint to call"
      },
      {
        "name": "max_attempts",
        "type": "number",
        "default": 3
      },
      {
        "name": "initial_delay_ms",
        "type": "number",
        "default": 2000
      }
    ],
    "code": `
      // This code runs in Make.com custom module
      const jobKey = input.job_key;
      const maxAttempts = input.max_attempts || 3;
      const initialDelay = input.initial_delay_ms || 2000;

      // Check Notion for existing job
      const exists = await checkNotionForJob(
        jobKey,
        env.NOTION_TOKEN,
        env.NOTION_JOB_DB_ID
      );

      if (exists) {
        return { success: true, message: 'Job already processed (duplicate)', job_key: jobKey };
      }

      // Execute with retry
      let attempts = 0;
      let lastError;

      for (let i = 0; i < maxAttempts; i++) {
        attempts++;
        try {
          const result = await fetch(input.operation_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input)
          }).then(r => r.json());

          // Save success to Notion
          await saveStateToNotion(jobKey, 'completed', result, env.NOTION_TOKEN, env.NOTION_JOB_DB_ID);

          return { success: true, result, attempts, job_key: jobKey };
        } catch (error) {
          lastError = error;
          if (i < maxAttempts - 1) {
            const delay = initialDelay * Math.pow(2, i);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }

      // Save failure to Notion
      await saveStateToNotion(jobKey, 'failed', null, env.NOTION_TOKEN, env.NOTION_JOB_DB_ID);

      throw new Error(\`Failed after \${attempts} attempts: \${lastError.message}\`);
    `
  }
};

export default {
  generateJobKey,
  isJobProcessed,
  getOrCreateJob,
  updateJobStatus,
  retryWithBackoff,
  isRetryableError,
  calculateBackoff,
  sleep,
  saveStateToNotion,
  checkNotionForJob,
  saveStateToDrive
};
