#!/usr/bin/env node
// GROUP7 - Canva Render Script
import 'dotenv/config';
import { httpWithRetry, pollWithBackoff, maskSecret } from './poll-utils.mjs';

const CANVA_TOKEN = process.env.CANVA_ACCESS_TOKEN;
const CANVA_ENDPOINT = process.env.CANVA_RENDER_ENDPOINT || 'https://api.canva.com/rest/v1/autofills';

async function renderCanvaTemplate(args) {
  const { templateId, hook, insight, cta, agent, slug } = args;
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎨 CANVA RENDER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Template: ${maskSecret(templateId, 8)}`);
  console.log(`Agent: ${agent}`);
  console.log(`Slug: ${slug}`);
  console.log();

  // Create autofill job
  const createResponse = await httpWithRetry(CANVA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CANVA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: `Group7 - ${agent} - ${slug}`,
      design_id: templateId,
      data: {
        hook_text: { type: 'text', text: hook },
        insight_text: { type: 'text', text: insight },
        cta_text: { type: 'text', text: cta }
      }
    })
  });

  const createData = await createResponse.json();
  const jobId = createData.job?.id;
  
  if (!jobId) {
    throw new Error('No job ID returned from Canva');
  }
  
  console.log(`✅ Job created: ${jobId}`);

  // Poll for completion
  const pollResult = await pollWithBackoff({
    fetchFn: async () => {
      const response = await httpWithRetry(`${CANVA_ENDPOINT}/${jobId}`, {
        headers: { 'Authorization': `Bearer ${CANVA_TOKEN}` }
      });
      return response.json();
    },
    checkFn: (data) => {
      const status = data.job?.status;
      if (status === 'success') {
        return { done: true, data: data.job };
      }
      if (status === 'failed') {
        return { done: true, error: data.job?.error || 'Render failed' };
      }
      return { done: false };
    },
    intervalMs: 5000,
    maxPolls: 60,
    label: 'Canva Render'
  });

  if (!pollResult.success) {
    throw new Error(pollResult.error);
  }

  const videoUrl = pollResult.data.url;
  console.log(`✅ Render complete: ${videoUrl}`);

  return {
    status: 'success',
    canvaMp4Url: videoUrl,
    external_id: `${agent}-${slug}`,
    jobId
  };
}

// CLI
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    acc[arg.slice(2)] = arr[i + 1];
  }
  return acc;
}, {});

if (!args.templateId || !args.hook || !args.agent || !args.slug) {
  console.error('Usage: node canva-render.mjs --templateId ID --hook TEXT --insight TEXT --cta TEXT --agent NAME --slug ID');
  process.exit(1);
}

renderCanvaTemplate(args)
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
