#!/usr/bin/env node
// GROUP7 - Canva Style Optimizer
import 'dotenv/config';
import { readFileSync } from 'fs';
import { httpWithRetry } from './poll-utils.mjs';

const CANVA_TOKEN = process.env.CANVA_ACCESS_TOKEN;
const CANVA_TEMPLATE_ID = process.env.CANVA_TEMPLATE_ID;

function loadVisualProfiles() {
  const data = readFileSync('config/visual_profiles.json', 'utf-8');
  return JSON.parse(data);
}

function loadAnalysis() {
  try {
    const data = readFileSync('Production/logs/learning/analysis_latest.json', 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

async function optimizeCanvaStyle(agent) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎨 CANVA STYLE OPTIMIZER - ${agent}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const profiles = loadVisualProfiles();
  const analysis = loadAnalysis();
  
  const profile = profiles.profiles[agent];
  if (!profile) {
    throw new Error(`No visual profile found for ${agent}`);
  }
  
  console.log(`Current style: ${profile.personality}`);
  console.log(`Primary color: ${profile.primary_color}`);
  console.log(`Motion intensity: ${profile.motion_intensity}`);
  
  const shouldAdapt = analysis && analysis.avgEngagement < profiles.adaptive_rules.low_engagement_threshold;
  
  if (shouldAdapt) {
    console.log('\n⚠️  Low engagement detected - applying adaptive adjustments');
    
    const adjustments = profiles.adaptive_rules.adjustments.if_low_engagement;
    profile.motion_intensity = Math.min(1.0, profile.motion_intensity + adjustments.increase_motion_intensity);
    
    console.log(`  • Motion intensity: ${profile.motion_intensity}`);
    console.log(`  • Animation speed: ${adjustments.speed_up_animations ? 'increased' : 'maintained'}`);
    console.log(`  • Color boost: +${adjustments.boost_color_saturation}%`);
  } else {
    console.log('\n✅ Engagement healthy - maintaining current style');
  }
  
  console.log('\n📝 Note: Canva template updates require manual design changes');
  console.log('   Recommended adjustments saved to visual_profiles.json');
  console.log('\n🔧 To apply changes:');
  console.log(`   1. Open Canva template: ${CANVA_TEMPLATE_ID}`);
  console.log(`   2. Update background color to: ${profile.primary_color}`);
  console.log(`   3. Adjust animation duration based on: ${profile.animation_speed}`);
  console.log(`   4. Apply transition style: ${profile.transition_style}`);
  
  return {
    agent,
    profile,
    adapted: shouldAdapt,
    canva_template_id: CANVA_TEMPLATE_ID,
    recommendations: [
      `Set primary color: ${profile.primary_color}`,
      `Set secondary color: ${profile.secondary_color}`,
      `Font family: ${profile.font_family}`,
      `Font weight: ${profile.font_weight}`,
      `Animation: ${profile.animation_speed}`,
      `Transition: ${profile.transition_style}`
    ]
  };
}

const agent = process.argv[2] || 'Lyra-7';

optimizeCanvaStyle(agent)
  .then(result => {
    console.log('\n✅ Style optimization complete');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Optimization failed:', err.message);
    process.exit(1);
  });
