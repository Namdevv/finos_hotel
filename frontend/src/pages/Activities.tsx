import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Badge, Button, Card, PageHeader, Spinner } from "../components/ui";
import { ROLE_LABEL, type Activity } from "../types";

export const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Đăng nhập",
  "profile.update": "Sửa hồ sơ",
  "user.create": "Tạo người dùng",
  "user.update": "Sửa người dùng",
  "user.delete": "Xóa người dùng",
  "transaction.create": "Tạo chứng từ",
  "transaction.update": "Sửa chứng từ",
  "transaction.soft_delete": "Xóa mềm chứng từ",
  "transaction.soft_delete_bulk": "Xóa mềm nhiều chứng từ",
  "transaction.hard_delete": "Xóa chứng từ",
  "transaction.hard_delete_bulk": "Xóa nhiều chứng từ",
  "ocr.upload": "Tải ảnh OCR",
  "ocr.cancel": "Ngừng OCR",
  "ocr.reocr": "OCR lại",
  "ocr.delete": "Xóa ảnh OCR",
};

export function actionLabel(action: string) {
  return ACTION_LABEL[action] ?? action;
}

export function fmtTime(value: string) {
  return value?.slice(0, 16).replace("T", " ");
}

export function detailText(detail: string) {
  if (!detail) return "";
  try {
    const parsed = JSON.parse(detail);
    return Object.entries(parsed)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
      .join(" | ");
  } catch {
    return detail;
  }
}

const PAGE_SIZE = 10;

export default function Activities() {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [action, setAction] = useState("");
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState("");

  async function load(nextAction = action, nextPage = page) {
    setItems(null);
    setError("");
    try {
      const params: Record<string, string> = {
        // Lấy dư 1 bản ghi để biết còn trang sau hay không.
        limit: String(PAGE_SIZE + 1),
        offset: String(nextPage * PAGE_SIZE),
      };
      if (nextAction) params.action = nextAction;
      const rows = await api.listActivities(params);
      setHasNext(rows.length > PAGE_SIZE);
      setItems(rows.slice(0, PAGE_SIZE));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load("", 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goto(nextPage: number) {
    setPage(nextPage);
    load(action, nextPage);
  }

  const actions = useMemo(() => {
    const keys = new Set(Object.keys(ACTION_LABEL));
    items?.forEach((item) => keys.add(item.action));
    return [...keys].sort();
  }, [items]);

  return (
    <div>
      <PageHeader
        title="Hoạt động"
        subtitle="Theo dõi các thao tác chính của nhân viên, kế toán và quản trị viên."
        actions={
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(0);
              load(e.target.value, 0);
            }}
            className="field w-auto cursor-pointer"
          >
            <option value="">Tất cả thao tác</option>
            {actions.map((key) => (
              <option key={key} value={key}>
                {actionLabel(key)}
              </option>
            ))}
          </select>
        }
      />

      {error ? (
        <Card className="text-sm text-rose-600">{error}</Card>
      ) : items === null ? (
        <Spinner label="Đang tải..." />
      ) : items.length === 0 ? (
        <Card className="py-12 text-center text-sm text-slate-500">Chưa có hoạt động nào.</Card>
      ) : (
        <>
          {/* Bảng (desktop) */}
          <Card pad={false} className="hidden overflow-x-auto md:block">
            <table className="acc-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người thao tác</th>
                  <th>Vai trò</th>
                  <th>Thao tác</th>
                  <th>Đối tượng</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap text-slate-500">{fmtTime(item.created_at)}</td>
                    <td>
                      <div className="font-medium text-slate-800">{item.full_name || item.username || "Hệ thống"}</div>
                      {item.username && <div className="text-xs text-slate-400">@{item.username}</div>}
                    </td>
                    <td>{item.role ? <Badge color="blue">{ROLE_LABEL[item.role]}</Badge> : <Badge>Không rõ</Badge>}</td>
                    <td className="font-medium text-slate-700">{actionLabel(item.action)}</td>
                    <td className="text-slate-500">
                      {item.target_type || "-"}
                      {item.target_id ? ` #${item.target_id}` : ""}
                    </td>
                    <td className="max-w-sm truncate text-slate-500">{detailText(item.detail) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Thẻ (mobile) */}
          <div className="space-y-2 md:hidden">
            {items.map((item) => (
              <Card key={item.id} className="space-y-1.5 !p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">{actionLabel(item.action)}</span>
                  <span className="shrink-0 text-xs text-slate-400">{fmtTime(item.created_at)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium text-slate-800">{item.full_name || item.username || "Hệ thống"}</span>
                  {item.role ? <Badge color="blue">{ROLE_LABEL[item.role]}</Badge> : <Badge>Không rõ</Badge>}
                </div>
                {(item.target_type || item.target_id) && (
                  <div className="text-xs text-slate-500">
                    {item.target_type || "-"}
                    {item.target_id ? ` #${item.target_id}` : ""}
                  </div>
                )}
                {detailText(item.detail) && (
                  <div className="break-words text-xs text-slate-500">{detailText(item.detail)}</div>
                )}
              </Card>
            ))}
          </div>

          {/* Phân trang — offset-based, 10 hoạt động/trang */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-slate-500">Trang {page + 1}</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => goto(page - 1)}>
                Trang trước
              </Button>
              <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => goto(page + 1)}>
                Trang sau
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
