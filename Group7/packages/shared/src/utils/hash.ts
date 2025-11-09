/**
 * Hash utilities for idempotency keys
 */

import crypto from 'crypto';
import type { VideoJob } from '../types/index.js';

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
 * Generate row hash (alternative format)
 */
export function generateRowHash(data: {
  agent: string;
  post_time: string;
  hook: string;
  insight: string;
  cta: string;
}): string {
  const input = `${data.agent}|${data.post_time}|${data.hook}|${data.insight}|${data.cta}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 12);
}
