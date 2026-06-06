import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Button, Card, Modal, Spinner } from "../components/ui";
import { IconArrowDown, IconArrowUp, IconFilter, IconPencil, IconPlus, IconTrash } from "../components/icons";
import TransactionForm from "../components/TransactionForm";
import { fmtVnd } from "../lib";
import type { Transaction } from "../types";

export default function Transactions() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "accountant");
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

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

  const totalIncome = items?.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0) ?? 0;
  const totalExpense = items?.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Hành động */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Danh sách thu / chi đã lưu</p>
        <Button onClick={() => setAdding(true)}>
          <IconPlus className="h-4 w-4" />
          Thêm chứng từ
        </Button>
      </div>

      {/* Modal nhập tay */}
      <Modal open={adding} onClose={() => setAdding(false)} title="Thêm chứng từ thủ công">
        <TransactionForm
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      </Modal>

      {/* Modal sửa */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Sửa chứng từ">
        {editing && (
          <TransactionForm
            transaction={editing}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Modal>

      {/* Thanh lọc */}
      <Card className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Từ ngày</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Đến ngày</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field" />
        </label>
        <label className="col-span-2 text-sm sm:col-span-1">
          <span className="mb-1 block text-xs font-medium text-slate-500">Loại</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="field cursor-pointer">
            <option value="">Tất cả</option>
            <option value="income">Thu</option>
            <option value="expense">Chi</option>
          </select>
        </label>
        <Button onClick={load} className="col-span-2 sm:col-span-1">
          <IconFilter className="h-4 w-4" />
          Lọc
        </Button>
      </Card>

      {items === null ? (
        <Spinner label="Đang tải…" />
      ) : items.length === 0 ? (
        <Card className="py-10 text-center text-slate-400">Chưa có chứng từ nào.</Card>
      ) : (
        <>
          {/* Tổng nhanh */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-sm">
            <span className="text-slate-500">
              {items.length} chứng từ
            </span>
            <span className="text-emerald-600">Thu: <b className="tabular-nums">{fmtVnd(totalIncome)}</b></span>
            <span className="text-rose-600">Chi: <b className="tabular-nums">{fmtVnd(totalExpense)}</b></span>
          </div>

          {/* Bảng (desktop) */}
          <Card pad={false} className="hidden overflow-hidden md:block">
            <div className="max-h-[65vh] overflow-auto">
              <table className="acc-table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Loại</th>
                    <th>Phòng / khách</th>
                    <th>Nội dung</th>
                    <th className="num">Số tiền</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap text-slate-500">{t.txn_date}</td>
                      <td>
                        <Badge color={t.kind === "income" ? "green" : "red"}>
                          {t.kind === "income" ? <IconArrowUp className="h-3 w-3" /> : <IconArrowDown className="h-3 w-3" />}
                          {t.kind === "income" ? "Thu" : "Chi"}
                        </Badge>
                      </td>
                      <td className="font-medium text-slate-700">{t.room || "—"}</td>
                      <td className="max-w-xs truncate">
                        {t.note || "—"}
                        {t.source === "ocr" && <span className="ml-2 align-middle"><Badge color="blue">OCR</Badge></span>}
                      </td>
                      <td className={`num font-semibold ${t.kind === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                        {t.kind === "expense" ? "−" : ""}
                        {fmtVnd(t.amount)}
                      </td>
                      <td className="num">
                        {canEdit && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditing(t)}
                              title="Sửa"
                              className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                            >
                              <IconPencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => del(t.id)}
                              title="Xóa"
                              className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Thẻ (mobile) */}
          <div className="space-y-2 md:hidden">
            {items.map((t) => (
              <Card key={t.id} className="flex items-center justify-between gap-3 !p-4">
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
                <div className="flex items-center gap-2">
                  <span className={`font-bold tabular-nums ${t.kind === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmtVnd(t.amount)}
                  </span>
                  {canEdit && (
                    <>
                      <button onClick={() => setEditing(t)} title="Sửa" className="cursor-pointer p-1 text-slate-400 hover:text-brand-600">
                        <IconPencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => del(t.id)} title="Xóa" className="cursor-pointer p-1 text-slate-400 hover:text-rose-600">
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
