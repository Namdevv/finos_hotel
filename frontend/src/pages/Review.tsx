import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getToken } from "../api";
import { Button, Card, Modal, Spinner } from "../components/ui";
import { IconAlert, IconCheck, IconPlus, IconRefresh, IconTrash } from "../components/icons";
import { LOW_CONF, fmtVnd, fmtVndInput, parseVnd } from "../lib";
import type { Job, JobStage, Kind, OcrRow } from "../types";

interface EditRow {
  txn_date: string;
  room: string;
  note: string;
  kind: Kind;
  amount: string;
  conf: { date: number; room: number; amount: number };
}

function toEdit(r: OcrRow): EditRow {
  return {
    txn_date: r.txn_date.value,
    room: r.room.value,
    note: r.note.value,
    kind: r.kind,
    amount: fmtVndInput(r.amount.value),
    conf: { date: r.txn_date.confidence, room: r.room.confidence, amount: r.amount.confidence },
  };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Review() {
  const { jobId } = useParams();
  const nav = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [showReocr, setShowReocr] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [reocrNonce, setReocrNonce] = useState(0);
  const polling = useRef<number | null>(null);

  useEffect(() => {
    const id = Number(jobId);
    async function tick() {
      try {
        const j = await api.getJob(id);
        setJob(j);
        if (j.status === "done") {
          setRows(j.rows.map(toEdit));
          loadImage(id);
        } else if (j.status === "failed") {
          setError(j.error || "OCR thất bại");
        } else {
          polling.current = window.setTimeout(tick, 1500);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    }
    tick();
    return () => {
      if (polling.current) clearTimeout(polling.current);
    };
  }, [jobId, reocrNonce]);

  // Đồng hồ đếm giây trong lúc chờ OCR (để biết hệ thống đang chạy, không treo).
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [job?.status]);

  async function loadImage(id: number) {
    const res = await fetch(`/api/ocr/image/${id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) setImgUrl(URL.createObjectURL(await res.blob()));
  }

  function update(i: number, patch: Partial<EditRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setRows((rs) => [
      ...rs,
      { txn_date: todayIso(), room: "", note: "", kind: "income", amount: "", conf: { date: 1, room: 1, amount: 1 } },
    ]);
  }

  async function doReocr(rotate: number | null) {
    setShowReocr(false);
    try {
      await api.reocr(Number(jobId), rotate);
      setRows([]);
      setError("");
      setElapsed(0);
      setJob((j) => (j ? { ...j, status: "queued", stage: null } : j));
      setReocrNonce((n) => n + 1); // restart polling effect
    } catch (err) {
      setError((err as Error).message || "OCR lại thất bại");
    }
  }

  async function cancelJob() {
    try {
      await api.cancelJob(Number(jobId));
      nav("/uploads");
    } catch (err) {
      setError((err as Error).message || "Ngưng thất bại");
    }
  }

  async function saveAll() {
    setSaving(true);
    setError("");
    try {
      for (const r of rows) {
        await api.createTransaction({
          txn_date: r.txn_date || todayIso(),
          room: r.room,
          note: r.note,
          kind: r.kind,
          amount: parseVnd(r.amount),
          source: "ocr",
          job_id: Number(jobId),
        });
      }
      nav("/transactions");
    } catch (err) {
      setError((err as Error).message || "Lưu thất bại");
      setSaving(false);
    }
  }

  const reocrModal = (
    <Modal open={showReocr} onClose={() => setShowReocr(false)} title="OCR lại ảnh">
      <p className="mb-3 text-sm text-slate-600">
        Chọn góc xoay rồi chạy lại. Nếu kết quả thiếu dòng hoặc đọc sai nhiều, thử góc khác —
        sổ chụp ngang thường cần <b>90°</b>.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {[0, 90, 180, 270].map((a) => {
          const cur = (job?.rotate ?? 90) === a;
          return (
            <Button key={a} variant={cur ? "primary" : "secondary"} onClick={() => doReocr(a)}>
              Xoay {a}°{cur ? " · hiện tại" : ""}
            </Button>
          );
        })}
      </div>
    </Modal>
  );

  if (error)
    return (
      <>
        <Card className="mx-auto max-w-lg">
          <div className="flex items-center gap-2 text-rose-600">
            <IconAlert className="h-5 w-5" />
            {error}
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => setShowReocr(true)}>
              <IconRefresh className="h-4 w-4" />
              OCR lại
            </Button>
            <Button variant="secondary" onClick={() => nav("/capture")}>
              Chụp ảnh khác
            </Button>
          </div>
        </Card>
        {reocrModal}
      </>
    );

  if (!job) return <Spinner label="Đang tải…" />;
  if (job.status !== "done")
    return (
      <StageTracker
        status={job.status}
        stage={job.stage}
        elapsed={elapsed}
        onCancel={cancelJob}
      />
    );

  const total = rows.reduce((s, r) => s + parseVnd(r.amount) * (r.kind === "expense" ? -1 : 1), 0);
  const lowCount = rows.filter((r) => Math.min(r.conf.date, r.conf.room, r.conf.amount) < LOW_CONF).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Duyệt lại từng dòng trước khi lưu.</p>
        <Button variant="secondary" size="sm" onClick={() => setShowReocr(true)}>
          <IconRefresh className="h-4 w-4" />
          OCR lại
        </Button>
      </div>

      {lowCount > 0 && (
        <Card className="flex items-center gap-2 border-amber-200 bg-amber-50/60 !py-3 text-sm text-amber-700">
          <IconAlert className="h-4 w-4 shrink-0" />
          Có ô độ tin cậy thấp được tô vàng — hãy kiểm tra kỹ trước khi lưu.
        </Card>
      )}

      {reocrModal}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card pad={false} className="overflow-hidden lg:sticky lg:top-20 lg:self-start">
          {imgUrl ? (
            <button
              type="button"
              onClick={() => setZoom(true)}
              title="Bấm để phóng to"
              className="relative block w-full cursor-zoom-in"
            >
              <img src={imgUrl} alt="Ảnh sổ gốc" className="max-h-[72vh] w-full object-contain" />
              <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-slate-900/60 px-2 py-1 text-xs font-medium text-white">
                Bấm để phóng to
              </span>
            </button>
          ) : (
            <Spinner />
          )}
        </Card>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <Card key={i} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">DÒNG {i + 1}</span>
                <button
                  onClick={() => removeRow(i)}
                  className="cursor-pointer rounded-md p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  title="Xóa dòng"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Ngày" low={r.conf.date < LOW_CONF}>
                  <input type="date" value={r.txn_date} onChange={(e) => update(i, { txn_date: e.target.value })} className="field" />
                </Field>
                <Field label="Loại">
                  <select value={r.kind} onChange={(e) => update(i, { kind: e.target.value as Kind })} className="field cursor-pointer">
                    <option value="income">Thu</option>
                    <option value="expense">Chi</option>
                  </select>
                </Field>
                <Field label="Phòng / khách" low={r.conf.room < LOW_CONF}>
                  <input value={r.room} onChange={(e) => update(i, { room: e.target.value })} className="field" />
                </Field>
                <Field label="Số tiền" low={r.conf.amount < LOW_CONF}>
                  <input inputMode="numeric" value={r.amount} onChange={(e) => update(i, { amount: fmtVndInput(e.target.value) })} className="field num" />
                </Field>
                <Field label="Nội dung" full>
                  <input value={r.note} onChange={(e) => update(i, { note: e.target.value })} className="field" />
                </Field>
              </div>
            </Card>
          ))}

          <Button variant="secondary" onClick={addRow} className="w-full">
            <IconPlus className="h-4 w-4" />
            Thêm dòng
          </Button>
        </div>
      </div>

      {/* Thanh lưu cố định */}
      <div className="sticky bottom-20 z-10 md:bottom-4">
        <Card className="flex items-center justify-between !py-3 shadow-pop">
          <div>
            <div className="text-xs text-slate-400">Chênh lệch · {rows.length} dòng</div>
            <div className={`text-lg font-bold tabular-nums ${total < 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {fmtVnd(total)}
            </div>
          </div>
          <Button onClick={saveAll} disabled={saving || rows.length === 0}>
            <IconCheck className="h-4 w-4" />
            {saving ? "Đang lưu…" : "Lưu tất cả"}
          </Button>
        </Card>
      </div>

      {zoom && imgUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 p-2"
          onClick={() => setZoom(false)}
        >
          <img src={imgUrl} alt="Ảnh sổ gốc" className="max-h-full max-w-full object-contain" />
          <button
            onClick={() => setZoom(false)}
            aria-label="Đóng"
            className="absolute right-3 top-3 cursor-pointer rounded-full bg-white/10 p-2 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  low,
  full,
}: {
  label: string;
  children: React.ReactNode;
  low?: boolean;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
        {label}
        {low && (
          <span className="inline-flex items-center gap-0.5 text-amber-600">
            <IconAlert className="h-3 w-3" /> kiểm tra
          </span>
        )}
      </span>
      <div className={low ? "rounded-lg ring-2 ring-amber-300" : ""}>{children}</div>
    </label>
  );
}

function fmtElapsed(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

const STAGE_STEPS: { key: "queued" | JobStage; label: string; hint?: string }[] = [
  { key: "queued", label: "Trong hàng đợi" },
  { key: "preparing", label: "Chuẩn bị ảnh" },
  { key: "recognizing", label: "Nhận dạng bằng AI", hint: "Bước này có thể mất 1–2 phút" },
  { key: "parsing", label: "Tách dữ liệu" },
];

function StageTracker({
  status,
  stage,
  elapsed,
  onCancel,
}: {
  status: Job["status"];
  stage?: JobStage | null;
  elapsed: number;
  onCancel: () => void;
}) {
  let current =
    status === "queued" ? 0 : stage ? STAGE_STEPS.findIndex((s) => s.key === stage) : 1;
  if (current < 0) current = 1;

  return (
    <Card className="mx-auto max-w-md">
      <div className="mb-5 text-center">
        <h2 className="text-base font-bold text-slate-900">Đang xử lý ảnh sổ</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Bạn sẽ duyệt lại từng dòng sau khi nhận dạng xong.
        </p>
      </div>
      <ol>
        {STAGE_STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.key} className="flex items-start gap-3">
              <div className="flex flex-col items-center self-stretch">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    done
                      ? "bg-emerald-100 text-emerald-600"
                      : active
                        ? "bg-brand-600 text-white"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {done ? (
                    <IconCheck className="h-4 w-4" />
                  ) : active ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    i + 1
                  )}
                </span>
                {i < STAGE_STEPS.length - 1 && (
                  <span className={`my-1 w-0.5 flex-1 ${done ? "bg-emerald-200" : "bg-slate-200"}`} />
                )}
              </div>
              <div className="pb-4 pt-1">
                <div
                  className={`text-sm font-semibold ${
                    active ? "text-slate-900" : done ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  {step.label}
                  {active && step.key === "recognizing" && (
                    <span className="ml-2 font-mono text-xs font-normal tabular-nums text-brand-600">
                      {fmtElapsed(elapsed)}
                    </span>
                  )}
                </div>
                {active && step.hint && <div className="text-xs text-slate-400">{step.hint}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 border-t border-slate-100 pt-3 text-center">
        <button
          onClick={onCancel}
          className="cursor-pointer text-sm font-semibold text-slate-500 transition-colors hover:text-rose-600"
        >
          Ngưng
        </button>
      </div>
    </Card>
  );
}
