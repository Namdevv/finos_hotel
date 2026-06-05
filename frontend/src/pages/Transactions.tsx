import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Button, Card, Spinner } from "../components/ui";
import { fmtVnd } from "../lib";
import type { Transaction } from "../types";

export default function Transactions() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "accountant");
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load() {
    setItems(null);
    const params: Record<string, string> = {};
    if (kind) params.kind = kind;
    if (from) params.date_from = from;
    if (to) params.date_to = to;
    setItems(await api.listTransactions(params));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function del(id: number) {
    if (!confirm("Xóa chứng từ này?")) return;
    await api.deleteTransaction(id);
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Chứng từ</h1>

      <Card className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Từ ngày</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Đến ngày</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Loại</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="field">
            <option value="">Tất cả</option>
            <option value="income">Thu</option>
            <option value="expense">Chi</option>
          </select>
        </label>
        <Button onClick={load}>Lọc</Button>
      </Card>

      {items === null ? (
        <Spinner label="Đang tải…" />
      ) : items.length === 0 ? (
        <Card className="text-center text-slate-400">Chưa có chứng từ nào.</Card>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <Card key={t.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge color={t.kind === "income" ? "green" : "red"}>
                    {t.kind === "income" ? "Thu" : "Chi"}
                  </Badge>
                  <span className="text-xs text-slate-400">{t.txn_date}</span>
                  {t.source === "ocr" && <Badge color="blue">OCR</Badge>}
                </div>
                <div className="mt-1 truncate text-sm text-slate-700">
                  {t.room && <span className="font-medium">{t.room} · </span>}
                  {t.note || "—"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-bold ${t.kind === "income" ? "text-emerald-600" : "text-red-600"}`}>
                  {fmtVnd(t.amount)}
                </span>
                {canEdit && (
                  <button onClick={() => del(t.id)} className="text-xs text-red-500 hover:underline">
                    Xóa
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
