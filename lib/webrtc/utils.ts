/**
 * WebRTC Utility Functions
 * Helper functions for WebRTC connections and media handling
 */

/**
 * Generate a unique room ID for WebRTC signaling
 */
export function generateRoomId(): string {
  return `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if browser supports WebRTC
 */
export function isWebRTCSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.RTCPeerConnection
  );
}

/**
 * Get available media devices
 */
export async function getMediaDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      videoDevices: devices.filter((d) => d.kind === 'videoinput'),
      audioDevices: devices.filter((d) => d.kind === 'audioinput'),
      outputDevices: devices.filter((d) => d.kind === 'audiooutput'),
    };
  } catch (err) {
    console.error('Failed to enumerate devices:', err);
    return {
      videoDevices: [],
      audioDevices: [],
      outputDevices: [],
    };
  }
}

/**
 * Request media permissions
 */
export async function requestMediaPermissions(
  video: boolean = true,
  audio: boolean = true
): Promise<{ granted: boolean; error?: string }> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
    stream.getTracks().forEach((track) => track.stop());
    return { granted: true };
  } catch (err: any) {
    console.error('Media permission denied:', err);
    return {
      granted: false,
      error: err.message || 'Permission denied',
    };
  }
}

/**
 * Create audio context for volume monitoring
 */
export function createAudioMonitor(stream: MediaStream): {
  getVolume: () => number;
  cleanup: () => void;
} {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const microphone = audioContext.createMediaStreamSource(stream);
  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  microphone.connect(analyser);
  analyser.fftSize = 256;

  const getVolume = (): number => {
    analyser.getByteFrequencyData(dataArray);
    const sum = dataArray.reduce((a, b) => a + b, 0);
    return sum / dataArray.length / 255;
  };

  const cleanup = () => {
    microphone.disconnect();
    audioContext.close();
  };

  return { getVolume, cleanup };
}

/**
 * Format duration in seconds to readable time
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate connection quality based on stats
 */
export async function getConnectionQuality(
  peerConnection: RTCPeerConnection
): Promise<{
  quality: 'excellent' | 'good' | 'poor' | 'disconnected';
  latency: number;
  packetLoss: number;
}> {
  try {
    const stats = await peerConnection.getStats();
    let latency = 0;
    let packetLoss = 0;
    let packetsReceived = 0;
    let packetsLost = 0;

    stats.forEach((report) => {
      if (report.type === 'inbound-rtp') {
        latency = report.jitter || 0;
        packetsReceived = report.packetsReceived || 0;
        packetsLost = report.packetsLost || 0;
      }
    });

    const totalPackets = packetsReceived + packetsLost;
    packetLoss = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;

    let quality: 'excellent' | 'good' | 'poor' | 'disconnected';

    if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      quality = 'disconnected';
    } else if (latency < 50 && packetLoss < 1) {
      quality = 'excellent';
    } else if (latency < 150 && packetLoss < 3) {
      quality = 'good';
    } else {
      quality = 'poor';
    }

    return { quality, latency, packetLoss };
  } catch (err) {
    console.error('Failed to get connection stats:', err);
    return { quality: 'disconnected', latency: 0, packetLoss: 0 };
  }
}

/**
 * Apply accessibility settings to video element
 */
export function applyAccessibilitySettings(
  videoElement: HTMLVideoElement,
  settings: {
    highContrast?: boolean;
    largeControls?: boolean;
    reducedMotion?: boolean;
  }
) {
  if (settings.highContrast) {
    videoElement.style.filter = 'contrast(1.5)';
  }

  if (settings.largeControls) {
    videoElement.setAttribute('controls', 'true');
    videoElement.style.fontSize = '1.5rem';
  }

  if (settings.reducedMotion) {
    videoElement.style.transition = 'none';
  }
}

/**
 * Create a thumbnail from video stream
 */
export function captureVideoThumbnail(
  stream: MediaStream,
  width: number = 320,
  height: number = 240
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();

    video.onloadeddata = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
        video.pause();
        video.srcObject = null;
        resolve(thumbnail);
      } else {
        reject(new Error('Failed to get canvas context'));
      }
    };

    video.onerror = reject;
  });
}

/**
 * Check if device is mobile
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Get optimal video constraints based on connection quality
 */
export function getOptimalVideoConstraints(quality: 'high' | 'medium' | 'low'): MediaTrackConstraints {
  const constraints = {
    high: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    },
    medium: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 24 },
    },
    low: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 15 },
    },
  };

  return constraints[quality];
}
