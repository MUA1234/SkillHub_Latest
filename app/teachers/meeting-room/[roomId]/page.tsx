'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LiveKitConference } from '@/components/meeting/LiveKitConference';
import { getCurrentUser, isAuthenticated } from '@/lib/api';
import { Loader2 } from 'lucide-react';

interface RoomMeta {
  title?: string;
}

const TeacherMeetingRoomPage = () => {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const currentUser = getCurrentUser();
  const [isReady, setIsReady] = useState(false);
  const [meta, setMeta] = useState<RoomMeta>({});

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/auth');
      return;
    }
    if (currentUser?.role !== 'teacher') {
      router.push('/auth');
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/rooms/${roomId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.title) setMeta({ title: data.title });
      })
      .catch(() => {});

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/rooms/${roomId}/join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'host' }),
    }).catch(() => {});

    setIsReady(true);
  }, [router, roomId, currentUser?.role]);

  const handleLeave = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/rooms/${roomId}/leave`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch {
    }
    router.push('/teachers/meetings');
  };

  if (!isReady) {
    return (
      <div className="min-h-screen bg-espresso flex items-center justify-center text-cream">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-mustard" />
          <p>Loading meeting room…</p>
        </div>
      </div>
    );
  }

  const displayName = `${currentUser?.profile?.first_name || 'Teacher'} ${currentUser?.profile?.last_name || ''}`.trim();

  return (
    <LiveKitConference
      roomId={roomId}
      displayName={displayName}
      title={meta.title}
      onLeave={handleLeave}
    />
  );
};

export default TeacherMeetingRoomPage;
