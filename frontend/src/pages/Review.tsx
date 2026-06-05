import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getToken } from "../api";
import { Badge, Button, Card, Spinner } from "../components/ui";
import { LOW_CONF, fmtVnd, parseVnd } from "../lib";
import type { Job, Kind, OcrRow } from "../types";

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
    amount: r.amount.value,
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
  const polling = useRef<number | null>(null);

  // Poll job đến khi xong.
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
  }, [jobId]);

  // Ảnh gốc cần token -> tải blob rồi tạo objectURL.
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

  if (error)
    return (
      <Card className="mx-auto max-w-lg">
        <div className="text-red-600">{error}</div>
        <Button variant="secondary" className="mt-4" onClick={() => nav("/capture")}>
          Thử lại
        </Button>
      </Card>
    );

  if (!job || job.status !== "done")
    return <Spinner label={job?.status === "processing" ? "Đang nhận dạng…" : "Đang chờ xử lý…"} />;

  const total = rows.reduce((s, r) => s + parseVnd(r.amount) * (r.kind === "expense" ? -1 : 1), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Duyệt & sửa</h1>
        <Badge color="amber">Hãy kiểm tra ô được tô vàng</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:sticky lg:top-4 lg:self-start">
          {imgUrl ? (
            <img src={imgUrl} alt="sổ" className="max-h-[70vh] w-full rounded-xl object-contain" />
          ) : (
            <Spinner />
          )}
        </Card>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <Card key={i} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Dòng {i + 1}</span>
                <button onClick={() => removeRow(i)} className="text-xs text-red-500 hover:underline">
                  Xóa
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Ngày" low={r.conf.date < LOW_CONF}>
                  <input type="date" value={r.txn_date} onChange={(e) => update(i, { txn_date: e.target.value })} className="field" />
                </Field>
                <Field label="Loại">
                  <select value={r.kind} onChange={(e) => update(i, { kind: e.target.value as Kind })} className="field">
                    <option value="income">Thu</option>
                    <option value="expense">Chi</option>
                  </select>
                </Field>
                <Field label="Phòng/khách" low={r.conf.room < LOW_CONF}>
                  <input value={r.room} onChange={(e) => update(i, { room: e.target.value })} className="field" />
                </Field>
                <Field label="Số tiền" low={r.conf.amount < LOW_CONF}>
                  <input
                    inputMode="numeric"
                    value={r.amount}
                    onChange={(e) => update(i, { amount: e.target.value })}
                    className="field"
                  />
                </Field>
                <Field label="Nội dung" full>
                  <input value={r.note} onChange={(e) => update(i, { note: e.target.value })} className="field" />
                </Field>
              </div>
            </Card>
          ))}

          <Button variant="secondary" onClick={addRow} className="w-full">
            + Thêm dòng
          </Button>
        </div>
      </div>

      <Card className="sticky bottom-20 flex items-center justify-between md:bottom-4">
        <div>
          <div className="text-xs text-slate-400">Chênh lệch ({rows.length} dòng)</div>
          <div className={`text-lg font-bold ${total < 0 ? "text-red-600" : "text-emerald-600"}`}>
            {fmtVnd(total)}
          </div>
        </div>
        <Button onClick={saveAll} disabled={saving || rows.length === 0}>
          {saving ? "Đang lưu…" : "Lưu tất cả"}
        </Button>
      </Card>
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
        {low && <span className="text-amber-500">⚠ kiểm tra</span>}
      </span>
      <div className={low ? "rounded-xl ring-2 ring-amber-300" : ""}>{children}</div>
    </label>
  );
}
