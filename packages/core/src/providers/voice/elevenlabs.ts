import type {
  VoiceInfo,
  VoiceProvider,
  VoiceSynthesisOptions,
} from "../types.js";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export class ElevenLabsVoiceProvider implements VoiceProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(
    text: string,
    voiceId: string,
    opts?: VoiceSynthesisOptions,
  ): Promise<Buffer> {
    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: opts?.model ?? "eleven_multilingual_v2",
          voice_settings: {
            stability: opts?.stability ?? 0.5,
            similarity_boost: opts?.similarityBoost ?? 0.75,
          },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async listVoices(): Promise<VoiceInfo[]> {
    const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
      headers: {
        "xi-api-key": this.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${error}`);
    }

    const data = (await response.json()) as {
      voices: { voice_id: string; name: string }[];
    };
    return data.voices.map((v) => ({ id: v.voice_id, name: v.name }));
  }
}
