/**
 * Recording Service
 * Handles recording of meetings using MediaRecorder API
 */

export interface RecordingOptions {
  mimeType?: string;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
}

export interface RecordingMetadata {
  meetingId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  fileSize?: number;
  fileName?: string;
}

export class RecordingService {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private metadata: RecordingMetadata;
  private isRecording: boolean = false;

  constructor(meetingId: string) {
    this.metadata = {
      meetingId,
      startTime: Date.now(),
    };
  }

  /**
   * Start recording a media stream
   */
  async startRecording(
    stream: MediaStream,
    options: RecordingOptions = {}
  ): Promise<void> {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    this.stream = stream;
    this.recordedChunks = [];

    const mimeType = this.getSupportedMimeType(options.mimeType);

    try {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: options.videoBitsPerSecond || 2500000,
        audioBitsPerSecond: options.audioBitsPerSecond || 128000,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstart = () => {
        console.log('Recording started');
        this.isRecording = true;
        this.metadata.startTime = Date.now();
      };

      this.mediaRecorder.onstop = () => {
        console.log('Recording stopped');
        this.isRecording = false;
        this.metadata.endTime = Date.now();
        this.metadata.duration = this.metadata.endTime - this.metadata.startTime;
      };

      this.mediaRecorder.onerror = (event: any) => {
        console.error('MediaRecorder error:', event.error);
        this.isRecording = false;
      };

      this.mediaRecorder.start(1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      throw err;
    }
  }

  /**
   * Stop recording
   */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('No active recording'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, {
          type: this.mediaRecorder?.mimeType || 'video/webm',
        });

        this.metadata.endTime = Date.now();
        this.metadata.duration = this.metadata.endTime - this.metadata.startTime;
        this.metadata.fileSize = blob.size;

        this.isRecording = false;
        resolve(blob);
      };

      this.mediaRecorder.stop();

      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
      }
    });
  }

  /**
   * Pause recording
   */
  pauseRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.pause();
    }
  }

  /**
   * Resume recording
   */
  resumeRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.resume();
    }
  }

  /**
   * Get recording state
   */
  getState(): string {
    return this.mediaRecorder?.state || 'inactive';
  }

  /**
   * Check if currently recording
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get recording metadata
   */
  getMetadata(): RecordingMetadata {
    return { ...this.metadata };
  }

  /**
   * Download recording as file
   */
  downloadRecording(blob: Blob, fileName?: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName || `meeting-${this.metadata.meetingId}-${Date.now()}.webm`;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Upload recording to server
   */
  async uploadRecording(blob: Blob, fileName?: string): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('recording', blob, fileName || `meeting-${this.metadata.meetingId}.webm`);
      formData.append('meetingId', this.metadata.meetingId);
      formData.append('duration', String(this.metadata.duration || 0));

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/recordings/upload`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.recording_url;
    } catch (err) {
      console.error('Failed to upload recording:', err);
      throw err;
    }
  }

  /**
   * Get supported mime type
   */
  private getSupportedMimeType(preferred?: string): string {
    const types = [
      preferred,
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4',
    ].filter(Boolean) as string[];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'video/webm';
  }
}

/**
 * Hook for using recording service in React components
 */
export function useRecordingService(meetingId: string) {
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingDuration, setRecordingDuration] = React.useState(0);
  const [error, setError] = React.useState<Error | null>(null);
  const serviceRef = React.useRef<RecordingService | null>(null);
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    serviceRef.current = new RecordingService(meetingId);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (serviceRef.current?.isActive()) {
        serviceRef.current.stopRecording().catch(console.error);
      }
    };
  }, [meetingId]);

  const startRecording = React.useCallback(async (stream: MediaStream) => {
    try {
      if (!serviceRef.current) return;
      
      await serviceRef.current.startRecording(stream);
      setIsRecording(true);
      setError(null);

      intervalRef.current = setInterval(() => {
        if (serviceRef.current) {
          const metadata = serviceRef.current.getMetadata();
          const duration = Math.floor((Date.now() - metadata.startTime) / 1000);
          setRecordingDuration(duration);
        }
      }, 1000);
    } catch (err: any) {
      setError(err);
      console.error('Failed to start recording:', err);
    }
  }, []);

  const stopRecording = React.useCallback(async (): Promise<Blob | null> => {
    try {
      if (!serviceRef.current) return null;

      const blob = await serviceRef.current.stopRecording();
      setIsRecording(false);
      setRecordingDuration(0);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      return blob;
    } catch (err: any) {
      setError(err);
      console.error('Failed to stop recording:', err);
      return null;
    }
  }, []);

  const downloadRecording = React.useCallback(async (fileName?: string) => {
    try {
      const blob = await stopRecording();
      if (blob && serviceRef.current) {
        serviceRef.current.downloadRecording(blob, fileName);
      }
    } catch (err: any) {
      setError(err);
      console.error('Failed to download recording:', err);
    }
  }, [stopRecording]);

  const uploadRecording = React.useCallback(async (fileName?: string): Promise<string | null> => {
    try {
      const blob = await stopRecording();
      if (blob && serviceRef.current) {
        return await serviceRef.current.uploadRecording(blob, fileName);
      }
      return null;
    } catch (err: any) {
      setError(err);
      console.error('Failed to upload recording:', err);
      return null;
    }
  }, [stopRecording]);

  return {
    isRecording,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    downloadRecording,
    uploadRecording,
  };
}

import React from 'react';
