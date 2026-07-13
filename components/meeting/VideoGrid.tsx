'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Monitor } from 'lucide-react';

/**
 * VideoGrid Component
 * Displays local and remote video streams in an adaptive grid layout
 */

interface VideoGridProps {
  localStream?: MediaStream;
  remoteStreams: Map<string, MediaStream>;
  screenStream?: MediaStream;
  layout?: 'default' | 'large' | 'simple';
  highContrast?: boolean;
  largeControls?: boolean;
}

export function VideoGrid({
  localStream,
  remoteStreams,
  screenStream,
  layout = 'default',
  highContrast = false,
  largeControls = false,
}: VideoGridProps) {
  const totalParticipants = 1 + remoteStreams.size;

  const getGridCols = () => {
    if (screenStream) return 1;
    if (totalParticipants === 1) return 1;
    if (totalParticipants === 2) return 2;
    if (totalParticipants <= 4) return 2;
    if (totalParticipants <= 9) return 3;
    return 4;
  };

  const gridCols = getGridCols();

  return (
    <div className="w-full h-full p-4 overflow-auto">
      {}
      {screenStream && (
        <div className="w-full h-full flex flex-col gap-4">
          <div className="flex-1 relative">
            <VideoTile
              stream={screenStream}
              label="Screen Share"
              icon={<Monitor className="text-blue-500" />}
              priority
              highContrast={highContrast}
              isScreenShare
            />
          </div>

          {}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <VideoTile
              stream={localStream}
              label="You"
              isLocal
              highContrast={highContrast}
              thumbnail
            />
            {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
              <VideoTile
                key={userId}
                stream={stream}
                label={userId}
                highContrast={highContrast}
                thumbnail
              />
            ))}
          </div>
        </div>
      )}

      {}
      {!screenStream && (
        <div
          className={`
            grid gap-4 w-full h-full
            grid-cols-${gridCols}
          `}
          style={{
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
          }}
        >
          {}
          <VideoTile
            stream={localStream}
            label="You"
            isLocal
            highContrast={highContrast}
          />

          {}
          {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
            <VideoTile
              key={userId}
              stream={stream}
              label={userId}
              highContrast={highContrast}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface VideoTileProps {
  stream?: MediaStream;
  label: string;
  isLocal?: boolean;
  isScreenShare?: boolean;
  priority?: boolean;
  highContrast?: boolean;
  thumbnail?: boolean;
  icon?: React.ReactNode;
}

function VideoTile({
  stream,
  label,
  isLocal = false,
  isScreenShare = false,
  priority = false,
  highContrast = false,
  thumbnail = false,
  icon,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = stream?.getVideoTracks().some((track) => track.enabled);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`
        relative rounded-xl overflow-hidden bg-gray-800
        ${thumbnail ? 'w-32 h-24 flex-shrink-0' : 'w-full h-full'}
        ${highContrast ? 'ring-2 ring-white' : 'ring-1 ring-gray-700'}
        ${priority ? 'ring-4 ring-blue-500' : ''}
      `}
    >
      {}
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`
            w-full h-full object-cover
            ${isLocal ? 'scale-x-[-1]' : ''}
          `}
          aria-label={`${label}'s video`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
          {icon || (
            <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center">
              <User size={32} className="text-gray-400" />
            </div>
          )}
        </div>
      )}

      {}
      <div
        className={`
          absolute bottom-2 left-2 px-3 py-1 rounded-lg
          ${highContrast ? 'bg-black text-white' : 'bg-black/70 text-white'}
          text-sm font-medium backdrop-blur-sm
          ${thumbnail ? 'text-xs px-2 py-0.5' : ''}
        `}
      >
        {label}
        {isScreenShare && <span className="ml-2">📺</span>}
      </div>

      {}
      {stream && (
        <AudioIndicator
          stream={stream}
          highContrast={highContrast}
        />
      )}
    </motion.div>
  );
}

function AudioIndicator({ stream, highContrast }: { stream: MediaStream; highContrast: boolean }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack || !audioTrack.enabled) return;

    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      microphone.connect(analyser);
      analyser.fftSize = 256;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const checkAudioLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setIsSpeaking(average > 20);
        requestAnimationFrame(checkAudioLevel);
      };

      checkAudioLevel();

      return () => {
        microphone.disconnect();
        audioContext.close();
      };
    } catch (err) {
      console.error('Failed to create audio indicator:', err);
    }
  }, [stream]);

  if (!isSpeaking) return null;

  return (
    <div
      className={`
        absolute top-2 right-2 w-3 h-3 rounded-full
        ${highContrast ? 'bg-green-400' : 'bg-green-500'}
        animate-pulse
      `}
      role="status"
      aria-label="Speaking"
    />
  );
}

import { useState } from 'react';
