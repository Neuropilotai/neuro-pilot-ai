/**
 * ElevenLabs TTS Client
 * Text-to-speech generation for video voiceovers
 * Supports voice profiles with custom settings
 */

import axios from 'axios';
import logger from '../logger/index.js';

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface VoiceProfile {
  agent: string;
  model_id: string;
  voice: {
    name: string;
    fallback: string[];
  };
  voice_settings: VoiceSettings;
  delivery?: {
    speed_multiplier: number;
    pitch_semitones: number;
  };
  defaults: {
    optimize_streaming_latency: number;
    output_format: string;
    apply_voice_settings: boolean;
  };
}

export interface TTSRequest {
  text: string;
  voice_id: string;
  model_id?: string;
  voice_settings?: VoiceSettings;
  output_format?: string;
  optimize_streaming_latency?: number;
  apply_voice_settings?: boolean;
}

export interface TTSResponse {
  audio_url: string;
  audio_base64?: string;
  character_count: number;
  duration_seconds?: number;
}

export class ElevenLabsClient {
  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Generate speech from text with full API support
   */
  async textToSpeech(request: TTSRequest): Promise<TTSResponse> {
    try {
      const payload: any = {
        text: request.text,
        model_id: request.model_id || 'eleven_turbo_v2_5',
        voice_settings: request.voice_settings || {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      };

      // Add optional parameters if provided
      if (request.optimize_streaming_latency !== undefined) {
        payload.optimize_streaming_latency = request.optimize_streaming_latency;
      }
      if (request.output_format) {
        payload.output_format = request.output_format;
      }
      if (request.apply_voice_settings !== undefined) {
        payload.apply_voice_settings = request.apply_voice_settings;
      }

      const response = await axios.post(
        `${this.baseUrl}/text-to-speech/${request.voice_id}`,
        payload,
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          responseType: 'arraybuffer'
        }
      );

      // Convert audio buffer to base64
      const audioBase64 = Buffer.from(response.data).toString('base64');

      logger.info({
        voice_id: request.voice_id,
        model: request.model_id,
        chars: request.text.length,
        size_bytes: response.data.length,
        output_format: request.output_format
      }, 'Generated TTS audio');

      return {
        audio_url: '', // Will be uploaded to storage
        audio_base64: audioBase64,
        character_count: request.text.length,
        duration_seconds: Math.ceil(request.text.length / 14) // ~14 chars/sec average
      };
    } catch (error: any) {
      logger.error({ error: error.message, voice_id: request.voice_id }, 'TTS generation failed');
      throw new Error(`ElevenLabs TTS failed: ${error.response?.data?.detail?.message || error.message}`);
    }
  }

  /**
   * Generate speech using a voice profile
   */
  async synthesizeWithProfile(text: string, profile: VoiceProfile, voiceId?: string): Promise<TTSResponse> {
    const effectiveVoiceId = voiceId || (await this.getVoiceByName(profile.voice.name));

    if (!effectiveVoiceId) {
      throw new Error(`Voice not found: ${profile.voice.name}`);
    }

    return this.textToSpeech({
      text,
      voice_id: effectiveVoiceId,
      model_id: profile.model_id,
      voice_settings: profile.voice_settings,
      output_format: profile.defaults.output_format,
      optimize_streaming_latency: profile.defaults.optimize_streaming_latency,
      apply_voice_settings: profile.defaults.apply_voice_settings
    });
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<Array<{ voice_id: string; name: string; labels: any }>> {
    try {
      const response = await axios.get(`${this.baseUrl}/voices`, {
        headers: { 'xi-api-key': this.apiKey }
      });

      return response.data.voices;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch voices');
      throw new Error(`Failed to fetch voices: ${error.message}`);
    }
  }

  /**
   * Get voice by name
   */
  async getVoiceByName(name: string): Promise<string | null> {
    const voices = await this.getVoices();
    const voice = voices.find(v => v.name.toLowerCase() === name.toLowerCase());
    return voice?.voice_id || null;
  }
}

export default ElevenLabsClient;
