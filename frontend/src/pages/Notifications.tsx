import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { NotifEmpty, NotificationItem } from "../components/NotificationBell";
import { Button, Card, PageHeader, Spinner } from "../components/ui";
import { IconCheckCheck } from "../components/icons";
import { disableWebPush, enableWebPush } from "../notify";
import type { Notification, NotificationPreference, PushStatus } from "../types";

const PAGE_SIZE = 20;

export default function Notifications() {
  const nav = useNavigate();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState("");
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [prefError, setPrefError] = useState("");
  const [push, setPush] = useState<PushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const load = useCallback(async (unread: boolean, nextPage: number) => {
    setItems(null);
    setError("");
    try {
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE + 1), // lấy dư 1 để biết còn trang sau
        offset: String(nextPage * PAGE_SIZE),
      };
      if (unread) params.only_unread = "true";
      const rows = await api.listNotifications(params);
      setHasNext(rows.length > PAGE_SIZE);
      setItems(rows.slice(0, PAGE_SIZE));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load(onlyUnread, page);
  }, [load, onlyUnread, page]);

  useEffect(() => {
    api
      .listNotificationPreferences()
      .then(setPrefs)
      .catch((err) => setPrefError((err as Error).message));
    api.pushStatus().then(setPush).catch(() => setPush({ enabled: false, subscribed: false }));
  }, []);

  async function openItem(n: Notification) {
    if (!n.is_read) {
      const prevItems = items;
      setItems((arr) => arr?.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)) ?? arr);
      try {
        await api.markNotifRead(n.id);
      } catch {
        setItems(prevItems);
      }
    }
    if (n.link) nav(n.link);
  }

  async function markAll() {
    const prevItems = items;
    setItems((arr) => arr?.map((x) => ({ ...x, is_read: true })) ?? arr);
    try {
      await api.markAllNotifRead();
    } catch {
      setItems(prevItems);
    }
    if (onlyUnread) load(true, 0);
  }

  async function togglePref(pref: NotificationPreference) {
    setPrefError("");
    const prev = prefs;
    const nextEnabled = !pref.enabled;
    setPrefs((arr) =>
      arr.map((x) => (x.notif_type === pref.notif_type ? { ...x, enabled: nextEnabled } : x)),
    );
    try {
      setPrefs(await api.updateNotificationPreferences({ [pref.notif_type]: nextEnabled }));
    } catch (err) {
      setPrefs(prev);
      setPrefError((err as Error).message);
    }
  }

  async function togglePush() {
    if (!push) return;
    setPrefError("");
    setPushBusy(true);
    try {
      if (push.subscribed) await disableWebPush();
      else await enableWebPush();
      setPush(await api.pushStatus());
    } catch (err) {
      setPrefError((err as Error).message);
      setPush(await api.pushStatus().catch(() => push));
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Thông báo"
        subtitle="Tất cả thông báo gửi đến bạn — bấm vào để xem chi tiết."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-semibold">
              <button
                onClick={() => {
                  setPage(0);
                  setOnlyUnread(false);
                }}
                className={`cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
                  !onlyUnread ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => {
                  setPage(0);
                  setOnlyUnread(true);
                }}
                className={`cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
                  onlyUnread ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Chưa đọc
              </button>
            </div>
            <Button variant="secondary" size="sm" onClick={markAll}>
              <IconCheckCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Đánh dấu đã đọc</span>
            </Button>
          </div>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Tùy chọn nhận</h2>
            {prefError && <p className="mt-1 text-xs text-rose-600">{prefError}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant={push?.subscribed ? "secondary" : "primary"}
              size="sm"
              disabled={pushBusy || !push?.enabled}
              onClick={togglePush}
            >
              {push?.subscribed ? "Tắt Web Push" : "Bật Web Push"}
            </Button>
            {prefs.map((pref) => (
              <label
                key={pref.notif_type}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  pref.enabled
                    ? "border-brand-200 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                <input
                  type="checkbox"
                  checked={pref.enabled}
                  onChange={() => togglePref(pref)}
                  className="h-4 w-4 accent-brand-600"
                />
                {pref.label}
              </label>
            ))}
          </div>
        </div>
      </Card>

      {error ? (
        <Card className="text-sm text-rose-600">{error}</Card>
      ) : items === null ? (
        <Spinner label="Đang tải..." />
      ) : items.length === 0 ? (
        <Card pad={false}>
          <NotifEmpty />
        </Card>
      ) : (
        <>
          <Card pad={false} className="overflow-hidden">
            <div className="divide-y divide-slate-100">
              {items.map((n) => (
                <NotificationItem key={n.id} n={n} onClick={openItem} />
              ))}
            </div>
          </Card>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-slate-500">Trang {page + 1}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Trang trước
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Trang sau
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
