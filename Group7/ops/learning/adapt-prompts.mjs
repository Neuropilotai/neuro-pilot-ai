#!/usr/bin/env node
// GROUP7 - Prompt Adaptation Engine
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { httpWithRetry } from '../../scripts/poll-utils.mjs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function loadAnalysis() {
  try {
    const data = readFileSync('Production/logs/learning/analysis_latest.json', 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ No analysis found. Run analyze-performance.mjs first.');
    process.exit(1);
  }
}

async function generateAdaptedPrompts(insights) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎨 GROUP7 LEARNING ENGINE - Prompt Adaptation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const topVideo = insights.topVideos[0];
  const topAgent = insights.topAgents[0];
  
  console.log(`📊 Learning from: ${topVideo.name}`);
  console.log(`🎯 Best agent: ${topAgent.agent} (score: ${topAgent.avgScore.toFixed(2)})`);
  
  const systemPrompt = `You are a viral content strategist analyzing successful short-form video performance.

Based on this top-performing video:
- Name: ${topVideo.name}
- Agent: ${topVideo.agent}
- Views: ${topVideo.views}
- Engagement: ${topVideo.engagement.toFixed(2)}%
- Score: ${topVideo.score.toFixed(2)}

Generate 7 NEW video scripts (one per agent) that replicate the successful patterns while maintaining each agent's unique voice.

Return JSON array with this structure:
[
  {
    "agent": "Lyra-7",
    "hook": "Opening line (8-12 words, curiosity-driven)",
    "insight": "Core message (10-15 words, value proposition)",
    "cta": "Call to action (5-8 words, actionable)"
  },
  ...
]

Patterns to replicate:
1. Hook structure that drove ${topVideo.engagement.toFixed(1)}% engagement
2. Timing/pacing that achieved ${topVideo.views} views
3. ${topAgent.agent}'s voice characteristics (best performer)

Maintain brand consistency: Group7 = AI collective building the future together.`;

  const response = await httpWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate 7 optimized video scripts based on the performance data.' }
      ],
      temperature: 0.8,
      max_tokens: 2000
    })
  });
  
  const data = await response.json();
  const content = data.choices[0].message.content;
  
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('No JSON found in OpenAI response');
  }
  
  const scripts = JSON.parse(jsonMatch[0]);
  
  console.log(`\n✅ Generated ${scripts.length} adapted scripts`);
  scripts.forEach((s, i) => {
    console.log(`${i + 1}. ${s.agent}: "${s.hook}"`);
  });
  
  const output = {
    generated_at: new Date().toISOString(),
    based_on: {
      video: topVideo.name,
      agent: topVideo.agent,
      score: topVideo.score
    },
    scripts
  };
  
  writeFileSync(
    'Production/logs/learning/adapted_prompts.json',
    JSON.stringify(output, null, 2)
  );
  
  console.log('\n✅ Prompts saved: Production/logs/learning/adapted_prompts.json');
  return output;
}

loadAnalysis()
  .then(generateAdaptedPrompts)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Adaptation failed:', err.message);
    process.exit(1);
  });
