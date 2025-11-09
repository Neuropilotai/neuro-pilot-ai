// GROUP7 VIDEO FACTORY - Polling & HTTP Utilities

import { setTimeout as sleep } from 'node:timers/promises';

export async function httpWithRetry(url, options = {}, maxRetries = 3) {
  const backoffDelays = [5000, 15000, 30000];
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeout || 120000);
      
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      
      if (response.ok) return response;
      
      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const delay = backoffDelays[attempt] || 30000;
          console.log(`[HTTP] Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
      }
      
      if (response.status >= 400) {
        const errorBody = await response.text().catch(() => 'No body');
        throw new Error(`HTTP ${response.status}: ${errorBody.substring(0, 500)}`);
      }
      
      return response;
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(backoffDelays[attempt] || 30000);
      } else {
        throw error;
      }
    }
  }
}

export async function pollWithBackoff(options) {
  const { fetchFn, checkFn, intervalMs = 5000, maxPolls = 60, label = 'Poll' } = options;
  let pollCount = 0;
  
  while (pollCount < maxPolls) {
    pollCount++;
    console.log(`[${label}] Poll ${pollCount}/${maxPolls}...`);
    
    try {
      const data = await fetchFn();
      const result = checkFn(data);
      
      if (result.done) {
        if (result.error) {
          return { success: false, error: result.error, data: result.data };
        }
        console.log(`[${label}] Complete`);
        return { success: true, data: result.data };
      }
      
      if (pollCount < maxPolls) await sleep(intervalMs);
    } catch (error) {
      if (pollCount >= maxPolls) return { success: false, error: error.message };
      await sleep(intervalMs);
    }
  }
  
  return { success: false, error: 'Polling timeout' };
}

export async function downloadFile(url, outputPath) {
  const response = await httpWithRetry(url, { method: 'GET' });
  const fileBuffer = Buffer.from(await response.arrayBuffer());
  const fs = await import('node:fs/promises');
  await fs.writeFile(outputPath, fileBuffer);
  console.log(`[Download] Saved ${(fileBuffer.length/1024/1024).toFixed(2)} MB`);
}

export function maskSecret(value, showLast = 4) {
  if (!value || value.length <= showLast) return '***';
  return '***' + value.slice(-showLast);
}

export function generateExternalId(agent, slug) {
  return `${agent.toLowerCase()}-${slug.toLowerCase()}`.replace(/[^a-z0-9-]/g, '_');
}
