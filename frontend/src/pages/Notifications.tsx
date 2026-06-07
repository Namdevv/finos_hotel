import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { NotifEmpty, NotificationItem } from "../components/NotificationBell";
import { Button, Card, PageHeader, Spinner } from "../components/ui";
import { IconCheckCheck } from "../components/icons";
import type { Notification } from "../types";

const PAGE_SIZE = 20;

export default function Notifications() {
  const nav = useNavigate();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState("");

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

  async function openItem(n: Notification) {
    if (!n.is_read) {
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
    setItems((arr) => arr?.map((x) => ({ ...x, is_read: true })) ?? arr);
    try {
      await api.markAllNotifRead();
    } catch {
      /* ignore */
    }
    if (onlyUnread) load(true, 0);
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
