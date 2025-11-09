#!/usr/bin/env node
// GROUP7 - Daily Video Scheduler
import 'dotenv/config';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

function loadSchedulerConfig() {
  try {
    return JSON.parse(readFileSync('config/scheduler.json', 'utf-8'));
  } catch (error) {
    return {
      daily_schedule: [
        { time: '09:00', agent: 'Lyra-7' },
        { time: '11:00', agent: 'Atlas' },
        { time: '13:00', agent: 'Nova' },
        { time: '15:00', agent: 'Cipher' },
        { time: '17:00', agent: 'Echo' },
        { time: '19:00', agent: 'Quantum' },
        { time: '21:00', agent: 'Nexus' }
      ]
    };
  }
}

function loadAdaptedPrompts() {
  try {
    return JSON.parse(readFileSync('Production/logs/learning/adapted_prompts.json', 'utf-8'));
  } catch (error) {
    return null;
  }
}

async function runDailySchedule() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📅 GROUP7 DAILY SCHEDULER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Date: ${new Date().toLocaleDateString()}`);
  console.log();

  const config = loadSchedulerConfig();
  const prompts = loadAdaptedPrompts();
  const slug = `daily_${new Date().toISOString().split('T')[0].replace(/-/g, '_')}`;

  console.log(`📊 Loaded ${config.daily_schedule.length} scheduled posts`);
  
  if (prompts) {
    console.log('✅ Using AI-adapted prompts from learning loop');
  } else {
    console.log('⚠️  No adapted prompts found - using defaults');
  }

  console.log('\n▶ Starting production pipeline...\n');

  for (const schedule of config.daily_schedule) {
    const { agent, time } = schedule;
    const agentSlug = `${slug}_${agent.toLowerCase().replace('-', '_')}`;
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📹 Producing: ${agent} (scheduled for ${time})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const script = prompts?.scripts?.find(s => s.agent === agent);
    const hook = script?.hook || `${agent} daily insight`;
    const insight = script?.insight || 'Building the future together';
    const cta = script?.cta || 'Follow Group7';

    try {
      execSync(`node ops/run-one.mjs --agent ${agent.split('-')[0]} --slug ${agentSlug} --hook "${hook}" --insight "${insight}" --cta "${cta}"`, { stdio: 'inherit' });
      
      console.log(`\n✅ ${agent} production complete`);
      
      const driveLink = `https://drive.google.com/drive/folders/${process.env.GDRIVE_OUTPUT_FOLDER_ID}`;
      const scheduledTime = new Date();
      const [hours, minutes] = time.split(':');
      scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0);

      console.log(`📤 Scheduling post for ${scheduledTime.toISOString()}`);
      
      try {
        execSync(`node ops/publisher/post-to-metricool.mjs --videoUrl "${driveLink}" --agent ${agent} --slug ${agentSlug} --scheduledTime ${scheduledTime.toISOString()}`, { stdio: 'inherit' });
        console.log(`✅ ${agent} scheduled on Metricool`);
      } catch (publishError) {
        console.error(`⚠️  Metricool scheduling failed for ${agent}: ${publishError.message}`);
      }

    } catch (error) {
      console.error(`❌ Production failed for ${agent}: ${error.message}`);
      continue;
    }

    console.log();
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ DAILY SCHEDULE COMPLETE');
  console.log(`📊 Videos produced: ${config.daily_schedule.length}`);
  console.log(`📅 Next run: Tomorrow at 6:00 AM`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

runDailySchedule()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Scheduler failed:', err.message);
    process.exit(1);
  });
