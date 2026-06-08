import { useEffect, useRef } from "react";
import type { NavigateFunction } from "react-router-dom";
import { api, getToken } from "./api";
import type { Notification as AppNotification } from "./types";

// Notification API chỉ chạy ở origin bảo mật (localhost hoặc HTTPS). Trên LAN
// qua HTTP thuần sẽ không bật được — khi đó tự động lùi về chuông in-app.
const SUPPORTED = typeof window !== "undefined" && "Notification" in window;
const STREAM_RETRY_MS = 5000;

/** Xin quyền hiện thông báo hệ thống. Gọi trong 1 hành động của người dùng. */
export async function requestNotifyPermission(): Promise<void> {
  if (!SUPPORTED) return;
  try {
    if (Notification.permission === "default") await Notification.requestPermission();
  } catch {
    /* trình duyệt cũ / origin không bảo mật — bỏ qua, vẫn còn chuông in-app */
  }
}

function fire(n: AppNotification, nav: NavigateFunction) {
  try {
    const notif = new Notification(n.title, {
      body: n.body || undefined,
      icon: "/logo_finos.png",
      tag: `finos-notif-${n.id}`,
    });
    notif.onclick = () => {
      window.focus();
      void api.markNotifRead(n.id).catch(() => undefined);
      if (n.link) nav(n.link);
      notif.close();
    };
  } catch {
    /* ignore */
  }
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0))).buffer;
}

function subscriptionBody(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint || sub.endpoint,
    p256dh: json.keys?.p256dh || "",
    auth: json.keys?.auth || "",
  };
}

export async function enableWebPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Trình duyệt không hỗ trợ Web Push");
  }
  await requestNotifyPermission();
  if (Notification.permission !== "granted") {
    throw new Error("Bạn chưa cấp quyền thông báo cho trình duyệt");
  }
  const key = await api.pushKey();
  if (!key.enabled || !key.public_key) {
    throw new Error("Máy chủ chưa cấu hình Web Push");
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const sub =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(key.public_key),
    }));
  await api.subscribePush(subscriptionBody(sub));
}

export async function disableWebPush(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return;
  const body = subscriptionBody(sub);
  await api.unsubscribePush(body);
  await sub.unsubscribe();
}

async function readNotificationStream(
  url: string,
  signal: AbortSignal,
  onNotification: (n: AppNotification) => void,
): Promise<void> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { headers, signal });
  if (!res.ok || !res.body) throw new Error(`Notification stream failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep = buffer.indexOf("\n\n");
    while (sep >= 0) {
      const raw = buffer.slice(0, sep).trim();
      buffer = buffer.slice(sep + 2);
      const data = raw
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onNotification(JSON.parse(data) as AppNotification);
      sep = buffer.indexOf("\n\n");
    }
  }
}

export function useNotificationStream(
  enabled: boolean,
  onNotification: (n: AppNotification) => void,
  options: { onlyUnread?: boolean } = {},
): void {
  const handler = useRef(onNotification);
  const onlyUnread = options.onlyUnread ?? true;

  useEffect(() => {
    handler.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let retryTimer: number | undefined;
    const controller = new AbortController();

    async function run() {
      try {
        const params: Record<string, string> = { limit: "1" };
        if (onlyUnread) params.only_unread = "true";
        const latest = await api.listNotifications(params);
        let lastId = latest[0]?.id ?? 0;

        while (alive) {
          const q = new URLSearchParams({
            after_id: String(lastId),
            only_unread: String(onlyUnread),
          });
          await readNotificationStream(
            `/api/notifications/stream?${q}`,
            controller.signal,
            (n) => {
              lastId = Math.max(lastId, n.id);
              handler.current(n);
            },
          );
          if (alive) await new Promise((resolve) => window.setTimeout(resolve, STREAM_RETRY_MS));
        }
      } catch {
        if (alive) retryTimer = window.setTimeout(run, STREAM_RETRY_MS);
      }
    }

    void run();
    return () => {
      alive = false;
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [enabled, onlyUnread]);
}

/**
 * Theo dõi thông báo CHƯA ĐỌC mới và bắn thông báo hệ thống khi tab đang ẩn.
 * Tái dùng nguồn thông báo in-app sẵn có (ocr.done / ocr.failed…) nên mọi loại
 * thông báo tương lai cũng tự được đẩy ra ngoài. Chỉ bắn khi người dùng không
 * nhìn tab để tránh nhiễu (đang dùng app thì đã có chuông + widget hàng đợi).
 */
export function useSystemNotifications(nav: NavigateFunction, enabled: boolean): void {
  useNotificationStream(
    enabled && SUPPORTED,
    (n) => {
      if (Notification.permission === "granted" && document.visibilityState === "hidden") {
        fire(n, nav);
      }
    },
    { onlyUnread: true },
  );
}
