'use client';

/**
 * JitsiMeeting — embed wrapper around meet.jit.si's external API.
 *
 * Why Jitsi and not the custom WebRTC stack: the polling-based signaling
 * in our backend (POST/GET /api/v1/meetings/signaling) is functional but
 * adds 1-3s join latency and won't scale past ~6 participants without an
 * SFU. Jitsi gives us production-quality multi-party video, screen share,
 * tile view, raise-hand, chat, and live captions out of the box — for
 * tutoring sessions and small group classes that's the right ceiling.
 *
 * We keep the cream/espresso page chrome (header with title + Leave
 * button) and mount the Jitsi iframe inside it, so the meeting room
 * still feels like part of the SkillHub product.
 *
 * Lifecycle:
 * - On mount: dynamically inject https://meet.jit.si/external_api.js
 *   (don't ship it in the bundle — it's only needed inside a room)
 * - Configure room name as `skillhub-<roomId>` so two meetings with the
 *   same DB id always land in the same Jitsi room, and meet.jit.si treats
 *   them as disjoint from other tenants
 * - If this user is the host, PATCH the meeting status to `live` on join
 *   and `ended` on leave, so the dashboard list shows the right state
 * - On `readyToClose` (user hangs up or closes their own tab), call the
 *   parent's onLeave so the wrapper page can route back to the list
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, LogOut } from 'lucide-react';

const JITSI_SCRIPT_URL = 'https://meet.jit.si/external_api.js';
const JITSI_DOMAIN = 'meet.jit.si';

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (
      domain: string,
      options: Record<string, unknown>,
    ) => JitsiAPI;
  }
}

interface JitsiAPI {
  addListener: (event: string, handler: (...args: any[]) => void) => void;
  removeAllListeners: () => void;
  dispose: () => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
}

let scriptPromise: Promise<void> | null = null;

function loadJitsiScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JITSI_SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Jitsi external API'));
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

interface Props {
  roomId: string;
  displayName: string;
  email?: string;
  isHost?: boolean;
  title?: string;
  onLeave: () => void;
}

export function JitsiMeeting({
  roomId,
  displayName,
  email,
  isHost = false,
  title,
  onLeave,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const patchStatus = async (next: 'live' | 'ended') => {
    if (!isHost) return;
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/rooms/${roomId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('access_token') : ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ new_status: next }),
        },
      );
    } catch {
    }
  };

  useEffect(() => {
    let disposed = false;

    loadJitsiScript()
      .then(() => {
        if (disposed || !containerRef.current || !window.JitsiMeetExternalAPI) return;

        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName: `skillhub-${roomId}`,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: { displayName, email: email || '' },
          configOverwrite: {
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            startWithAudioMuted: !isHost,
            startWithVideoMuted: false,
            enableClosedCaptionsButton: true,
            disableJoinLeaveSounds: true,
            disableInviteFunctions: true,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            SHOW_PROMOTIONAL_CLOSE_PAGE: false,
            DEFAULT_BACKGROUND: '#2B1F18',
            DEFAULT_LOCAL_DISPLAY_NAME: displayName,
            TOOLBAR_BUTTONS: [
              'microphone',
              'camera',
              'desktop',
              'fullscreen',
              'fodeviceselection',
              'hangup',
              'chat',
              'raisehand',
              'videoquality',
              'tileview',
              'closedcaptions',
              'settings',
            ],
          },
        });

        apiRef.current = api;
        setLoading(false);

        api.addListener('videoConferenceJoined', () => {
          patchStatus('live');
        });

        api.addListener('readyToClose', () => {
          void patchStatus('ended');
          onLeave();
        });
      })
      .catch((err) => {
        if (disposed) return;
        setError(err?.message || 'Could not load Jitsi.');
        setLoading(false);
      });

    return () => {
      disposed = true;
      try {
        apiRef.current?.removeAllListeners();
        apiRef.current?.dispose();
      } catch {
      }
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const handleLeaveClick = () => {
    if (apiRef.current) {
      try {
        apiRef.current.executeCommand('hangup');
        return;
      } catch {
      }
    }
    void patchStatus('ended');
    onLeave();
  };

  return (
    <div className="flex flex-col h-screen bg-espresso">
      {}
      <header className="flex items-center justify-between px-4 sm:px-6 h-14 bg-espresso text-cream border-b border-cream/10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2 h-2 rounded-full bg-coral-300 animate-pulse" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-cream/65">
            Live session
          </span>
          {title && (
            <span className="text-sm font-semibold truncate text-cream/90 hidden sm:inline">
              · {title}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleLeaveClick}
          className="inline-flex items-center gap-2 rounded-full bg-coral-300 px-4 py-1.5 text-sm font-semibold text-cream border-2 border-espresso shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker transition-transform"
        >
          <LogOut className="w-4 h-4" />
          Leave
        </button>
      </header>

      <div className="relative flex-1 min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-cream/80 z-10 pointer-events-none">
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-mustard" />
              <p className="text-sm">Setting up your meeting…</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md text-center bg-cream-50 border-2 border-coral-200 rounded-2xl p-6 shadow-kid">
              <p className="font-semibold text-coral-400 mb-2">Couldn't start the meeting</p>
              <p className="text-sm text-espresso/70 mb-4">{error}</p>
              <button
                type="button"
                onClick={onLeave}
                className="btn-kid-primary"
              >
                Back to meetings
              </button>
            </div>
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
