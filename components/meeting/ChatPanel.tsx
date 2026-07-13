'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

/**
 * ChatPanel Component
 * Text chat for meetings (fallback communication)
 */

interface ChatMessage {
  id: string;
  user_id: string;
  user_name: string;
  message: string;
  created_at: string;
}

interface ChatPanelProps {
  meetingId: string;
  userId: string;
  userName: string;
  largeText?: boolean;
}

export function ChatPanel({ meetingId, userId, userName, largeText = false }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/chat/${encodeURIComponent(meetingId)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const rows: any[] = Array.isArray(data?.messages) ? data.messages : [];
        setMessages(
          rows.map((m) => ({
            id: String(m.id),
            user_id: String(m.user_id || ''),
            user_name: String(m.user_name || m.sender_name || 'User'),
            message: String(m.message || ''),
            created_at: String(m.created_at || new Date().toISOString()),
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const handleSend = async () => {
    const draft = newMessage.trim();
    if (!draft || sending) return;

    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      user_id: userId,
      user_name: userName,
      message: draft,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setNewMessage('');
    setSending(true);
    inputRef.current?.focus();

    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/meetings/chat/${encodeURIComponent(meetingId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message: draft }),
        },
      );
      if (!res.ok) throw new Error('send failed');
      const saved = await res.json().catch(() => null);
      if (saved?.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimistic.id ? { ...m, id: String(saved.id) } : m,
          ),
        );
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setNewMessage(draft);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const textSize = largeText ? 'text-base' : 'text-sm';

  return (
    <div className="flex flex-col h-full">
      {}
      <div className="px-4 py-3 border-b border-gray-700">
        <h3 className={`font-semibold text-white ${largeText ? 'text-lg' : ''}`}>Chat</h3>
      </div>

      {}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p className={textSize}>No messages yet</p>
            <p className={`${textSize} text-xs mt-1`}>Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`${msg.user_id === userId ? 'text-right' : 'text-left'}`}
            >
              <div
                className={`inline-block max-w-xs px-3 py-2 rounded-lg ${
                  msg.user_id === userId
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-white'
                }`}
              >
                {msg.user_id !== userId && (
                  <div className={`font-semibold mb-1 ${textSize}`}>{msg.user_name}</div>
                )}
                <div className={textSize}>{msg.message}</div>
                <div className="text-xs opacity-70 mt-1">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {}
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className={`
              flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500
              ${largeText ? 'text-base py-3' : 'text-sm'}
            `}
            aria-label="Type your message"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className={`
              bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed
              text-white rounded-lg transition-colors
              ${largeText ? 'px-4 py-3' : 'px-3 py-2'}
              focus:outline-none focus:ring-2 focus:ring-blue-500
            `}
            aria-label="Send message"
          >
            <Send size={largeText ? 24 : 20} />
          </button>
        </div>
      </div>
    </div>
  );
}
