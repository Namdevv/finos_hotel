import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { ROLE_LABEL, type Role } from "../types";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  roles?: Role[]; // nếu bỏ trống -> mọi vai trò
}

const NAV: NavItem[] = [
  { to: "/", label: "Tổng quan", icon: "📊", roles: ["admin", "accountant"] },
  { to: "/capture", label: "Chụp sổ", icon: "📷" },
  { to: "/transactions", label: "Chứng từ", icon: "📒" },
  { to: "/users", label: "Người dùng", icon: "👥", roles: ["admin"] },
];

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const items = NAV.filter((n) => !n.roles || hasRole(...n.roles));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col md:flex-row">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold text-brand-900">FinOS Hotel</div>
          <div className="text-xs text-slate-400">Kế toán khách sạn</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              <span>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <UserBox name={user?.full_name || user?.username} role={user?.role} onLogout={logout} />
      </aside>

      {/* Header (mobile) */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <div className="font-bold text-brand-900">FinOS Hotel</div>
        <button onClick={logout} className="text-sm text-slate-500">
          Đăng xuất
        </button>
      </header>

      {/* Nội dung */}
      <main className="flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-8">
        <Outlet />
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${
                isActive ? "text-brand-700" : "text-slate-500"
              }`
            }
          >
            <span className="text-lg">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function UserBox({
  name,
  role,
  onLogout,
}: {
  name?: string;
  role?: Role;
  onLogout: () => void;
}) {
  return (
    <div className="mt-2 rounded-xl bg-slate-50 p-3">
      <div className="truncate text-sm font-medium text-slate-700">{name}</div>
      <div className="text-xs text-slate-400">{role ? ROLE_LABEL[role] : ""}</div>
      <button onClick={onLogout} className="mt-2 text-xs font-medium text-red-600 hover:underline">
        Đăng xuất
      </button>
    </div>
  );
}
