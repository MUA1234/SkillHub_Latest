/**
 * Web Push helpers (Phase F3).
 *
 * Walks the browser through:
 *   1. Service worker registration (`/sw.js`).
 *   2. Notification permission prompt (only on user gesture — never auto).
 *   3. PushManager subscription with the backend-supplied VAPID key.
 *   4. POST the subscription to `/api/v1/notifications/subscribe`.
 *
 * Tolerates a missing VAPID config (the backend returns an empty string
 * for `public_key` when unconfigured); in that case we register the
 * service worker but skip the subscribe step so push degrades cleanly to
 * realtime-bell only.
 */

const SW_PATH = '/sw.js';

const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:8000';

function authHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register(SW_PATH);
  } catch (err) {
    console.warn('SW registration failed:', err);
    return null;
  }
}

export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/v1/notifications/vapid-public-key`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.public_key || null;
  } catch {
    return null;
  }
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await registerServiceWorker();
  if (!reg) return null;

  const perm =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  if (perm !== 'granted') return null;

  const vapid = await getVapidPublicKey();
  if (!vapid) return null;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    });
  }

  const json = sub.toJSON();
  try {
    await fetch(`${API_BASE_URL}/api/v1/notifications/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
      },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        user_agent: navigator.userAgent,
      }),
    });
  } catch (err) {
    console.warn('Push subscribe persist failed:', err);
  }
  return sub;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  try {
    await fetch(`${API_BASE_URL}/api/v1/notifications/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(),
      },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
  }
}

export async function getCurrentPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}
