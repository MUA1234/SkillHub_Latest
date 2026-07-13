/**
 * Caption Service
 * Handles live captioning for meetings using Web Speech API
 */

export interface Caption {
  id: string;
  text: string;
  speaker: string;
  timestamp: number;
  confidence: number;
}

export interface CaptionServiceOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onCaption?: (caption: Caption) => void;
  onError?: (error: Error) => void;
}

export class CaptionService {
  private recognition: any;
  private isListening: boolean = false;
  private speakerName: string;
  private options: CaptionServiceOptions;
  private captionBuffer: Caption[] = [];

  constructor(speakerName: string, options: CaptionServiceOptions = {}) {
    this.speakerName = speakerName;
    this.options = {
      language: 'en-US',
      continuous: true,
      interimResults: true,
      ...options,
    };

    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.setupRecognition();
      } else {
        console.warn('Web Speech API not supported in this browser');
      }
    }
  }

  private setupRecognition() {
    if (!this.recognition) return;

    this.recognition.lang = this.options.language;
    this.recognition.continuous = this.options.continuous;
    this.recognition.interimResults = this.options.interimResults;

    this.recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;
      const isFinal = result.isFinal;

      if (isFinal) {
        const caption: Caption = {
          id: `caption-${Date.now()}`,
          text: transcript,
          speaker: this.speakerName,
          timestamp: Date.now(),
          confidence: confidence || 0.9,
        };

        this.captionBuffer.push(caption);
        this.options.onCaption?.(caption);

        if (this.captionBuffer.length > 100) {
          this.captionBuffer.shift();
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      
      const error = new Error(`Speech recognition error: ${event.error}`);
      this.options.onError?.(error);

      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        setTimeout(() => {
          if (this.isListening) {
            this.start();
          }
        }, 1000);
      }
    };

    this.recognition.onend = () => {
      if (this.isListening && this.options.continuous) {
        this.recognition.start();
      }
    };
  }

  public start(): void {
    if (!this.recognition) {
      console.warn('Speech recognition not available');
      return;
    }

    if (this.isListening) {
      console.warn('Caption service already running');
      return;
    }

    try {
      this.isListening = true;
      this.recognition.start();
      console.log('Caption service started');
    } catch (err) {
      console.error('Failed to start caption service:', err);
      this.isListening = false;
    }
  }

  public stop(): void {
    if (!this.recognition) return;

    this.isListening = false;
    try {
      this.recognition.stop();
      console.log('Caption service stopped');
    } catch (err) {
      console.error('Failed to stop caption service:', err);
    }
  }

  public isActive(): boolean {
    return this.isListening;
  }

  public getCaptions(): Caption[] {
    return [...this.captionBuffer];
  }

  public clearCaptions(): void {
    this.captionBuffer = [];
  }

  public setSpeakerName(name: string): void {
    this.speakerName = name;
  }
}

/**
 * Server-side caption service using external APIs
 * For production use with cloud services like Google Speech-to-Text, AWS Transcribe, etc.
 */
export class CloudCaptionService {
  private apiEndpoint: string;
  private apiKey: string;

  constructor(apiEndpoint: string, apiKey: string) {
    this.apiEndpoint = apiEndpoint;
    this.apiKey = apiKey;
  }

  /**
   * Send audio data to cloud service for transcription
   */
  async transcribeAudio(audioBlob: Blob, language: string = 'en-US'): Promise<Caption> {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('language', language);

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        id: `caption-${Date.now()}`,
        text: data.transcript || data.text || '',
        speaker: data.speaker || 'Unknown',
        timestamp: Date.now(),
        confidence: data.confidence || 0.9,
      };
    } catch (err) {
      console.error('Failed to transcribe audio:', err);
      throw err;
    }
  }

  /**
   * Store caption to database
   */
  async saveCaption(meetingId: string, caption: Caption): Promise<void> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/captions/${meetingId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          speaker_name: caption.speaker,
          text: caption.text,
          confidence: caption.confidence,
          timestamp_offset_seconds: Math.floor(caption.timestamp / 1000),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save caption');
      }
    } catch (err) {
      console.error('Failed to save caption:', err);
      throw err;
    }
  }
}

/**
 * Hook for using caption service in React components
 */
export function useCaptionService(speakerName: string, enabled: boolean = false) {
  const [captions, setCaptions] = React.useState<Caption[]>([]);
  const [isActive, setIsActive] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const serviceRef = React.useRef<CaptionService | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    serviceRef.current = new CaptionService(speakerName, {
      onCaption: (caption) => {
        setCaptions((prev) => [...prev, caption].slice(-50));
      },
      onError: (err) => {
        setError(err);
      },
    });

    return () => {
      if (serviceRef.current) {
        serviceRef.current.stop();
      }
    };
  }, [speakerName]);

  React.useEffect(() => {
    if (enabled && serviceRef.current) {
      serviceRef.current.start();
      setIsActive(true);
    } else if (!enabled && serviceRef.current) {
      serviceRef.current.stop();
      setIsActive(false);
    }
  }, [enabled]);

  const clearCaptions = React.useCallback(() => {
    setCaptions([]);
    if (serviceRef.current) {
      serviceRef.current.clearCaptions();
    }
  }, []);

  return {
    captions,
    isActive,
    error,
    clearCaptions,
  };
}

import React from 'react';
