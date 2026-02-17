import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

const EMERGENT_API_KEY = 'sk-emergent-29dCfAd550eFc47F7F';
const OPENAI_API_URL = 'https://api.openai.com/v1';

export interface TranscriptionResult {
  text: string;
  callerName: string | null;
  callPurpose: string | null;
  confidence: number;
}

export interface CallerInfo {
  name: string;
  purpose: string;
  rawTranscription: string;
  timestamp: number;
}

/**
 * Service for transcribing audio using OpenAI Whisper API
 */
class WhisperTranscriptionService {
  private apiKey: string;

  constructor(apiKey: string = EMERGENT_API_KEY) {
    this.apiKey = apiKey;
  }

  /**
   * Transcribe audio file to text using Whisper API
   */
  async transcribeAudio(audioUri: string): Promise<string> {
    try {
      console.log('Starting transcription for:', audioUri);

      // Use FileSystem.uploadAsync for reliable multipart upload
      const response = await FileSystem.uploadAsync(
        `${OPENAI_API_URL}/audio/transcriptions`,
        audioUri,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          mimeType: 'audio/mp4',
          parameters: {
            model: 'whisper-1',
            language: 'fr',
            response_format: 'json',
          },
        }
      );

      const result = JSON.parse(response.body);
      
      if (result.error) {
        throw new Error(result.error.message);
      }

      console.log('Transcription result:', result.text);
      return result.text;
    } catch (error) {
      console.error('Transcription failed:', error);
      throw error;
    }
  }

  /**
   * Extract caller name and purpose from transcribed text using GPT
   */
  async extractCallerInfo(transcribedText: string): Promise<CallerInfo> {
    try {
      const response = await fetch(`${OPENAI_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Tu es un assistant qui extrait les informations d'identification d'un appelant téléphonique.
À partir de la transcription d'un message vocal, extrais:
1. Le nom de l'appelant (prénom et/ou nom)
2. L'objet/raison de l'appel

Réponds UNIQUEMENT au format JSON suivant:
{
  "name": "Nom de l'appelant ou 'Inconnu' si non mentionné",
  "purpose": "Raison de l'appel ou 'Non précisé' si non mentionné"
}

Si la transcription est vide, incohérente ou ne contient pas d'information utile, réponds:
{
  "name": "Inconnu",
  "purpose": "Non précisé"
}`
            },
            {
              role: 'user',
              content: `Transcription du message vocal:\n"${transcribedText}"`
            }
          ],
          temperature: 0.3,
          max_tokens: 200,
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      const content = data.choices[0]?.message?.content || '{}';
      
      // Parse JSON response
      let parsed;
      try {
        // Extract JSON from response (in case there's extra text)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        parsed = { name: 'Inconnu', purpose: 'Non précisé' };
      }

      return {
        name: parsed.name || 'Inconnu',
        purpose: parsed.purpose || 'Non précisé',
        rawTranscription: transcribedText,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Failed to extract caller info:', error);
      return {
        name: 'Inconnu',
        purpose: 'Non précisé',
        rawTranscription: transcribedText,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Full pipeline: transcribe audio and extract caller info
   */
  async processCallerAudio(audioUri: string): Promise<CallerInfo> {
    try {
      // Step 1: Transcribe audio
      const transcribedText = await this.transcribeAudio(audioUri);
      
      if (!transcribedText || transcribedText.trim().length === 0) {
        return {
          name: 'Inconnu',
          purpose: 'Aucun message laissé',
          rawTranscription: '',
          timestamp: Date.now(),
        };
      }

      // Step 2: Extract caller info
      const callerInfo = await this.extractCallerInfo(transcribedText);
      
      return callerInfo;
    } catch (error) {
      console.error('Failed to process caller audio:', error);
      return {
        name: 'Erreur',
        purpose: 'Impossible de traiter l\'audio',
        rawTranscription: '',
        timestamp: Date.now(),
      };
    }
  }
}

// Singleton instance
export const whisperService = new WhisperTranscriptionService();

export default WhisperTranscriptionService;
