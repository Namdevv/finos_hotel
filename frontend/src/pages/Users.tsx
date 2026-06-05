import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Button, Card, Input, Spinner } from "../components/ui";
import { ROLE_LABEL, type Role, type User } from "../types";

const ROLES: Role[] = ["admin", "accountant", "receptionist"];

export default function Users() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [form, setForm] = useState({ username: "", full_name: "", password: "", role: "receptionist" as Role });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setUsers(await api.listUsers());
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.createUser(form);
      setForm({ username: "", full_name: "", password: "", role: "receptionist" });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: User) {
    await api.updateUser(u.id, { is_active: !u.is_active });
    load();
  }
  async function del(u: User) {
    if (!confirm(`Xóa người dùng ${u.username}?`)) return;
    try {
      await api.deleteUser(u.id);
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Người dùng</h1>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-600">Thêm người dùng</div>
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <Input label="Tên đăng nhập" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <Input label="Họ tên" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input label="Mật khẩu" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">Vai trò</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="field">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          {error && <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Đang tạo…" : "Tạo người dùng"}
            </Button>
          </div>
        </form>
      </Card>

      {users === null ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700">{u.full_name || u.username}</span>
                  <Badge color="blue">{ROLE_LABEL[u.role]}</Badge>
                  {!u.is_active && <Badge color="red">Khóa</Badge>}
                </div>
                <div className="text-xs text-slate-400">@{u.username}</div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => toggleActive(u)} className="text-slate-500 hover:underline">
                  {u.is_active ? "Khóa" : "Mở khóa"}
                </button>
                <button onClick={() => del(u)} className="text-red-500 hover:underline">
                  Xóa
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
