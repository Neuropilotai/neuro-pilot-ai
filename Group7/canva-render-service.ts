/**
 * Canva Video Render Service
 * TypeScript endpoint for Make.com to trigger Canva template rendering
 * Supports: autofill, export, job polling
 */

import express, { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';

const app = express();
app.use(express.json());

// ==================== TYPES ====================

interface CanvaAutofillRequest {
  design_id: string;
  data: {
    hook_text: string;
    insight_text: string;
    cta_text: string;
    agent_name: string;
    voice_url?: string;
    brand_primary?: string;
    brand_accent?: string;
    brand_light?: string;
  };
  export?: {
    format: 'mp4' | 'gif' | 'jpg' | 'png';
    quality?: '1080p' | '720p' | '4k';
    fps?: number;
  };
}

interface CanvaExportStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  urls?: string[];
  error?: string;
}

interface CanvaConfig {
  appId: string;
  appSecret: string;
  apiVersion: string;
  baseUrl: string;
  accessToken?: string;
}

// ==================== CONFIG ====================

const CANVA_CONFIG: CanvaConfig = {
  appId: process.env.CANVA_APP_ID || '',
  appSecret: process.env.CANVA_APP_SECRET || '',
  apiVersion: 'v1',
  baseUrl: 'https://api.canva.com',
  accessToken: process.env.CANVA_ACCESS_TOKEN || ''
};

// ==================== UTILITIES ====================

/**
 * Get or refresh Canva access token
 */
async function getAccessToken(): Promise<string> {
  if (CANVA_CONFIG.accessToken) {
    return CANVA_CONFIG.accessToken;
  }

  try {
    const response = await axios.post(
      `${CANVA_CONFIG.baseUrl}/oauth/token`,
      {
        grant_type: 'client_credentials',
        client_id: CANVA_CONFIG.appId,
        client_secret: CANVA_CONFIG.appSecret
      },
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    CANVA_CONFIG.accessToken = response.data.access_token;
    return CANVA_CONFIG.accessToken;
  } catch (error) {
    const axiosError = error as AxiosError;
    throw new Error(`Canva auth failed: ${axiosError.message}`);
  }
}

/**
 * Retry wrapper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry failed');
}

// ==================== CANVA API METHODS ====================

/**
 * Autofill Canva template with data
 */
async function autofillTemplate(request: CanvaAutofillRequest): Promise<string> {
  const token = await getAccessToken();

  const payload = {
    design_id: request.design_id,
    data: {
      // Map data fields to Canva template variables
      variables: {
        hook: request.data.hook_text,
        insight: request.data.insight_text,
        cta: request.data.cta_text,
        agent: request.data.agent_name
      },
      // Brand colors
      brand: {
        colors: {
          primary: request.data.brand_primary || '#0B1220',
          accent: request.data.brand_accent || '#0EA5E9',
          light: request.data.brand_light || '#F8FAFC'
        }
      },
      // Optional voice URL for audio track
      ...(request.data.voice_url && {
        audio: {
          url: request.data.voice_url
        }
      })
    }
  };

  const response = await axios.post(
    `${CANVA_CONFIG.baseUrl}/${CANVA_CONFIG.apiVersion}/designs/${request.design_id}/autofill`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.design_id || request.design_id;
}

/**
 * Export Canva design as video
 */
async function exportDesign(
  designId: string,
  format: string = 'mp4',
  quality: string = '1080p'
): Promise<string> {
  const token = await getAccessToken();

  const payload = {
    format,
    quality,
    ...(format === 'mp4' && {
      video_settings: {
        fps: 30,
        codec: 'h264',
        bitrate: '5000k'
      }
    })
  };

  const response = await axios.post(
    `${CANVA_CONFIG.baseUrl}/${CANVA_CONFIG.apiVersion}/designs/${designId}/export`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.job.id;
}

/**
 * Poll export job status
 */
async function getExportStatus(jobId: string): Promise<CanvaExportStatus> {
  const token = await getAccessToken();

  const response = await axios.get(
    `${CANVA_CONFIG.baseUrl}/${CANVA_CONFIG.apiVersion}/exports/${jobId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = response.data;
  return {
    job_id: jobId,
    status: data.status,
    urls: data.status === 'completed' ? data.urls : undefined,
    error: data.error
  };
}

/**
 * Wait for export completion (with timeout)
 */
async function waitForExport(
  jobId: string,
  timeout: number = 120000,
  pollInterval: number = 3000
): Promise<string[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = await getExportStatus(jobId);

    if (status.status === 'completed' && status.urls) {
      return status.urls;
    }

    if (status.status === 'failed') {
      throw new Error(`Export failed: ${status.error}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Export timeout');
}

// ==================== API ENDPOINTS ====================

/**
 * POST /autofill
 * Autofill Canva template and optionally trigger export
 */
app.post('/autofill', async (req: Request, res: Response) => {
  try {
    const request: CanvaAutofillRequest = req.body;

    if (!request.design_id || !request.data) {
      return res.status(400).json({
        error: 'Missing required fields: design_id, data'
      });
    }

    // Step 1: Autofill template
    const designId = await retryWithBackoff(() => autofillTemplate(request));

    // Step 2: Export if requested
    if (request.export) {
      const jobId = await retryWithBackoff(() =>
        exportDesign(designId, request.export!.format, request.export!.quality)
      );

      return res.json({
        success: true,
        design_id: designId,
        job: {
          id: jobId,
          status: 'pending',
          check_url: `/export/${jobId}`
        }
      });
    }

    return res.json({
      success: true,
      design_id: designId
    });
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Autofill error:', axiosError.message);
    return res.status(500).json({
      error: 'Canva autofill failed',
      details: axiosError.message
    });
  }
});

/**
 * GET /export/:jobId
 * Check export status
 */
app.get('/export/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const status = await retryWithBackoff(() => getExportStatus(jobId));

    return res.json(status);
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Export status error:', axiosError.message);
    return res.status(500).json({
      error: 'Failed to get export status',
      details: axiosError.message
    });
  }
});

/**
 * POST /render
 * All-in-one: autofill + export + wait for completion
 */
app.post('/render', async (req: Request, res: Response) => {
  try {
    const request: CanvaAutofillRequest = req.body;

    if (!request.design_id || !request.data) {
      return res.status(400).json({
        error: 'Missing required fields: design_id, data'
      });
    }

    // Step 1: Autofill
    const designId = await retryWithBackoff(() => autofillTemplate(request));

    // Step 2: Export
    const jobId = await retryWithBackoff(() =>
      exportDesign(
        designId,
        request.export?.format || 'mp4',
        request.export?.quality || '1080p'
      )
    );

    // Step 3: Wait for completion
    const urls = await waitForExport(jobId);

    return res.json({
      success: true,
      design_id: designId,
      job_id: jobId,
      urls,
      download_url: urls[0]
    });
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('Render error:', axiosError.message);
    return res.status(500).json({
      error: 'Canva render failed',
      details: axiosError.message
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'canva-render-service',
    version: '1.0.0',
    canva_configured: !!CANVA_CONFIG.appId && !!CANVA_CONFIG.appSecret
  });
});

// ==================== SERVER ====================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🎨 Canva Render Service running on port ${PORT}`);
  console.log(`Configured: ${!!CANVA_CONFIG.appId && !!CANVA_CONFIG.appSecret}`);
});

export default app;
