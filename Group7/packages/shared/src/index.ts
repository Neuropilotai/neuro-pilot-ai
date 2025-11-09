/**
 * @group7/shared - Shared utilities for GROUP7 video production pipeline
 */

// Types
export * from './types/index.js';
export type { VoiceSettings, VoiceProfile, TTSRequest, TTSResponse } from './utils/elevenlabs.js';

// Utilities
export { generateJobKey, generateRowHash } from './utils/hash.js';
export { ElevenLabsClient } from './utils/elevenlabs.js';
export { CloudConvertClient } from './utils/cloudconvert.js';
export { MetricoolClient } from './utils/metricool.js';
export { NotionClient } from './utils/notion.js';
export { loadVoiceProfile, loadVoiceProfiles, getVoiceId } from './utils/voice-profiles.js';

// Logger
export { logger } from './logger/index.js';

// Retry/Idempotency (from existing module)
export {
  generateJobKey as generateJobKeyLegacy,
  isJobProcessed,
  getOrCreateJob,
  updateJobStatus,
  retryWithBackoff,
  isRetryableError,
  calculateBackoff,
  sleep
} from './retry.js';
