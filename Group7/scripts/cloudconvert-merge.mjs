#!/usr/bin/env node
// GROUP7 - CloudConvert Merge Script
import 'dotenv/config';
import { httpWithRetry, pollWithBackoff, maskSecret } from './poll-utils.mjs';

const CC_API_KEY = process.env.CLOUDCONVERT_API_KEY;
const CC_URL = process.env.CLOUDCONVERT_API_URL || 'https://api.cloudconvert.com/v2';

async function mergeVideoAudio(args) {
  const { videoUrl, audioUrl, agent, slug } = args;
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 CLOUDCONVERT MERGE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Agent: ${agent} | Slug: ${slug}`);
  console.log();

  const jobPayload = {
    tasks: {
      'import-video': { operation: 'import/url', url: videoUrl, filename: 'video.mp4' },
      'import-audio': { operation: 'import/url', url: audioUrl, filename: 'audio.mp3' },
      'merge': {
        operation: 'merge',
        input: ['import-video', 'import-audio'],
        output_format: 'mp4',
        video_codec: 'h264',
        crf: parseInt(process.env.VIDEO_CRF || 22),
        audio_codec: 'aac',
        audio_bitrate: '192',
        audio_normalize: 'loudnorm',
        loudness_target: process.env.AUDIO_LUFS_TARGET || '-14'
      },
      'export': { operation: 'export/url', input: 'merge' }
    },
    tag: `group7-${agent}-${slug}`
  };

  const createResponse = await httpWithRetry(`${CC_URL}/jobs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CC_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(jobPayload)
  });

  const createData = await createResponse.json();
  const jobId = createData.data?.id;
  
  if (!jobId) throw new Error('No job ID from CloudConvert');
  console.log(`✅ Job created: ${jobId}`);

  const pollResult = await pollWithBackoff({
    fetchFn: async () => {
      const response = await httpWithRetry(`${CC_URL}/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${CC_API_KEY}` }
      });
      return response.json();
    },
    checkFn: (data) => {
      const status = data.data?.status;
      if (status === 'finished') {
        const exportTask = data.data.tasks.find(t => t.name === 'export');
        const fileUrl = exportTask?.result?.files?.[0]?.url;
        return { done: true, data: { fileUrl } };
      }
      if (status === 'error') {
        return { done: true, error: 'CloudConvert job failed' };
      }
      return { done: false };
    },
    intervalMs: 5000,
    maxPolls: 120,
    label: 'CloudConvert'
  });

  if (!pollResult.success) throw new Error(pollResult.error);

  console.log(`✅ Merge complete: ${pollResult.data.fileUrl}`);
  return {
    status: 'success',
    mergedMp4Url: pollResult.data.fileUrl,
    jobId
  };
}

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) acc[arg.slice(2)] = arr[i + 1];
  return acc;
}, {});

if (!args.videoUrl || !args.audioUrl || !args.agent || !args.slug) {
  console.error('Usage: node cloudconvert-merge.mjs --videoUrl URL --audioUrl URL --agent NAME --slug ID');
  process.exit(1);
}

mergeVideoAudio(args)
  .then(result => { console.log(JSON.stringify(result, null, 2)); process.exit(0); })
  .catch(err => { console.error('❌', err.message); process.exit(1); });
