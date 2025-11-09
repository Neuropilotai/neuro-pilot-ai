#!/usr/bin/env node
// GROUP7 - Metricool Publisher
import 'dotenv/config';
import { httpWithRetry, maskSecret } from '../../scripts/poll-utils.mjs';
import { readFileSync } from 'fs';

const METRICOOL_API_KEY = process.env.METRICOOL_API_KEY;
const METRICOOL_PROFILE = process.env.METRICOOL_PROFILE_ID;

async function postToMetricool(args) {
  const { videoUrl, caption, agent, slug, scheduledTime } = args;
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📤 METRICOOL PUBLISHER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Agent: ${agent}`);
  console.log(`Slug: ${slug}`);
  console.log(`Video: ${videoUrl.substring(0, 60)}...`);
  console.log();

  if (!METRICOOL_API_KEY) {
    throw new Error('METRICOOL_API_KEY not set');
  }

  const postData = {
    profile_id: METRICOOL_PROFILE,
    social_network: 'tiktok',
    post_type: 'video',
    video_url: videoUrl,
    caption: caption || `${agent}: Building the future together. #Group7 #AI #FutureOfWork`,
    scheduled_time: scheduledTime || null,
    hashtags: ['Group7', 'AI', 'FutureOfWork', agent.replace('-', '')],
    external_id: `${agent}-${slug}`
  };

  console.log('📝 Post preview:');
  console.log(`   Caption: ${postData.caption.substring(0, 80)}...`);
  console.log(`   Hashtags: ${postData.hashtags.join(', ')}`);
  console.log(`   External ID: ${postData.external_id}`);
  
  const response = await httpWithRetry('https://api.metricool.com/v1/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${METRICOOL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(postData)
  });

  const result = await response.json();
  
  console.log(`\n✅ Post scheduled: ${result.post_id}`);
  console.log(`   Status: ${result.status}`);
  console.log(`   Publish at: ${result.scheduled_time || 'immediately'}`);
  
  return {
    status: 'success',
    post_id: result.post_id,
    scheduled_time: result.scheduled_time,
    external_id: postData.external_id
  };
}

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) acc[arg.slice(2)] = arr[i + 1];
  return acc;
}, {});

if (!args.videoUrl || !args.agent || !args.slug) {
  console.error('Usage: node post-to-metricool.mjs --videoUrl URL --agent NAME --slug ID [--caption TEXT] [--scheduledTime ISO]');
  process.exit(1);
}

postToMetricool(args)
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Publishing failed:', err.message);
    process.exit(1);
  });
