import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getToken } from "../api";
import { useAuth } from "../auth";
import { Badge, Card, PageHeader, Spinner } from "../components/ui";
import { IconAlert, IconImage, IconTrash } from "../components/icons";
import type { JobSummary } from "../types";

/** Ảnh từ endpoint cần Bearer token -> tải bằng fetch rồi tạo object URL. */
function AuthImage({ src, alt }: { src: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    fetch(src, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        if (!alive) return;
        revoke = URL.createObjectURL(b);
        setUrl(revoke);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [src]);
  if (!url)
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-300">
        <IconImage className="h-6 w-6" />
      </div>
    );
  return <img src={url} alt={alt} className="h-full w-full object-cover" />;
}

function statusBadge(j: JobSummary) {
  if (j.cancelled || j.error === "Đã ngưng") return <Badge color="slate">Đã ngưng</Badge>;
  if (j.status === "done") return <Badge color="green">Xong · {j.n_rows} dòng</Badge>;
  if (j.status === "failed") return <Badge color="red">Lỗi</Badge>;
  if (j.status === "processing") return <Badge color="blue">Đang xử lý…</Badge>;
  return <Badge color="amber">Trong hàng đợi</Badge>;
}

export default function Uploads() {
  const nav = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listJobs().then(setJobs).catch((e) => setError((e as Error).message));
  }, []);

  async function onCancel(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    try {
      await api.cancelJob(id);
      setJobs((js) => js?.map((j) => (j.id === id ? { ...j, cancelled: true } : j)) ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!window.confirm("Xóa ảnh này và toàn bộ chứng từ đã lưu từ ảnh này?")) return;
    try {
      await api.deleteJob(id, true);
      setJobs((js) => js?.filter((j) => j.id !== id) ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (error)
    return (
      <Card className="mx-auto max-w-lg">
        <div className="flex items-center gap-2 text-rose-600">
          <IconAlert className="h-5 w-5" />
          {error}
        </div>
      </Card>
    );
  if (!jobs) return <Spinner label="Đang tải…" />;

  return (
    <div>
      <PageHeader title="Thư viện ảnh" subtitle="Các ảnh sổ đã tải lên. Bấm để xem lại hoặc OCR lại." />

      {jobs.length === 0 ? (
        <Card className="py-12 text-center text-sm text-slate-500">
          Chưa có ảnh nào được tải lên.
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {jobs.map((j) => {
            const running =
              !j.cancelled && (j.status === "queued" || j.status === "processing");
            return (
              <div
                key={j.id}
                role="button"
                tabIndex={0}
                onClick={() => nav(`/review/${j.id}`)}
                onKeyDown={(e) => e.key === "Enter" && nav(`/review/${j.id}`)}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-card transition-shadow hover:shadow-pop"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <AuthImage src={`/api/ocr/image/${j.id}`} alt={`Ảnh sổ #${j.id}`} />
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0 space-y-1.5">
                    {statusBadge(j)}
                    <div className="text-xs text-slate-400">
                      {j.created_at?.slice(0, 16).replace("T", " ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {running ? (
                      <button
                        onClick={(e) => onCancel(e, j.id)}
                        title="Ngưng"
                        className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-50"
                      >
                        Ngưng
                      </button>
                    ) : (
                      isAdmin && (
                        <button
                          onClick={(e) => onDelete(e, j.id)}
                          title="Xóa khỏi lịch sử"
                          className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
