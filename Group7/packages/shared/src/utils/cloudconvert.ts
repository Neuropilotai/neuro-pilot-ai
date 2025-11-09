/**
 * CloudConvert Client
 * Video/audio merging and format conversion
 */

import axios from 'axios';
import logger from '../logger/index.js';

export interface MergeRequest {
  video_url: string;
  audio_url: string;
  output_format?: string;
  quality?: string;
}

export interface ConversionJob {
  id: string;
  status: 'waiting' | 'processing' | 'finished' | 'error';
  result?: {
    files: Array<{
      filename: string;
      url: string;
      size: number;
    }>;
  };
  message?: string;
}

export class CloudConvertClient {
  private apiKey: string;
  private baseUrl = 'https://api.cloudconvert.com/v2';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Merge audio and video files
   */
  async mergeAudioVideo(request: MergeRequest): Promise<string> {
    try {
      // Step 1: Create job
      const jobResponse = await axios.post(
        `${this.baseUrl}/jobs`,
        {
          tasks: {
            'import-video': {
              operation: 'import/url',
              url: request.video_url
            },
            'import-audio': {
              operation: 'import/url',
              url: request.audio_url
            },
            'merge-av': {
              operation: 'merge',
              input: ['import-video', 'import-audio'],
              output_format: request.output_format || 'mp4'
            },
            'export-result': {
              operation: 'export/url',
              input: ['merge-av']
            }
          }
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const jobId = jobResponse.data.data.id;
      logger.info({ job_id: jobId }, 'CloudConvert job created');

      // Step 2: Wait for completion
      const result = await this.waitForJob(jobId);

      // Step 3: Get export URL
      const exportTask = result.data.tasks.find((t: any) => t.name === 'export-result');
      const fileUrl = exportTask?.result?.files?.[0]?.url;

      if (!fileUrl) {
        throw new Error('No export URL in CloudConvert result');
      }

      logger.info({ job_id: jobId, url: fileUrl }, 'Merge completed');
      return fileUrl;

    } catch (error: any) {
      logger.error({ error: error.message }, 'CloudConvert merge failed');
      throw new Error(`CloudConvert merge failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Wait for job completion with polling
   */
  private async waitForJob(jobId: string, timeout = 120000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 3000;

    while (Date.now() - startTime < timeout) {
      const response = await axios.get(
        `${this.baseUrl}/jobs/${jobId}`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` }
        }
      );

      const status = response.data.data.status;

      if (status === 'finished') {
        return response.data;
      }

      if (status === 'error') {
        throw new Error(`Job failed: ${response.data.data.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('CloudConvert job timeout');
  }

  /**
   * Convert video to different format/quality
   */
  async convertVideo(
    videoUrl: string,
    outputFormat: string = 'mp4',
    quality: string = '1080p'
  ): Promise<string> {
    try {
      const jobResponse = await axios.post(
        `${this.baseUrl}/jobs`,
        {
          tasks: {
            'import-video': {
              operation: 'import/url',
              url: videoUrl
            },
            'convert': {
              operation: 'convert',
              input: 'import-video',
              output_format: outputFormat,
              video_codec: 'h264',
              audio_codec: 'aac',
              video_bitrate: quality === '4k' ? 15000 : quality === '1080p' ? 5000 : 2500,
              audio_bitrate: 192
            },
            'export-result': {
              operation: 'export/url',
              input: 'convert'
            }
          }
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const jobId = jobResponse.data.data.id;
      const result = await this.waitForJob(jobId);
      const exportTask = result.data.tasks.find((t: any) => t.name === 'export-result');

      return exportTask?.result?.files?.[0]?.url;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Video conversion failed');
      throw new Error(`Video conversion failed: ${error.message}`);
    }
  }
}

export default CloudConvertClient;
