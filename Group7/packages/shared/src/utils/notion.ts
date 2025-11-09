/**
 * Notion API Client
 * Analytics logging and idempotency tracking
 */

import axios from 'axios';
import logger from '../logger/index.js';
import type { VideoJob, VideoAssets } from '../types/index.js';

export interface NotionLogEntry {
  job_key: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  job: VideoJob;
  assets?: VideoAssets;
  error?: string;
  attempts?: number;
  duration_ms?: number;
}

export class NotionClient {
  private token: string;
  private baseUrl = 'https://api.notion.com/v1';
  private version = '2022-06-28';

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Log video production to Notion database
   */
  async logProduction(databaseId: string, entry: NotionLogEntry): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/pages`,
        {
          parent: { database_id: databaseId },
          properties: {
            'Job Key': {
              title: [{ text: { content: entry.job_key } }]
            },
            'Status': {
              select: { name: entry.status }
            },
            'Agent': {
              rich_text: [{ text: { content: entry.job.agent } }]
            },
            'Date': {
              date: { start: entry.job.date }
            },
            'Hook': {
              rich_text: [{ text: { content: entry.job.hook.substring(0, 2000) } }]
            },
            'Video URL': entry.assets?.final_url ? {
              url: entry.assets.final_url
            } : undefined,
            'Duration (ms)': entry.duration_ms ? {
              number: entry.duration_ms
            } : undefined,
            'Attempts': entry.attempts ? {
              number: entry.attempts
            } : undefined,
            'Error': entry.error ? {
              rich_text: [{ text: { content: entry.error.substring(0, 2000) } }]
            } : undefined
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Notion-Version': this.version
          }
        }
      );

      const pageId = response.data.id;
      logger.info({ job_key: entry.job_key, page_id: pageId }, 'Logged to Notion');
      return pageId;

    } catch (error: any) {
      logger.error({ error: error.message, job_key: entry.job_key }, 'Notion logging failed');
      throw new Error(`Notion logging failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Check if job key already exists (idempotency check)
   */
  async checkJobExists(databaseId: string, jobKey: string): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/databases/${databaseId}/query`,
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
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Notion-Version': this.version
          }
        }
      );

      const exists = response.data.results.length > 0;
      if (exists) {
        logger.info({ job_key: jobKey }, 'Duplicate job detected in Notion');
      }
      return exists;

    } catch (error: any) {
      logger.error({ error: error.message, job_key: jobKey }, 'Notion query failed');
      return false; // Fail open for idempotency check
    }
  }

  /**
   * Update existing Notion page
   */
  async updatePage(pageId: string, updates: Partial<NotionLogEntry>): Promise<void> {
    try {
      await axios.patch(
        `${this.baseUrl}/pages/${pageId}`,
        {
          properties: {
            'Status': updates.status ? {
              select: { name: updates.status }
            } : undefined,
            'Video URL': updates.assets?.final_url ? {
              url: updates.assets.final_url
            } : undefined,
            'Duration (ms)': updates.duration_ms ? {
              number: updates.duration_ms
            } : undefined,
            'Error': updates.error ? {
              rich_text: [{ text: { content: updates.error.substring(0, 2000) } }]
            } : undefined
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Notion-Version': this.version
          }
        }
      );

      logger.info({ page_id: pageId }, 'Updated Notion page');
    } catch (error: any) {
      logger.error({ error: error.message, page_id: pageId }, 'Notion update failed');
      throw new Error(`Notion update failed: ${error.message}`);
    }
  }

  /**
   * Get all jobs from database (for analytics)
   */
  async getJobs(databaseId: string, filter?: any): Promise<any[]> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/databases/${databaseId}/query`,
        { filter },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Notion-Version': this.version
          }
        }
      );

      return response.data.results;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch Notion jobs');
      throw new Error(`Failed to fetch jobs: ${error.message}`);
    }
  }
}

export default NotionClient;
