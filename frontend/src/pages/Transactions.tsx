import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Button, Card, Modal, Spinner } from "../components/ui";
import { IconArrowDown, IconArrowUp, IconDots, IconFilter, IconPencil, IconPlus, IconTrash } from "../components/icons";
import TransactionForm from "../components/TransactionForm";
import { fmtVnd } from "../lib";
import type { Transaction } from "../types";

const PAGE_SIZE = 20;

function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        title="Tuỳ chọn"
      >
        <IconDots className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-pop">
          <button
            onClick={() => { setOpen(false); onEdit(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <IconPencil className="h-3.5 w-3.5" /> Sửa
          </button>
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
          >
            <IconTrash className="h-3.5 w-3.5" /> Xóa
          </button>
        </div>
      )}
    </div>
  );
}

export default function Transactions() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "accountant");
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const selectAllRef = useRef<HTMLInputElement>(null);

  async function load() {
    setItems(null);
    setSelected(new Set());
    setPage(1);
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

  const allIds = items?.map((t) => t.id) ?? [];
  const totalPages = items ? Math.max(1, Math.ceil(items.length / PAGE_SIZE)) : 1;
  const pageItems = items?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [];

  const allSelected = allIds.length > 0 && selected.size === allIds.length;
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function del(id: number) {
    if (!confirm("Xóa chứng từ này?")) return;
    await api.deleteTransaction(id);
    load();
  }

  async function bulkDelete() {
    if (!selected.size) return;
    if (!confirm(`Xóa ${selected.size} chứng từ đã chọn?`)) return;
    await api.bulkDeleteTransactions([...selected]);
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
        <TransactionForm onSaved={() => { setAdding(false); load(); }} />
      </Modal>

      {/* Modal sửa */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Sửa chứng từ">
        {editing && (
          <TransactionForm transaction={editing} onSaved={() => { setEditing(null); load(); }} />
        )}
      </Modal>

      {/* Thanh lọc */}
      <Card className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Từ ngày</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Đến ngày</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">Loại</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="field cursor-pointer">
            <option value="">Tất cả</option>
            <option value="income">Thu</option>
            <option value="expense">Chi</option>
          </select>
        </label>
        <Button onClick={load}>
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
          {/* Tổng nhanh + thanh bulk action */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1">
            {selected.size > 0 ? (
              <div className="flex items-center gap-3 rounded-lg bg-brand-50 px-4 py-2">
                <span className="text-sm font-medium text-brand-700">Đã chọn {selected.size}</span>
                {canEdit && (
                  <Button variant="danger" size="sm" onClick={bulkDelete}>
                    <IconTrash className="h-3.5 w-3.5" />
                    Xóa {selected.size} chứng từ
                  </Button>
                )}
                <button
                  onClick={() => setSelected(new Set())}
                  className="cursor-pointer text-sm text-slate-500 hover:text-slate-700"
                >
                  Bỏ chọn
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-slate-500">{items.length} chứng từ</span>
                <span className="text-emerald-600">Thu: <b className="tabular-nums">{fmtVnd(totalIncome)}</b></span>
                <span className="text-rose-600">Chi: <b className="tabular-nums">{fmtVnd(totalExpense)}</b></span>
              </div>
            )}
          </div>

          {/* Bảng (desktop) */}
          <Card pad={false} className="hidden overflow-hidden md:block">
            <table className="acc-table">
              <thead>
                <tr>
                  {canEdit && (
                    <th className="w-10 !pl-4">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="cursor-pointer"
                        title="Chọn tất cả"
                      />
                    </th>
                  )}
                  <th>Ngày</th>
                  <th>Loại</th>
                  <th>Phòng / khách</th>
                  <th>Nội dung</th>
                  <th className="num">Số tiền</th>
                  {canEdit && <th className="w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((t) => (
                  <tr key={t.id} className={selected.has(t.id) ? "bg-brand-50/60" : ""}>
                    {canEdit && (
                      <td className="!pl-4">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggleOne(t.id)}
                          className="cursor-pointer"
                        />
                      </td>
                    )}
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
                    {canEdit && (
                      <td className="num">
                        <RowMenu onEdit={() => setEditing(t)} onDelete={() => del(t.id)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Thẻ (mobile) */}
          <div className="space-y-2 md:hidden">
            {pageItems.map((t) => (
              <Card
                key={t.id}
                className={`flex items-center justify-between gap-3 !p-4 ${selected.has(t.id) ? "ring-2 ring-brand-400" : ""}`}
              >
                {canEdit && (
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggleOne(t.id)}
                    className="h-4 w-4 shrink-0 cursor-pointer"
                  />
                )}
                <div className="min-w-0 flex-1">
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
                  {canEdit && <RowMenu onEdit={() => setEditing(t)} onDelete={() => del(t.id)} />}
                </div>
              </Card>
            ))}
          </div>

          {/* Phân trang */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ‹ Trước
              </button>
              <span className="min-w-[90px] text-center text-sm text-slate-500">
                Trang {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page === totalPages}
                className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sau ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
