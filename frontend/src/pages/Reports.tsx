import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Badge, Button, Card, Modal, PageHeader, Spinner } from "../components/ui";
import { IconDownload, IconPlus, IconTrash } from "../components/icons";
import { useAuth } from "../auth";
import { fmtDateTime, fmtVnd, previousMonthRangeIso } from "../lib";
import type { Report } from "../types";

/** 'YYYY-MM' -> 'Tháng MM/YYYY'. */
function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  return `Tháng ${m}/${y}`;
}

export default function Reports() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [items, setItems] = useState<Report[] | null>(null);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [period, setPeriod] = useState(previousMonthRangeIso().start.slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  async function load() {
    setItems(null);
    setError("");
    try {
      setItems(await api.listReports());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    if (!period) return;
    setBusy(true);
    setError("");
    try {
      await api.generateReport(period);
      setModalOpen(false);
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function download(r: Report) {
    setDownloading(r.id);
    try {
      await api.downloadReport(r.id, r.period);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  async function remove(r: Report) {
    if (!confirm(`Xóa ${periodLabel(r.period).toLowerCase()}?`)) return;
    try {
      await api.deleteReport(r.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Báo cáo tháng"
        subtitle="Bản Excel chốt cuối tháng được hệ thống tự tạo. Bạn cũng có thể tạo lại bất cứ lúc nào."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <IconPlus className="h-4 w-4" />
            Tạo báo cáo
          </Button>
        }
      />

      {error && <Card className="mb-4 text-sm text-rose-600">{error}</Card>}

      {items === null ? (
        <Spinner label="Đang tải..." />
      ) : items.length === 0 ? (
        <Card className="py-12 text-center text-sm text-slate-500">
          Chưa có báo cáo nào. Bấm <span className="font-semibold">Tạo báo cáo</span> để xuất ngay tháng đầu tiên.
        </Card>
      ) : (
        <>
          {/* Bảng (desktop) */}
          <Card pad={false} className="hidden overflow-x-auto md:block">
            <table className="acc-table">
              <thead>
                <tr>
                  <th>Kỳ báo cáo</th>
                  <th className="text-right">Tổng thu</th>
                  <th className="text-right">Tổng chi</th>
                  <th className="text-right">Tồn quỹ</th>
                  <th className="text-right">Chứng từ</th>
                  <th>Nguồn</th>
                  <th>Cập nhật</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold text-slate-800">{periodLabel(r.period)}</td>
                    <td className="text-right font-medium tabular-nums text-emerald-600">{fmtVnd(r.total_income)}</td>
                    <td className="text-right font-medium tabular-nums text-rose-600">{fmtVnd(r.total_expense)}</td>
                    <td className="text-right font-semibold tabular-nums text-slate-900">{fmtVnd(r.balance)}</td>
                    <td className="text-right tabular-nums text-slate-500">{r.txn_count}</td>
                    <td>
                      {r.auto ? (
                        <Badge>Tự động</Badge>
                      ) : (
                        <Badge color="blue">{r.generated_by_name || "Người tạo"}</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-slate-500">{fmtDateTime(r.updated_at)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={downloading === r.id}
                          onClick={() => download(r)}
                        >
                          <IconDownload className="h-4 w-4" />
                          {downloading === r.id ? "Đang tải..." : "Tải về"}
                        </Button>
                        {isAdmin && (
                          <button
                            onClick={() => remove(r)}
                            title="Xóa báo cáo"
                            className="cursor-pointer rounded-md p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                          >
                            <IconTrash className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Thẻ (mobile) */}
          <div className="space-y-2 md:hidden">
            {items.map((r) => (
              <Card key={r.id} className="space-y-2 !p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{periodLabel(r.period)}</span>
                  {r.auto ? <Badge>Tự động</Badge> : <Badge color="blue">{r.generated_by_name || "Người tạo"}</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-y-1 text-sm">
                  <span className="text-slate-500">Tổng thu</span>
                  <span className="text-right font-medium tabular-nums text-emerald-600">{fmtVnd(r.total_income)}</span>
                  <span className="text-slate-500">Tổng chi</span>
                  <span className="text-right font-medium tabular-nums text-rose-600">{fmtVnd(r.total_expense)}</span>
                  <span className="text-slate-500">Tồn quỹ</span>
                  <span className="text-right font-semibold tabular-nums text-slate-900">{fmtVnd(r.balance)}</span>
                  <span className="text-slate-500">Chứng từ</span>
                  <span className="text-right tabular-nums text-slate-700">{r.txn_count}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={downloading === r.id}
                    onClick={() => download(r)}
                  >
                    <IconDownload className="h-4 w-4" />
                    {downloading === r.id ? "Đang tải..." : "Tải về"}
                  </Button>
                  {isAdmin && (
                    <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                      <IconTrash className="h-4 w-4 text-rose-500" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tạo báo cáo tháng">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Chọn tháng</span>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="field"
            />
          </label>
          <p className="text-xs text-slate-500">
            Báo cáo tổng hợp toàn bộ chứng từ đã duyệt trong tháng. Nếu tháng này đã có báo cáo, bản cũ sẽ được cập nhật.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>
              Hủy
            </Button>
            <Button onClick={generate} disabled={busy || !period}>
              {busy ? "Đang tạo..." : "Tạo & xuất Excel"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
