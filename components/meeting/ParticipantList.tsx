'use client';

import React from 'react';
import { User, Mic, MicOff, Video, VideoOff, Crown } from 'lucide-react';
import { MeetingParticipant } from '@/lib/webrtc/types';

/**
 * ParticipantList Component
 * Shows all meeting participants with their status
 */

interface ParticipantListProps {
  participants: MeetingParticipant[];
  currentUserId: string;
  largeText?: boolean;
}

export function ParticipantList({
  participants,
  currentUserId,
  largeText = false,
}: ParticipantListProps) {
  const textSize = largeText ? 'text-base' : 'text-sm';

  return (
    <div className="flex flex-col h-full">
      {}
      <div className="px-4 py-3 border-b border-gray-700">
        <h3 className={`font-semibold text-white ${largeText ? 'text-lg' : ''}`}>
          Participants ({participants.length + 1})
        </h3>
      </div>

      {}
      <div className="flex-1 overflow-y-auto p-2">
        {}
        <div
          className={`
            flex items-center gap-3 px-3 py-3 rounded-lg bg-blue-600/20
            border-l-4 border-blue-500 mb-2
          `}
        >
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <User size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`font-medium text-white ${textSize}`}>You</div>
            <div className={`text-gray-400 text-xs ${largeText ? 'text-sm' : ''}`}>Host</div>
          </div>
          <div className="flex gap-2">
            <Crown size={16} className="text-yellow-500" />
            <Mic size={16} className="text-green-500" />
            <Video size={16} className="text-green-500" />
          </div>
        </div>

        {}
        {participants.map((participant) => (
          <div
            key={participant.id}
            className={`
              flex items-center gap-3 px-3 py-3 rounded-lg
              hover:bg-gray-700/50 transition-colors mb-1
            `}
          >
            <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
              <User size={20} className="text-gray-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-medium text-white ${textSize} truncate`}>
                {participant.user_id}
              </div>
              <div className={`text-gray-400 text-xs ${largeText ? 'text-sm' : ''}`}>
                {participant.role}
              </div>
            </div>
            <div className="flex gap-2">
              {participant.audio_enabled ? (
                <Mic size={16} className="text-green-500" />
              ) : (
                <MicOff size={16} className="text-red-500" />
              )}
              {participant.video_enabled ? (
                <Video size={16} className="text-green-500" />
              ) : (
                <VideoOff size={16} className="text-gray-500" />
              )}
            </div>
          </div>
        ))}

        {participants.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p className={textSize}>No other participants yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
