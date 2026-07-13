'use client';

import React, { useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  MonitorUp,
  MessageSquare,
  PhoneOff,
  Subtitles,
} from 'lucide-react';

/**
 * MeetingControls Component
 * Accessible meeting controls with keyboard navigation and large targets
 */

interface MeetingControlsProps {
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  captionsEnabled: boolean;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleCaptions: () => void;
  onLeave: () => void;
  layout?: 'default' | 'large' | 'simple';
  keyboardOnly?: boolean;
}

export function MeetingControls({
  isVideoEnabled,
  isAudioEnabled,
  isScreenSharing,
  isChatOpen,
  captionsEnabled,
  onToggleVideo,
  onToggleAudio,
  onToggleScreenShare,
  onToggleChat,
  onToggleCaptions,
  onLeave,
  layout = 'default',
  keyboardOnly = false,
}: MeetingControlsProps) {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'v':
          if (e.ctrlKey || e.metaKey) return;
          onToggleVideo();
          announceAction(isVideoEnabled ? 'Video turned off' : 'Video turned on');
          break;
        case 'a':
        case 'm':
          onToggleAudio();
          announceAction(isAudioEnabled ? 'Microphone muted' : 'Microphone unmuted');
          break;
        case 's':
          if (e.ctrlKey || e.metaKey) return;
          onToggleScreenShare();
          announceAction(
            isScreenSharing ? 'Screen sharing stopped' : 'Screen sharing started'
          );
          break;
        case 'c':
          onToggleChat();
          announceAction(isChatOpen ? 'Chat closed' : 'Chat opened');
          break;
        case 't':
          onToggleCaptions();
          announceAction(captionsEnabled ? 'Captions disabled' : 'Captions enabled');
          break;
        case 'escape':
          if (confirm('Are you sure you want to leave the meeting?')) {
            onLeave();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [
    isVideoEnabled,
    isAudioEnabled,
    isScreenSharing,
    isChatOpen,
    captionsEnabled,
    onToggleVideo,
    onToggleAudio,
    onToggleScreenShare,
    onToggleChat,
    onToggleCaptions,
    onLeave,
  ]);

  const announceAction = useCallback((message: string) => {
    const announcer = document.getElementById('meeting-announcements');
    if (announcer) {
      announcer.textContent = message;
    }
  }, []);

  const buttonSize = layout === 'large' ? 'w-16 h-16' : layout === 'simple' ? 'w-14 h-14' : 'w-12 h-12';
  const iconSize = layout === 'large' ? 28 : layout === 'simple' ? 24 : 20;
  const spacing = layout === 'large' ? 'gap-4' : 'gap-3';

  const controls = [
    {
      id: 'video',
      icon: isVideoEnabled ? Video : VideoOff,
      label: isVideoEnabled ? 'Turn off camera' : 'Turn on camera',
      active: isVideoEnabled,
      onClick: onToggleVideo,
      color: isVideoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700',
      shortcut: 'V',
    },
    {
      id: 'audio',
      icon: isAudioEnabled ? Mic : MicOff,
      label: isAudioEnabled ? 'Mute microphone' : 'Unmute microphone',
      active: isAudioEnabled,
      onClick: onToggleAudio,
      color: isAudioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700',
      shortcut: 'A',
    },
    {
      id: 'screenshare',
      icon: MonitorUp,
      label: isScreenSharing ? 'Stop sharing' : 'Share screen',
      active: isScreenSharing,
      onClick: onToggleScreenShare,
      color: isScreenSharing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600',
      shortcut: 'S',
    },
    {
      id: 'captions',
      icon: Subtitles,
      label: captionsEnabled ? 'Hide captions' : 'Show captions',
      active: captionsEnabled,
      onClick: onToggleCaptions,
      color: captionsEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600',
      shortcut: 'T',
    },
    {
      id: 'chat',
      icon: MessageSquare,
      label: isChatOpen ? 'Close chat' : 'Open chat',
      active: isChatOpen,
      onClick: onToggleChat,
      color: isChatOpen ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600',
      shortcut: 'C',
    },
  ];

  return (
    <div
      className="bg-gray-800 px-6 py-4 border-t border-gray-700"
      role="toolbar"
      aria-label="Meeting controls"
    >
      <div className={`flex items-center justify-center ${spacing}`}>
        {}
        {controls.map((control) => (
          <motion.button
            key={control.id}
            whileHover={{ scale: layout === 'large' ? 1.05 : 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={control.onClick}
            className={`
              ${buttonSize} rounded-full ${control.color}
              text-white transition-all shadow-lg
              flex items-center justify-center
              focus:outline-none focus:ring-4 focus:ring-blue-500
              ${keyboardOnly ? 'ring-2 ring-blue-400' : ''}
            `}
            aria-label={control.label}
            aria-pressed={control.active}
            title={`${control.label} (${control.shortcut})`}
          >
            <control.icon size={iconSize} />
          </motion.button>
        ))}

        {}
        <motion.button
          whileHover={{ scale: layout === 'large' ? 1.05 : 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={onLeave}
          className={`
            ${buttonSize} rounded-full bg-red-600 hover:bg-red-700
            text-white transition-all shadow-lg
            flex items-center justify-center ml-4
            focus:outline-none focus:ring-4 focus:ring-red-500
          `}
          aria-label="Leave meeting"
          title="Leave meeting (Esc)"
        >
          <PhoneOff size={iconSize} />
        </motion.button>
      </div>

      {}
      {keyboardOnly && (
        <div
          className="mt-3 text-center text-xs text-gray-400"
          role="status"
          aria-live="polite"
        >
          Keyboard shortcuts enabled: V (video), A (audio), S (screen), C (chat), T (captions), Esc (leave)
        </div>
      )}
    </div>
  );
}
