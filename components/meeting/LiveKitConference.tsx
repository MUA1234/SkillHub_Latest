'use client';

/**
 * LiveKit-backed video conference — a drop-in replacement for the old Jitsi
 * component. Fetches a room token from our backend, then renders LiveKit's
 * prebuilt <VideoConference> (grid, camera/mic/screen-share controls, chat).
 * LiveKit Cloud provides the SFU + TURN, so no WebRTC plumbing lives here.
 */

import { useEffect, useState } from 'react';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface LiveKitConferenceProps {
  roomId: string;
  displayName?: string;
  title?: string;
  onLeave?: () => void;
}

export function LiveKitConference({ roomId, displayName, title, onLeave }: LiveKitConferenceProps) {
  const [conn, setConn] = useState<{ url: string; token: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getLiveKitToken(roomId, displayName)
      .then((res) => {
        if (!cancelled) setConn({ url: res.url, token: res.token });
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Could not join the room.');
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, displayName]);

  if (error) {
    return (
      <div className="min-h-screen bg-espresso flex items-center justify-center text-cream p-6">
        <div className="text-center max-w-md">
          <p className="font-semibold text-lg mb-2">Couldn&apos;t join the meeting</p>
          <p className="text-cream/70 text-sm mb-4">{error}</p>
          <button onClick={onLeave} className="px-4 py-2 rounded-lg bg-mustard text-espresso font-semibold">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!conn) {
    return (
      <div className="min-h-screen bg-espresso flex items-center justify-center text-cream">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-mustard" />
          <p>Connecting to {title || 'the meeting'}…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh' }} className="bg-espresso">
      <LiveKitRoom
        serverUrl={conn.url}
        token={conn.token}
        connect={true}
        video={true}
        audio={true}
        data-lk-theme="default"
        style={{ height: '100%' }}
        onDisconnected={onLeave}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}

export default LiveKitConference;
