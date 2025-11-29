const axios = require('axios');
const { PassThrough } = require('stream');

class TranscriptionService {
  constructor() {
    // Configuration for Whisper API (using local or OpenAI-compatible endpoint)
    this.whisperEndpoint = process.env.WHISPER_ENDPOINT || 'http://localhost:8000/v1/audio/transcriptions';
    this.libreTranslateEndpoint = process.env.LIBRETRANSLATE_ENDPOINT || 'https://libretranslate.com/translate';
    this.libreTranslateApiKey = process.env.LIBRETRANSLATE_API_KEY || null;
    this.whisperAvailable = false;
    
    // Check if Whisper is available on startup
    this.checkWhisperAvailability();
    
    // Buffer for accumulating audio chunks
    this.audioBuffers = new Map(); // userId -> Buffer[]
    this.processingIntervals = new Map(); // userId -> setInterval
  }

  /**
   * Check if Whisper endpoint is available
   */
  async checkWhisperAvailability() {
    try {
      // Try a simple health check or test request
      const testUrl = this.whisperEndpoint.replace('/transcriptions', '/health');
      await axios.get(testUrl, { timeout: 2000 });
      this.whisperAvailable = true;
      console.log('✓ Whisper endpoint is available');
    } catch (error) {
      this.whisperAvailable = false;
      console.log('⚠ Whisper endpoint not available. Captions will use client-side Web Speech API fallback.');
      console.log('  To enable server-side transcription, see WHISPER_SETUP.md');
    }
  }

  /**
   * Check if Whisper is available
   */
  isWhisperAvailable() {
    return this.whisperAvailable;
  }

  /**
   * Start processing audio stream for a user
   * @param {string} userId - User identifier
   * @param {Function} onTranscription - Callback with transcribed text
   * @param {string} targetLanguage - Target language for translation (default: none)
   */
  startAudioStream(userId, onTranscription, targetLanguage = null) {
    if (!this.audioBuffers.has(userId)) {
      this.audioBuffers.set(userId, []);
    }

    // Process accumulated audio every 2 seconds for near real-time transcription
    const interval = setInterval(async () => {
      const chunks = this.audioBuffers.get(userId);
      if (chunks && chunks.length > 0) {
        const audioData = Buffer.concat(chunks);
        this.audioBuffers.set(userId, []); // Clear buffer

        try {
          const transcript = await this.transcribeAudio(audioData);
          
          if (transcript && transcript.trim().length > 0) {
            // If target language specified, translate
            if (targetLanguage && targetLanguage !== 'en') {
              const translated = await this.translateText(transcript, targetLanguage);
              onTranscription({
                original: transcript,
                translated: translated,
                targetLanguage: targetLanguage,
                isFinal: false
              });
            } else {
              onTranscription({
                original: transcript,
                translated: null,
                targetLanguage: null,
                isFinal: false
              });
            }
          }
        } catch (error) {
          console.error('Transcription error:', error.message);
        }
      }
    }, 2000); // Process every 2 seconds

    this.processingIntervals.set(userId, interval);
  }

  /**
   * Add audio chunk to user's buffer
   * @param {string} userId - User identifier
   * @param {Buffer} audioChunk - Audio data chunk
   */
  addAudioChunk(userId, audioChunk) {
    if (!this.audioBuffers.has(userId)) {
      this.audioBuffers.set(userId, []);
    }
    this.audioBuffers.get(userId).push(audioChunk);
  }

  /**
   * Transcribe audio using Whisper
   * @param {Buffer} audioData - Raw audio data
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribeAudio(audioData) {
    try {
      // Check if using local Whisper or OpenAI-compatible API
      const FormData = require('form-data');
      const form = new FormData();
      
      // Convert audio buffer to blob
      form.append('file', audioData, {
        filename: 'audio.webm',
        contentType: 'audio/webm'
      });
      form.append('model', 'whisper-1');
      form.append('language', 'en');
      form.append('response_format', 'json');

      const response = await axios.post(this.whisperEndpoint, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`
        },
        timeout: 10000
      });

      return response.data.text || '';
    } catch (error) {
      // Fallback: If Whisper endpoint fails, return empty string
      if (error.code === 'ECONNREFUSED') {
        console.warn('Whisper endpoint not available. Please start local Whisper server or configure WHISPER_ENDPOINT.');
      }
      throw error;
    }
  }

  /**
   * Translate text using LibreTranslate
   * @param {string} text - Text to translate
   * @param {string} targetLang - Target language code (e.g., 'es', 'fr', 'de')
   * @returns {Promise<string>} - Translated text
   */
  async translateText(text, targetLang) {
    try {
      const payload = {
        q: text,
        source: 'en',
        target: targetLang,
        format: 'text'
      };

      if (this.libreTranslateApiKey) {
        payload.api_key = this.libreTranslateApiKey;
      }

      const response = await axios.post(this.libreTranslateEndpoint, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      return response.data.translatedText || text;
    } catch (error) {
      console.error('Translation error:', error.message);
      return text; // Return original text if translation fails
    }
  }

  /**
   * Stop processing audio for a user
   * @param {string} userId - User identifier
   */
  stopAudioStream(userId) {
    if (this.processingIntervals.has(userId)) {
      clearInterval(this.processingIntervals.get(userId));
      this.processingIntervals.delete(userId);
    }
    this.audioBuffers.delete(userId);
  }

  /**
   * Get available languages for translation
   * @returns {Promise<Array>} - List of supported languages
   */
  async getAvailableLanguages() {
    try {
      const response = await axios.get(`${this.libreTranslateEndpoint.replace('/translate', '/languages')}`, {
        timeout: 5000
      });
      return response.data || [];
    } catch (error) {
      console.error('Error fetching languages:', error.message);
      return [
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Spanish' },
        { code: 'fr', name: 'French' },
        { code: 'de', name: 'German' },
        { code: 'it', name: 'Italian' },
        { code: 'pt', name: 'Portuguese' },
        { code: 'ru', name: 'Russian' },
        { code: 'ja', name: 'Japanese' },
        { code: 'ko', name: 'Korean' },
        { code: 'zh', name: 'Chinese' }
      ];
    }
  }
}

module.exports = TranscriptionService;
