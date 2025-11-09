/**
 * Voice Profile Loader
 * Loads and manages ElevenLabs voice profiles from JSON configs
 */

import fs from 'fs';
import path from 'path';
import type { VoiceProfile } from './elevenlabs.js';
import logger from '../logger/index.js';

/**
 * Load voice profile from JSON file
 */
export function loadVoiceProfile(profilePath: string): VoiceProfile {
  try {
    const absolutePath = path.isAbsolute(profilePath)
      ? profilePath
      : path.resolve(process.cwd(), profilePath);

    const data = fs.readFileSync(absolutePath, 'utf8');
    const profile = JSON.parse(data) as VoiceProfile;

    logger.info({ agent: profile.agent, voice: profile.voice.name }, 'Loaded voice profile');
    return profile;
  } catch (error: any) {
    logger.error({ error: error.message, path: profilePath }, 'Failed to load voice profile');
    throw new Error(`Failed to load voice profile: ${error.message}`);
  }
}

/**
 * Load all voice profiles from a directory
 */
export function loadVoiceProfiles(dirPath: string): Map<string, VoiceProfile> {
  const profiles = new Map<string, VoiceProfile>();

  try {
    const absolutePath = path.isAbsolute(dirPath)
      ? dirPath
      : path.resolve(process.cwd(), dirPath);

    const files = fs.readdirSync(absolutePath);

    for (const file of files) {
      if (file.endsWith('_voice_profile.json')) {
        const fullPath = path.join(absolutePath, file);
        const profile = loadVoiceProfile(fullPath);
        profiles.set(profile.agent, profile);
      }
    }

    logger.info({ count: profiles.size }, 'Loaded voice profiles');
    return profiles;
  } catch (error: any) {
    logger.error({ error: error.message, dir: dirPath }, 'Failed to load voice profiles directory');
    throw new Error(`Failed to load voice profiles: ${error.message}`);
  }
}

/**
 * Get voice ID from environment or profile
 */
export function getVoiceId(agent: string, envPrefix: string = 'ELEVENLABS_VOICE_ID'): string | null {
  const envKey = `${envPrefix}_${agent.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  return process.env[envKey] || null;
}

export default { loadVoiceProfile, loadVoiceProfiles, getVoiceId };
