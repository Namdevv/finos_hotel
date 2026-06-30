import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Button, Card, Input, Modal } from "../components/ui";
import {
  IconActivity,
  IconChevronRight,
  IconDashboard,
  IconHistory,
  IconKey,
  IconLock,
  IconLogout,
  IconPencil,
  IconShield,
  IconUsers,
} from "../components/icons";
import { ROLE_LABEL, type User } from "../types";

/** Một dòng menu điều hướng (dùng cho mobile để gom Thư viện / Phân quyền vào đây). */
function MenuRow({
  icon,
  label,
  desc,
  onClick,
  danger = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
        disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:bg-slate-50"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          danger ? "bg-rose-50 text-rose-600" : "bg-brand-50 text-brand-600"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${danger ? "text-rose-600" : "text-slate-800"}`}>{label}</div>
        {desc && <div className="truncate text-xs text-slate-400">{desc}</div>}
      </div>
      {disabled ? <IconLock className="h-4 w-4 shrink-0 text-slate-300" /> : !danger && <IconChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
    </button>
  );
}

export default function Profile() {
  const { user, logout, hasRole, setUser } = useAuth();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);

  if (!user) return null;
  const initials = (user.full_name || user.username).trim().charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* Thẻ thông tin tài khoản */}
      <Card className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold text-slate-900">{user.full_name || user.username}</div>
          <div className="text-sm text-slate-400">@{user.username}</div>
          <div className="mt-1.5">
            <Badge color="blue">
              <IconShield className="h-3 w-3" />
              {ROLE_LABEL[user.role]}
            </Badge>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <IconPencil className="h-4 w-4" />
          Sửa
        </Button>
      </Card>

      {/* Menu — gom các mục để truy cập từ mobile */}
      <Card pad={false} className="divide-y divide-slate-100 overflow-hidden">
        <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Tiện ích
        </div>
        {hasRole("admin", "accountant") && (
          <MenuRow
            icon={<IconDashboard className="h-[18px] w-[18px]" />}
            label="Báo cáo & thống kê"
            desc="Tổng quan thu chi, biểu đồ"
            onClick={() => nav("/")}
          />
        )}
        <MenuRow
          icon={<IconHistory className="h-[18px] w-[18px]" />}
          label="Thư viện ảnh"
          desc="Các ảnh sổ đã tải lên & OCR lại"
          onClick={() => nav("/uploads")}
        />
        {hasRole("admin", "accountant") && (
          <MenuRow
            icon={<IconUsers className="h-[18px] w-[18px]" />}
            label="Quản lý người dùng & phân quyền"
            desc="Thêm, khóa, đổi vai trò tài khoản"
            onClick={() => nav("/users")}
            disabled={!hasRole("admin")}
          />
        )}
        {hasRole("admin") && (
          <MenuRow
            icon={<IconActivity className="h-[18px] w-[18px]" />}
            label="Nhật ký hoạt động"
            desc="Theo dõi thao tác của nhân viên, kế toán"
            onClick={() => nav("/activities")}
          />
        )}
        <MenuRow
          icon={<IconKey className="h-[18px] w-[18px]" />}
          label="Đổi mật khẩu"
          desc="Cập nhật mật khẩu đăng nhập"
          onClick={() => setEditing(true)}
        />
      </Card>

      {/* Đăng xuất */}
      <Card pad={false} className="overflow-hidden">
        <MenuRow
          icon={<IconLogout className="h-[18px] w-[18px]" />}
          label="Đăng xuất"
          danger
          onClick={logout}
        />
      </Card>

      <p className="px-1 text-center text-xs text-slate-400">FinOS Hotel · Kế toán khách sạn</p>

      <Modal open={editing} onClose={() => setEditing(false)} title="Sửa hồ sơ">
        <ProfileForm
          onSaved={(u) => {
            setUser(u);
            setEditing(false);
          }}
        />
      </Modal>
    </div>
  );
}

/** Form sửa họ tên + đổi mật khẩu của chính mình. */
function ProfileForm({ onSaved }: { onSaved: (u: User) => void }) {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    const wantPw = newPw || confirmPw || currentPw;
    if (wantPw) {
      if (newPw.length < 6) {
        setError("Mật khẩu mới phải từ 6 ký tự");
        return;
      }
      if (newPw !== confirmPw) {
        setError("Xác nhận mật khẩu không khớp");
        return;
      }
      if (!currentPw) {
        setError("Nhập mật khẩu hiện tại để đổi mật khẩu");
        return;
      }
    }
    setBusy(true);
    try {
      const body: { full_name?: string; current_password?: string; new_password?: string } = {
        full_name: fullName,
      };
      if (wantPw) {
        body.current_password = currentPw;
        body.new_password = newPw;
      }
      const updated = await api.updateProfile(body);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setOk("Đã cập nhật hồ sơ");
      onSaved(updated);
    } catch (err) {
      setError((err as Error).message || "Cập nhật thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Họ tên" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Họ và tên" />

      <div className="border-t border-slate-100 pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Đổi mật khẩu (tùy chọn)</p>
        <div className="space-y-3">
          <Input
            label="Mật khẩu hiện tại"
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            autoComplete="current-password"
          />
          <Input
            label="Mật khẩu mới"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
          />
          <Input
            label="Xác nhận mật khẩu mới"
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-200">{error}</div>
      )}
      {ok && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">{ok}</div>
      )}

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Đang lưu…" : "Lưu thay đổi"}
      </Button>
    </form>
  );
}
