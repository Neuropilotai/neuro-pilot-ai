#!/usr/bin/env node
// GROUP7 - Notion Logging Script
import 'dotenv/config';
import { httpWithRetry } from './poll-utils.mjs';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_VIDEO_DB_ID;

async function logToNotion(data) {
  const { agent, slug, status, canvaUrl, driveUrl, driveFileId, error } = data;
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 NOTION LOG');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Agent: ${agent} | Slug: ${slug} | Status: ${status}`);
  console.log();

  const properties = {
    'Name': { title: [{ text: { content: `GRP7_${agent}_${slug}` } }] },
    'Agent': { select: { name: agent } },
    'Slug': { rich_text: [{ text: { content: slug } }] },
    'Status': { select: { name: status } },
    'Created': { date: { start: new Date().toISOString() } }
  };

  if (canvaUrl) {
    properties['Canva URL'] = { url: canvaUrl };
  }
  if (driveUrl) {
    properties['Drive Link'] = { url: driveUrl };
  }
  if (driveFileId) {
    properties['File ID'] = { rich_text: [{ text: { content: driveFileId } }] };
  }
  if (error) {
    properties['Error'] = { rich_text: [{ text: { content: error.substring(0, 2000) } }] };
  }

  const response = await httpWithRetry('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      parent: { database_id: DB_ID },
      properties
    })
  });

  const result = await response.json();
  console.log(`✅ Notion page created: ${result.id}`);
  
  return { status: 'success', notionPageId: result.id, url: result.url };
}

const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) acc[arg.slice(2)] = arr[i + 1];
  return acc;
}, {});

if (!args.agent || !args.slug || !args.status) {
  console.error('Usage: node notion-log.mjs --agent NAME --slug ID --status STATUS [--canvaUrl URL] [--driveUrl URL]');
  process.exit(1);
}

logToNotion(args)
  .then(result => { console.log(JSON.stringify(result, null, 2)); process.exit(0); })
  .catch(err => { console.error('❌', err.message); process.exit(1); });
