/**
 * WebRTC Type Definitions
 * Type-safe interfaces for real-time video/audio communication
 */

export type MeetingType =
  | 'one_on_one_tutoring'
  | 'group_class'
  | 'teacher_sponsor_meeting'
  | 'parent_teacher_conference'
  | 'assessment'
  | 'consultation';

export type MeetingStatus =
  | 'scheduled'
  | 'starting'
  | 'live'
  | 'ended'
  | 'cancelled'
  | 'no_show';

export type ParticipantRole = 'host' | 'co_host' | 'participant' | 'observer';

export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'disconnected';

export interface MeetingRoom {
  id: string;
  title: string;
  description?: string;
  meeting_type: MeetingType;
  host_id: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start?: string;
  actual_end?: string;
  status: MeetingStatus;
  room_id: string;
  max_participants: number;
  current_participant_count: number;
  video_enabled: boolean;
  audio_enabled: boolean;
  screen_share_enabled: boolean;
  chat_enabled: boolean;
  recording_enabled: boolean;
  captions_enabled: boolean;
  accessibility_mode_enabled: boolean;
  low_distraction_mode: boolean;
  high_contrast_mode: boolean;
  large_controls: boolean;
  course_id?: string;
  session_id?: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  role: ParticipantRole;
  joined_at?: string;
  left_at?: string;
  is_currently_in_meeting: boolean;
  video_enabled: boolean;
  audio_enabled: boolean;
  is_screen_sharing: boolean;
  connection_quality?: ConnectionQuality;
  last_seen?: string;
  needs_captions: boolean;
  prefers_large_video: boolean;
  prefers_low_distraction: boolean;
  keyboard_only_mode: boolean;
  total_time_minutes: number;
  attended: boolean;
  spoke_count: number;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface SignalingMessage {
  id: string;
  meeting_id: string;
  from_user_id: string;
  to_user_id?: string;
  message_type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave' | 'state-change';
  payload: any;
  processed: boolean;
  processed_at?: string;
  expires_at: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  meeting_id: string;
  user_id: string;
  message: string;
  message_type: 'text' | 'system' | 'announcement';
  is_private: boolean;
  recipient_id?: string;
  reactions: any[];
  created_at: string;
}

export interface Caption {
  id: string;
  meeting_id: string;
  speaker_id?: string;
  speaker_name?: string;
  text: string;
  timestamp_offset_seconds: number;
  duration_seconds?: number;
  confidence?: number;
  language: string;
  created_at: string;
}

export interface PeerConnection {
  userId: string;
  connection: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  remoteStream?: MediaStream;
}

export interface MediaStreams {
  localStream?: MediaStream;
  screenStream?: MediaStream;
  remoteStreams: Map<string, MediaStream>;
}

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
  sdpSemantics?: 'unified-plan' | 'plan-b';
}

export interface MediaControls {
  videoEnabled: boolean;
  audioEnabled: boolean;
  screenShareEnabled: boolean;
  captionsEnabled: boolean;
}

export interface UseWebRTCReturn {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError?: Error;

  localStream?: MediaStream;
  remoteStreams: Map<string, MediaStream>;
  screenStream?: MediaStream;

  toggleVideo: () => Promise<void>;
  toggleAudio: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;

  joinMeeting: () => Promise<void>;
  leaveMeeting: () => void;

  mediaControls: MediaControls;
  participants: MeetingParticipant[];
}

export interface UseRealtimeSignalingReturn {
  sendSignal: (signal: Partial<SignalingMessage>) => Promise<void>;
  isConnected: boolean;
  error?: Error;
}
