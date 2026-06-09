import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { JobStage, JobSummary } from "../types";

// Nhãn giai đoạn (khớp jobs.stage do worker ghi). Concurrency = 1 nên chỉ có
// tối đa 1 job đang chạy, số còn lại xếp hàng tuần tự.
const STAGE_LABEL: Record<JobStage, string> = {
  preparing: "Đang chuẩn bị ảnh",
  recognizing: "Đang đọc chữ",
  parsing: "Đang bóc tách dòng",
};

function isRunning(j: JobSummary): boolean {
  return !j.cancelled && (j.status === "queued" || j.status === "processing");
}

/**
 * Pill nổi hiển thị tiến độ hàng đợi OCR (xử lý nền, tuần tự). Ẩn khi rảnh.
 * Poll nhanh khi có việc, chậm khi rảnh để vẫn bắt được ảnh mới upload.
 */
export default function QueueWidget() {
  const nav = useNavigate();
  const [running, setRunning] = useState<JobSummary[]>([]);
  const timer = useRef<number>();

  useEffect(() => {
    let alive = true;
    async function tick() {
      let next = 12000;
      try {
        const jobs = await api.listJobs();
        if (!alive) return;
        const r = jobs.filter(isRunning);
        setRunning(r);
        if (r.length) next = 3500; // có việc đang chạy -> poll nhanh hơn
      } catch {
        /* mạng chập chờn — thử lại lần sau */
      }
      if (alive) timer.current = window.setTimeout(tick, next);
    }
    tick();
    return () => {
      alive = false;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (running.length === 0) return null;

  const processing = running.find((j) => j.status === "processing");
  const queued = running.filter((j) => j.status === "queued").length;
  const sub = processing
    ? `${processing.stage ? STAGE_LABEL[processing.stage] : "Đang xử lý…"}${
        queued > 0 ? ` · còn ${queued} ảnh chờ` : ""
      }`
    : `${queued} ảnh trong hàng đợi`;

  return (
    <button
      onClick={() => nav("/uploads")}
      title="Xem thư viện ảnh"
      className="fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-3 rounded-full border border-slate-200 bg-white py-2.5 pl-3 pr-4 shadow-pop transition-shadow hover:shadow-lg md:bottom-6"
    >
      <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
      <span className="text-left leading-tight">
        <span className="block text-sm font-semibold text-slate-800">
          Đang xử lý {running.length} ảnh
        </span>
        <span className="block text-[11px] text-slate-500">{sub}</span>
      </span>
    </button>
  );
}
