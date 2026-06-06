import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Button, Card, Input, Spinner } from "../components/ui";
import { IconPlus, IconTrash } from "../components/icons";
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

  const initials = (u: User) => (u.full_name || u.username).trim().charAt(0).toUpperCase();

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* Form thêm */}
      <Card className="h-fit">
        <h2 className="mb-4 text-sm font-bold text-slate-800">Thêm người dùng</h2>
        <form onSubmit={create} className="space-y-3">
          <Input label="Tên đăng nhập" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <Input label="Họ tên" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input label="Mật khẩu" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Vai trò</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="field cursor-pointer">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-200">{error}</div>}
          <Button type="submit" disabled={busy} className="w-full">
            <IconPlus className="h-4 w-4" />
            {busy ? "Đang tạo…" : "Tạo người dùng"}
          </Button>
        </form>
      </Card>

      {/* Danh sách */}
      {users === null ? (
        <Spinner />
      ) : (
        <>
          {/* Bảng (desktop) */}
          <Card pad={false} className="hidden overflow-x-auto md:block">
            <table className="acc-table">
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                          {initials(u)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{u.full_name || u.username}</div>
                          <div className="text-xs text-slate-400">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td><Badge color="blue">{ROLE_LABEL[u.role]}</Badge></td>
                    <td>{u.is_active ? <Badge color="green">Hoạt động</Badge> : <Badge color="red">Đã khóa</Badge>}</td>
                    <td className="num">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => toggleActive(u)} className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
                          {u.is_active ? "Khóa" : "Mở khóa"}
                        </button>
                        <button onClick={() => del(u)} title="Xóa" className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Thẻ (mobile) */}
          <div className="space-y-2 md:hidden">
            {users.map((u) => (
              <Card key={u.id} className="flex items-center gap-3 !p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {initials(u)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{u.full_name || u.username}</div>
                  <div className="truncate text-xs text-slate-400">@{u.username}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge color="blue">{ROLE_LABEL[u.role]}</Badge>
                    {u.is_active ? <Badge color="green">Hoạt động</Badge> : <Badge color="red">Đã khóa</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button onClick={() => toggleActive(u)} className="cursor-pointer rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">
                    {u.is_active ? "Khóa" : "Mở khóa"}
                  </button>
                  <button onClick={() => del(u)} title="Xóa" className="cursor-pointer rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
