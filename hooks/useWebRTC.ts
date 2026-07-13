/**
 * WebRTC Connection Hook
 * Manages WebRTC peer connections, media streams, and signaling
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  UseWebRTCReturn,
  MediaControls,
  MeetingParticipant,
  PeerConnection,
  SignalingMessage,
  WebRTCConfig,
} from '@/lib/webrtc/types';
import { useRealtimeSignaling } from './useRealtimeSignaling';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface UseWebRTCProps {
  meetingId: string;
  userId: string;
  userName: string;
  enableVideo?: boolean;
  enableAudio?: boolean;
  onParticipantJoined?: (participant: MeetingParticipant) => void;
  onParticipantLeft?: (userId: string) => void;
}

export function useWebRTC({
  meetingId,
  userId,
  userName,
  enableVideo = true,
  enableAudio = true,
  onParticipantJoined,
  onParticipantLeft,
}: UseWebRTCProps): UseWebRTCReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<Error>();
  const [localStream, setLocalStream] = useState<MediaStream>();
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [screenStream, setScreenStream] = useState<MediaStream>();
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [mediaControls, setMediaControls] = useState<MediaControls>({
    videoEnabled: enableVideo,
    audioEnabled: enableAudio,
    screenShareEnabled: false,
    captionsEnabled: false,
  });

  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const rtcConfig: WebRTCConfig = {
    iceServers: DEFAULT_ICE_SERVERS,
    sdpSemantics: 'unified-plan',
  };

  const handleSignal = useCallback(
    async (signal: SignalingMessage) => {
      console.log('Received signal:', signal.message_type, 'from:', signal.from_user_id);

      switch (signal.message_type) {
        case 'join':
          await createOffer(signal.from_user_id);
          break;

        case 'offer':
          await handleOffer(signal.from_user_id, signal.payload);
          break;

        case 'answer':
          await handleAnswer(signal.from_user_id, signal.payload);
          break;

        case 'ice-candidate':
          await handleIceCandidate(signal.from_user_id, signal.payload);
          break;

        case 'leave':
          handleParticipantLeft(signal.from_user_id);
          break;

        default:
          console.warn('Unknown signal type:', signal.message_type);
      }
    },
    [userId, meetingId]
  );

  const { sendSignal, isConnected: signalingConnected } = useRealtimeSignaling(
    meetingId,
    userId,
    handleSignal
  );

  const createPeerConnection = useCallback(
    (remoteUserId: string): RTCPeerConnection => {
      console.log('Creating peer connection for:', remoteUserId);

      const pc = new RTCPeerConnection(rtcConfig);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({
            to_user_id: remoteUserId,
            message_type: 'ice-candidate',
            payload: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        console.log('Received remote track from:', remoteUserId);
        const [remoteStream] = event.streams;

        if (remoteStream) {
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.set(remoteUserId, remoteStream);
            return next;
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState, 'for:', remoteUserId);

        if (pc.connectionState === 'connected') {
          console.log('Successfully connected to:', remoteUserId);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          handleParticipantLeft(remoteUserId);
        }
      };

      peerConnectionsRef.current.set(remoteUserId, {
        userId: remoteUserId,
        connection: pc,
      });

      return pc;
    },
    [sendSignal, rtcConfig]
  );

  const createOffer = useCallback(
    async (remoteUserId: string) => {
      try {
        const pc = createPeerConnection(remoteUserId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await sendSignal({
          to_user_id: remoteUserId,
          message_type: 'offer',
          payload: offer,
        });

        console.log('Sent offer to:', remoteUserId);
      } catch (err) {
        console.error('Failed to create offer:', err);
      }
    },
    [createPeerConnection, sendSignal]
  );

  const handleOffer = useCallback(
    async (remoteUserId: string, offer: RTCSessionDescriptionInit) => {
      try {
        const pc = createPeerConnection(remoteUserId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await sendSignal({
          to_user_id: remoteUserId,
          message_type: 'answer',
          payload: answer,
        });

        console.log('Sent answer to:', remoteUserId);
      } catch (err) {
        console.error('Failed to handle offer:', err);
      }
    },
    [createPeerConnection, sendSignal]
  );

  const handleAnswer = useCallback(
    async (remoteUserId: string, answer: RTCSessionDescriptionInit) => {
      try {
        const peerConnection = peerConnectionsRef.current.get(remoteUserId);
        if (peerConnection) {
          await peerConnection.connection.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('Set remote description from answer:', remoteUserId);
        }
      } catch (err) {
        console.error('Failed to handle answer:', err);
      }
    },
    []
  );

  const handleIceCandidate = useCallback(
    async (remoteUserId: string, candidate: RTCIceCandidateInit) => {
      try {
        const peerConnection = peerConnectionsRef.current.get(remoteUserId);
        if (peerConnection && peerConnection.connection.remoteDescription) {
          await peerConnection.connection.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('Added ICE candidate from:', remoteUserId);
        }
      } catch (err) {
        console.error('Failed to add ICE candidate:', err);
      }
    },
    []
  );

  const handleParticipantLeft = useCallback(
    (remoteUserId: string) => {
      const peerConnection = peerConnectionsRef.current.get(remoteUserId);
      if (peerConnection) {
        peerConnection.connection.close();
        peerConnectionsRef.current.delete(remoteUserId);
      }

      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(remoteUserId);
        return next;
      });

      onParticipantLeft?.(remoteUserId);
    },
    [onParticipantLeft]
  );

  const joinMeeting = useCallback(async () => {
    try {
      setIsConnecting(true);
      setConnectionError(undefined);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: mediaControls.videoEnabled,
        audio: mediaControls.audioEnabled,
      });

      setLocalStream(stream);
      localStreamRef.current = stream;

      await sendSignal({
        message_type: 'join',
        payload: { userName, userId },
      });

      setIsConnected(true);
      setIsConnecting(false);

      console.log('Joined meeting:', meetingId);
    } catch (err) {
      console.error('Failed to join meeting:', err);
      setConnectionError(err as Error);
      setIsConnecting(false);
    }
  }, [meetingId, userId, userName, mediaControls, sendSignal]);

  const leaveMeeting = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());

    peerConnectionsRef.current.forEach((pc) => {
      pc.connection.close();
    });
    peerConnectionsRef.current.clear();

    sendSignal({
      message_type: 'leave',
      payload: { userId },
    });

    setLocalStream(undefined);
    setScreenStream(undefined);
    setRemoteStreams(new Map());
    setIsConnected(false);

    console.log('Left meeting:', meetingId);
  }, [meetingId, userId, sendSignal]);

  const toggleVideo = useCallback(async () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setMediaControls((prev) => ({ ...prev, videoEnabled: videoTrack.enabled }));
      }
    }
  }, []);

  const toggleAudio = useCallback(async () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMediaControls((prev) => ({ ...prev, audioEnabled: audioTrack.enabled }));
      }
    }
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setMediaControls((prev) => ({ ...prev, screenShareEnabled: true }));

      const screenTrack = stream.getVideoTracks()[0];
      peerConnectionsRef.current.forEach(({ connection }) => {
        const sender = connection.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      });

      screenTrack.onended = () => {
        stopScreenShare();
      };

      console.log('Started screen share');
    } catch (err) {
      console.error('Failed to start screen share:', err);
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = undefined;
      setScreenStream(undefined);
      setMediaControls((prev) => ({ ...prev, screenShareEnabled: false }));

      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          peerConnectionsRef.current.forEach(({ connection }) => {
            const sender = connection.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(videoTrack);
            }
          });
        }
      }

      console.log('Stopped screen share');
    }
  }, []);

  useEffect(() => {
    return () => {
      leaveMeeting();
    };
  }, []);

  return {
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
  };
}
