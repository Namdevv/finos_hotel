import { useEffect, useRef } from "react";
import type { NavigateFunction } from "react-router-dom";
import { api } from "./api";
import type { Notification as AppNotification } from "./types";

// Notification API chỉ chạy ở origin bảo mật (localhost hoặc HTTPS). Trên LAN
// qua HTTP thuần sẽ không bật được — khi đó tự động lùi về chuông in-app.
const SUPPORTED = typeof window !== "undefined" && "Notification" in window;
const POLL_MS = 15000;

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
      if (n.link) nav(n.link);
      notif.close();
    };
  } catch {
    /* ignore */
  }
}

/**
 * Theo dõi thông báo CHƯA ĐỌC mới và bắn thông báo hệ thống khi tab đang ẩn.
 * Tái dùng nguồn thông báo in-app sẵn có (ocr.done / ocr.failed…) nên mọi loại
 * thông báo tương lai cũng tự được đẩy ra ngoài. Chỉ bắn khi người dùng không
 * nhìn tab để tránh nhiễu (đang dùng app thì đã có chuông + widget hàng đợi).
 */
export function useSystemNotifications(nav: NavigateFunction, enabled: boolean): void {
  const lastId = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled || !SUPPORTED) return;
    let alive = true;
    let timer: number | undefined;

    async function tick() {
      try {
        const items = await api.listNotifications({ only_unread: "true", limit: "10" });
        if (!alive) return;
        const maxId = items.length ? Math.max(...items.map((n) => n.id)) : 0;
        if (lastId.current === null) {
          // Lần đầu: lập mốc, không bắn lại cho thông báo cũ lúc mở trang.
          lastId.current = maxId;
        } else {
          const prev = lastId.current;
          if (Notification.permission === "granted" && document.visibilityState === "hidden") {
            items
              .filter((n) => n.id > prev)
              .sort((a, b) => a.id - b.id)
              .forEach((n) => fire(n, nav));
          }
          lastId.current = Math.max(prev, maxId);
        }
      } catch {
        /* mạng chập chờn — thử lại lần sau */
      }
      if (alive) timer = window.setTimeout(tick, POLL_MS);
    }

    tick();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [nav, enabled]);
}
