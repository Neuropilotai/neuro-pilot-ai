/**
 * Metricool API Client
 * Social media post scheduling
 */

import axios from 'axios';
import logger from '../logger/index.js';

export interface SchedulePostRequest {
  platforms: ('instagram' | 'tiktok' | 'youtube')[];
  video_url: string;
  caption: string;
  hashtags?: string;
  scheduled_time?: string; // ISO 8601 format
  first_comment?: string;
}

export interface PostResponse {
  post_id: string;
  platforms: string[];
  status: 'scheduled' | 'published' | 'failed';
  scheduled_at?: string;
}

export class MetricoolClient {
  private apiToken: string;
  private baseUrl = 'https://api.metricool.com/v1';

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  /**
   * Schedule social media post
   */
  async schedulePost(request: SchedulePostRequest): Promise<PostResponse> {
    try {
      const fullCaption = request.hashtags
        ? `${request.caption}\n\n${request.hashtags}`
        : request.caption;

      const response = await axios.post(
        `${this.baseUrl}/posts`,
        {
          platforms: request.platforms,
          media: {
            type: 'video',
            url: request.video_url
          },
          caption: fullCaption,
          first_comment: request.first_comment,
          scheduled_time: request.scheduled_time || this.getDefaultScheduleTime()
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info({
        post_id: response.data.id,
        platforms: request.platforms,
        scheduled: request.scheduled_time
      }, 'Post scheduled on Metricool');

      return {
        post_id: response.data.id,
        platforms: request.platforms,
        status: 'scheduled',
        scheduled_at: request.scheduled_time
      };

    } catch (error: any) {
      logger.error({
        error: error.message,
        platforms: request.platforms
      }, 'Metricool scheduling failed');
      throw new Error(`Metricool scheduling failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get post status
   */
  async getPostStatus(postId: string): Promise<PostResponse> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/posts/${postId}`,
        {
          headers: { 'Authorization': `Bearer ${this.apiToken}` }
        }
      );

      return {
        post_id: postId,
        platforms: response.data.platforms,
        status: response.data.status,
        scheduled_at: response.data.scheduled_time
      };
    } catch (error: any) {
      logger.error({ error: error.message, post_id: postId }, 'Failed to get post status');
      throw new Error(`Failed to get post status: ${error.message}`);
    }
  }

  /**
   * Delete scheduled post
   */
  async deletePost(postId: string): Promise<boolean> {
    try {
      await axios.delete(
        `${this.baseUrl}/posts/${postId}`,
        {
          headers: { 'Authorization': `Bearer ${this.apiToken}` }
        }
      );

      logger.info({ post_id: postId }, 'Post deleted from Metricool');
      return true;
    } catch (error: any) {
      logger.error({ error: error.message, post_id: postId }, 'Failed to delete post');
      return false;
    }
  }

  /**
   * Get default schedule time (2 hours from now)
   */
  private getDefaultScheduleTime(): string {
    const date = new Date();
    date.setHours(date.getHours() + 2);
    return date.toISOString();
  }
}

export default MetricoolClient;
