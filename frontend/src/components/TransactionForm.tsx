import { useState } from "react";
import { api } from "../api";
import { Button, Input } from "./ui";
import { IconArrowDown, IconArrowUp } from "./icons";
import { fmtVnd, fmtVndInput, parseVnd } from "../lib";
import type { Kind, Transaction } from "../types";

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Form chứng từ. Không truyền `transaction` → thêm mới (source = manual).
 * Có `transaction` → sửa chứng từ hiện có. Gọi onSaved sau khi lưu.
 */
export default function TransactionForm({
  onSaved,
  transaction,
}: {
  onSaved: () => void;
  transaction?: Transaction;
}) {
  const editing = !!transaction;
  const [txn_date, setDate] = useState(transaction?.txn_date || todayIso());
  const [kind, setKind] = useState<Kind>(transaction?.kind || "income");
  const [room, setRoom] = useState(transaction?.room || "");
  const [note, setNote] = useState(transaction?.note || "");
  const [amount, setAmount] = useState(transaction ? fmtVndInput(String(transaction.amount)) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const amountNum = parseVnd(amount);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (amountNum <= 0) {
      setError("Số tiền phải lớn hơn 0");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await api.updateTransaction(transaction!.id, {
          txn_date: txn_date || todayIso(),
          room,
          note,
          kind,
          amount: amountNum,
        });
      } else {
        await api.createTransaction({
          txn_date: txn_date || todayIso(),
          room,
          note,
          kind,
          amount: amountNum,
          source: "manual",
        });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message || "Lưu thất bại");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Chọn loại bằng nút bấm cho rõ ràng */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setKind("income")}
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
            kind === "income"
              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
              : "border-slate-300 text-slate-500 hover:bg-slate-50"
          }`}
        >
          <IconArrowUp className="h-4 w-4" /> Thu
        </button>
        <button
          type="button"
          onClick={() => setKind("expense")}
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
            kind === "expense"
              ? "border-rose-500 bg-rose-50 text-rose-700"
              : "border-slate-300 text-slate-500 hover:bg-slate-50"
          }`}
        >
          <IconArrowDown className="h-4 w-4" /> Chi
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Ngày" type="date" value={txn_date} onChange={(e) => setDate(e.target.value)} required />
        <Input label="Phòng / khách" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="VD: P101" />
      </div>

      <Input label="Nội dung" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Tiền phòng 2 đêm" />

      <Input
        label="Số tiền (VND)"
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(fmtVndInput(e.target.value))}
        placeholder="0"
        className="num text-base font-semibold"
        hint={amountNum > 0 ? `= ${fmtVnd(amountNum)}` : "Nhập số tiền"}
        required
      />

      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-200">{error}</div>
      )}

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Đang lưu…" : editing ? "Cập nhật chứng từ" : "Lưu chứng từ"}
      </Button>
    </form>
  );
}
