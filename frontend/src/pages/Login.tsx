import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Button, Input } from "../components/ui";
import { IconLock } from "../components/icons";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
      nav("/");
    } catch (err) {
      setError((err as Error).message || "Đăng nhập thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Bảng thương hiệu (desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-ink-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/logo_finos.png" alt="FinOS Hotel" className="h-10 w-10 rounded-xl object-cover" />
          <span className="text-lg font-bold">FinOS Hotel</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold leading-snug">
            Số hóa sổ sách khách sạn,
            <br />
            quản lý thu chi trong tầm tay.
          </h2>
          {/* <ul className="mt-8 space-y-3 text-slate-300">
            {[
              "Chụp sổ viết tay — OCR tự điền liệu",
              "Duyệt & sửa trước khi lưu, chính xác từng đồng",
              "Báo cáo thu / chi trực quan, phân quyền rõ ràng",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm">{t}</span>
              </li>
            ))}
          </ul> */}
        </div>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} FinOS Hotel</p>
      </div>

      {/* Form đăng nhập */}
      <div className="flex w-full items-center justify-center bg-slate-100 p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <img
              src="/logo_finos.png"
              alt="FinOS Hotel"
              className="mx-auto mb-3 h-12 w-12 rounded-xl object-cover"
            />
            <div className="text-xl font-bold text-slate-900">FinOS Hotel</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-card">
            <h1 className="text-xl font-bold text-slate-900">Đăng nhập</h1>
            <p className="mb-6 mt-1 text-sm text-slate-500">Nhập tài khoản để vào hệ thống</p>

            <form onSubmit={submit} className="space-y-4">
              <Input
                label="Tên đăng nhập"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                required
              />
              <Input
                label="Mật khẩu"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              {error && (
                <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-200">
                  {error}
                </div>
              )}
              <Button type="submit" disabled={busy} className="w-full">
                <IconLock className="h-4 w-4" />
                {busy ? "Đang đăng nhập…" : "Đăng nhập"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
