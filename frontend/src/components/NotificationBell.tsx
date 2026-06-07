import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { relTime } from "../lib";
import type { Notification, NotifLevel } from "../types";
import {
  IconAlert,
  IconBell,
  IconCheck,
  IconCheckCheck,
  IconInbox,
} from "./icons";
import { Spinner } from "./ui";

const POLL_MS = 20000;

// Mỗi mức độ → màu nền + icon (theo COLORS.md: success=emerald, info=brand,
// warning=amber, error=rose).
export const NOTIF_STYLE: Record<
  NotifLevel,
  { wrap: string; Icon: typeof IconBell }
> = {
  success: { wrap: "bg-emerald-50 text-emerald-600", Icon: IconCheck },
  info: { wrap: "bg-brand-50 text-brand-600", Icon: IconBell },
  warning: { wrap: "bg-amber-50 text-amber-600", Icon: IconAlert },
  error: { wrap: "bg-rose-50 text-rose-600", Icon: IconAlert },
};

/** Một dòng thông báo — dùng chung cho dropdown chuông và trang Thông báo. */
export function NotificationItem({
  n,
  onClick,
}: {
  n: Notification;
  onClick: (n: Notification) => void;
}) {
  const s = NOTIF_STYLE[n.level] ?? NOTIF_STYLE.info;
  return (
    <button
      onClick={() => onClick(n)}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
        n.is_read ? "" : "bg-brand-50/40"
      }`}
    >
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${s.wrap}`}
      >
        <s.Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span
            className={`text-sm leading-snug ${
              n.is_read ? "font-medium text-slate-700" : "font-semibold text-slate-900"
            }`}
          >
            {n.title}
          </span>
          {!n.is_read && (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />
          )}
        </div>
        {n.body && (
          <p className="mt-0.5 line-clamp-2 break-words text-xs text-slate-500">
            {n.body}
          </p>
        )}
        <span className="mt-1 block text-[11px] text-slate-400">
          {relTime(n.created_at)}
        </span>
      </div>
    </button>
  );
}

/** Trạng thái rỗng dùng chung. */
export function NotifEmpty({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center text-slate-400 ${
        compact ? "py-12" : "py-16"
      }`}
    >
      <IconInbox className="h-9 w-9" />
      <p className="mt-2 text-sm">Chưa có thông báo nào</p>
    </div>
  );
}

export default function NotificationBell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    try {
      const r = await api.unreadCount();
      setCount(r.count);
    } catch {
      /* mạng chập chờn — bỏ qua, lần poll sau thử lại */
    }
  }, []);

  const loadList = useCallback(async () => {
    setItems(null);
    try {
      setItems(await api.listNotifications({ limit: "12" }));
    } catch {
      setItems([]);
    }
  }, []);

  // Poll số chưa đọc định kỳ + khi tab được focus lại.
  useEffect(() => {
    loadCount();
    const id = window.setInterval(loadCount, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && loadCount();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadCount]);

  // Đóng khi bấm ra ngoài / nhấn Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  async function openItem(n: Notification) {
    setOpen(false);
    if (!n.is_read) {
      setCount((c) => Math.max(0, c - 1));
      setItems((arr) => arr?.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)) ?? arr);
      try {
        await api.markNotifRead(n.id);
      } catch {
        /* ignore */
      }
    }
    if (n.link) nav(n.link);
  }

  async function markAll() {
    if (count === 0) return;
    setBusy(true);
    setCount(0);
    setItems((arr) => arr?.map((x) => ({ ...x, is_read: true })) ?? arr);
    try {
      await api.markAllNotifRead();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Thông báo"
        aria-expanded={open}
        className={`relative cursor-pointer rounded-full p-2 transition-colors ${
          open ? "bg-slate-100 text-slate-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        }`}
      >
        <IconBell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-0 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Lớp nền mờ — chỉ trên mobile, để bấm ra ngoài đóng panel */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/20 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-2 top-[60px] z-50 origin-top animate-fade-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem]">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-900">Thông báo</h3>
              <button
                onClick={markAll}
                disabled={busy || count === 0}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
              >
                <IconCheckCheck className="h-4 w-4" />
                Đã đọc tất cả
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto sm:max-h-[24rem]">
              {items === null ? (
                <Spinner />
              ) : items.length === 0 ? (
                <NotifEmpty compact />
              ) : (
                <div className="divide-y divide-slate-100">
                  {items.map((n) => (
                    <NotificationItem key={n.id} n={n} onClick={openItem} />
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setOpen(false);
                nav("/notifications");
              }}
              className="block w-full cursor-pointer border-t border-slate-200 py-2.5 text-center text-xs font-semibold text-brand-600 transition-colors hover:bg-slate-50"
            >
              Xem tất cả thông báo
            </button>
          </div>
        </>
      )}
    </div>
  );
}
