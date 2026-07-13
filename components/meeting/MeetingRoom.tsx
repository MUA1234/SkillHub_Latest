'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CaptionService } from '@/lib/services/captionService';
import { apiClient } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useAdaptiveAccessibility } from '@/contexts/AdaptiveAccessibilityContext';
import { MeetingControls } from './MeetingControls';
import { VideoGrid } from './VideoGrid';
import { CaptionOverlay } from './CaptionOverlay';
import { ChatPanel } from './ChatPanel';
import { ParticipantList } from './ParticipantList';
import { Loader2, AlertCircle, Users, Settings, Accessibility, Eye, Ear, Type, Zap } from 'lucide-react';

/**
 * MeetingRoom Component
 * Accessibility-aware WebRTC meeting interface
 * Automatically adapts based on user's accessibility profile
 */

interface MeetingRoomProps {
  meetingId: string;
  userId: string;
  userName: string;
  onLeave?: () => void;
  isHost?: boolean;
}

export function MeetingRoom({ meetingId, userId, userName, onLeave, isHost = false }: MeetingRoomProps) {
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showAccessibilityPanel, setShowAccessibilityPanel] = useState(false);
  const [captions, setCaptions] = useState<Array<{ id: string; text: string; speaker: string }>>([]);
  
  const [highContrast, setHighContrast] = useState(false);
  const [largeControls, setLargeControls] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const { effectiveAdaptations, hasDisability } = useAdaptiveAccessibility();

  const {
    isConnected,
    isConnecting,
    connectionError,
    localStream,
    remoteStreams,
    screenStream,
    toggleVideo,
    toggleAudio,
    startScreenShare,
    stopScreenShare,
    joinMeeting,
    leaveMeeting,
    mediaControls,
    participants,
  } = useWebRTC({
    meetingId,
    userId,
    userName,
    enableVideo: !hasDisability('visual_impairment'),
    enableAudio: true,
  });

  useEffect(() => {
    joinMeeting();

    return () => {
      leaveMeeting();
    };
  }, []);

  const captionServiceRef = useRef<CaptionService | null>(null);
  useEffect(() => {
    if (!isConnected) return;
    return () => {
      try {
        captionServiceRef.current?.stop();
      } catch {
      }
      captionServiceRef.current = null;
    };
  }, [isConnected]);

  const handleLeave = () => {
    leaveMeeting();
    onLeave?.();
  };

  const meetingLayout = effectiveAdaptations.simplifiedUI
    ? 'simple'
    : effectiveAdaptations.largeClickTargets
    ? 'large'
    : 'default';

  const captionsEnabled =
    effectiveAdaptations.captionsEnabled || hasDisability('hearing_impairment');

  useEffect(() => {
    if (!isConnected) return;
    if (!captionsEnabled) {
      try {
        captionServiceRef.current?.stop();
      } catch {
      }
      captionServiceRef.current = null;
      return;
    }
    if (captionServiceRef.current) return;
    const svc = new CaptionService(userName || 'You', {
      continuous: true,
      interimResults: true,
      onCaption: (c) => {
        setCaptions((cs) => [...cs.slice(-99), { id: c.id, text: c.text, speaker: c.speaker }]);
        apiClient
          .appendCaption(meetingId, { text: c.text, confidence: c.confidence })
          .catch(() => {
          });
      },
      onError: () => {
      },
    });
    captionServiceRef.current = svc;
    svc.start();
  }, [isConnected, captionsEnabled, userName, meetingId]);

  const lowDistractionMode =
    effectiveAdaptations.focusMode ||
    hasDisability('adhd') ||
    hasDisability('asd');

  const keyboardOnlyMode =
    effectiveAdaptations.keyboardNavigation || hasDisability('physical_disability');

  return (
    <div
      className={`
        fixed inset-0 bg-gray-900 flex flex-col
        ${effectiveAdaptations.highContrast ? 'contrast-high' : ''}
        ${effectiveAdaptations.reducedAnimations ? 'motion-reduce' : ''}
        ${lowDistractionMode ? 'low-distraction-mode' : ''}
      `}
      role="application"
      aria-label="Video Meeting Room"
    >
      {}
      {isConnecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/95 z-50">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-white text-lg">Connecting to meeting...</p>
            <p className="text-gray-400 text-sm mt-2">Please wait</p>
          </div>
        </div>
      )}

      {}
      {connectionError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/95 z-50">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md mx-4">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-red-900 mb-2">
                  Connection Failed
                </h3>
                <p className="text-red-800 text-sm mb-4">{connectionError.message}</p>
                <button
                  onClick={joinMeeting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {isConnected && (
        <>
          {}
          <div
            className={`
              bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700
              ${meetingLayout === 'large' ? 'py-4' : ''}
            `}
          >
            <div className="flex items-center gap-3">
              <div
                className={`
                  w-3 h-3 rounded-full bg-green-500 animate-pulse
                  ${meetingLayout === 'large' ? 'w-4 h-4' : ''}
                `}
                role="status"
                aria-label="Meeting is live"
              />
              <span className={`text-white font-medium ${meetingLayout === 'large' ? 'text-lg' : ''}`}>
                Live Meeting
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowParticipants(!showParticipants)}
                className={`
                  flex items-center gap-2 px-3 py-2 bg-gray-700 text-white rounded-lg
                  hover:bg-gray-600 transition-colors
                  ${meetingLayout === 'large' ? 'px-4 py-3 text-lg' : ''}
                `}
                aria-label={`${showParticipants ? 'Hide' : 'Show'} participants list`}
              >
                <Users size={meetingLayout === 'large' ? 24 : 20} />
                <span>{participants.length + 1}</span>
              </button>
            </div>
          </div>

          {}
          <div className="flex-1 flex overflow-hidden">
            {}
            <div className="flex-1 relative">
              <VideoGrid
                localStream={localStream}
                remoteStreams={remoteStreams}
                screenStream={screenStream}
                layout={meetingLayout}
                highContrast={effectiveAdaptations.highContrast}
                largeControls={effectiveAdaptations.largeClickTargets}
              />

              {}
              {captionsEnabled && (
                <CaptionOverlay
                  captions={captions}
                  fontSize={effectiveAdaptations.fontSize}
                  highContrast={effectiveAdaptations.highContrast}
                />
              )}
            </div>

            {}
            <AnimatePresence>
              {showAccessibilityPanel && (
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  className="absolute top-4 right-4 w-80 glass rounded-2xl shadow-elevated z-50 p-5 border-2 border-blue-400"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                        <Accessibility className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="font-bold text-gray-900">Accessibility Controls</h3>
                    </div>
                    <button
                      onClick={() => setShowAccessibilityPanel(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                      aria-label="Close accessibility panel"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {}
                    <div className="flex items-center justify-between p-3 bg-white rounded-xl hover:bg-gray-50 transition-colors border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Eye className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-900">High Contrast</span>
                      </div>
                      <button
                        onClick={() => setHighContrast(!highContrast)}
                        className={`toggle-switch ${
                          highContrast ? 'toggle-switch-active' : 'toggle-switch-inactive'
                        }`}
                        aria-label={`High contrast ${highContrast ? 'enabled' : 'disabled'}`}
                      >
                        <span
                          className={`toggle-switch-handle ${
                            highContrast ? 'translate-x-7' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {}
                    <div className="flex items-center justify-between p-3 bg-white rounded-xl hover:bg-gray-50 transition-colors border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                          <Type className="w-4 h-4 text-green-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-900">Large Controls</span>
                      </div>
                      <button
                        onClick={() => setLargeControls(!largeControls)}
                        className={`toggle-switch ${
                          largeControls ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'toggle-switch-inactive'
                        }`}
                        aria-label={`Large controls ${largeControls ? 'enabled' : 'disabled'}`}
                      >
                        <span
                          className={`toggle-switch-handle ${
                            largeControls ? 'translate-x-7' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {}
                    <div className="flex items-center justify-between p-3 bg-white rounded-xl hover:bg-gray-50 transition-colors border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                          <Zap className="w-4 h-4 text-yellow-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-900">Reduced Motion</span>
                      </div>
                      <button
                        onClick={() => setReducedMotion(!reducedMotion)}
                        className={`toggle-switch ${
                          reducedMotion ? 'bg-gradient-to-r from-yellow-500 to-amber-500' : 'toggle-switch-inactive'
                        }`}
                        aria-label={`Reduced motion ${reducedMotion ? 'enabled' : 'disabled'}`}
                      >
                        <span
                          className={`toggle-switch-handle ${
                            reducedMotion ? 'translate-x-7' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {}
                    <div className="flex items-center justify-between p-3 bg-white rounded-xl hover:bg-gray-50 transition-colors border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                          <Ear className="w-4 h-4 text-purple-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-900">Focus Mode</span>
                      </div>
                      <button
                        onClick={() => setFocusMode(!focusMode)}
                        className={`toggle-switch ${
                          focusMode ? 'bg-gradient-to-r from-purple-500 to-violet-500' : 'toggle-switch-inactive'
                        }`}
                        aria-label={`Focus mode ${focusMode ? 'enabled' : 'disabled'}`}
                      >
                        <span
                          className={`toggle-switch-handle ${
                            focusMode ? 'translate-x-7' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="text-xs text-gray-600 mt-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                      <span className="text-base mr-1">💡</span>
                      <span className="font-medium">Tip:</span> These settings apply only to this meeting
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {}
            <AnimatePresence>
              {(showChat || showParticipants) && (
                <motion.div
                  initial={{ x: 320 }}
                  animate={{ x: 0 }}
                  exit={{ x: 320 }}
                  className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col"
                >
                  {showChat && (
                    <ChatPanel
                      meetingId={meetingId}
                      userId={userId}
                      userName={userName}
                      largeText={effectiveAdaptations.largeClickTargets}
                    />
                  )}
                  {showParticipants && (
                    <ParticipantList
                      participants={participants}
                      currentUserId={userId}
                      largeText={effectiveAdaptations.largeClickTargets}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {}
          <button
            onClick={() => setShowAccessibilityPanel(!showAccessibilityPanel)}
            className={`absolute top-4 right-4 z-40 p-3 rounded-full transition-all shadow-lg hover:shadow-xl ${
              showAccessibilityPanel
                ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white scale-110'
                : 'glass text-gray-700 hover:bg-white/90'
            } ${largeControls ? 'scale-125' : ''}`}
            aria-label="Accessibility controls"
            title="Accessibility Controls"
          >
            <Accessibility className="w-5 h-5" />
          </button>

          {}
          <MeetingControls
            isVideoEnabled={mediaControls.videoEnabled}
            isAudioEnabled={mediaControls.audioEnabled}
            isScreenSharing={mediaControls.screenShareEnabled}
            isChatOpen={showChat}
            onToggleVideo={toggleVideo}
            onToggleAudio={toggleAudio}
            onToggleScreenShare={() =>
              mediaControls.screenShareEnabled ? stopScreenShare() : startScreenShare()
            }
            onToggleChat={() => setShowChat(!showChat)}
            onLeave={handleLeave}
            layout={meetingLayout}
            keyboardOnly={keyboardOnlyMode}
            captionsEnabled={captionsEnabled}
            onToggleCaptions={() => {
            }}
          />
        </>
      )}

      {}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        id="meeting-announcements"
      />
    </div>
  );
}
