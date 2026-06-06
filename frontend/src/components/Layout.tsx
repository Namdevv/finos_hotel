import type { ComponentType, SVGProps } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ROLE_LABEL, type Role } from "../types";
import {
  IconActivity,
  IconCamera,
  IconDashboard,
  IconHistory,
  IconLock,
  IconLogout,
  IconReceipt,
  IconUser,
  IconUsers,
} from "./icons";

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  roles?: Role[];
  disabledFor?: Role[];
  mobile?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Tổng quan", Icon: IconDashboard, mobile: true },
  { to: "/capture", label: "Chụp sổ", Icon: IconCamera, mobile: true },
  { to: "/uploads", label: "Thư viện", Icon: IconHistory },
  { to: "/transactions", label: "Chứng từ", Icon: IconReceipt, mobile: true },
  { to: "/activities", label: "Hoạt động", Icon: IconActivity, roles: ["admin"] },
  { to: "/users", label: "Người dùng", Icon: IconUsers, roles: ["admin", "accountant"], disabledFor: ["accountant"] },
  { to: "/profile", label: "Hồ sơ", Icon: IconUser, mobile: true },
];

const TITLES: Record<string, string> = {
  "/": "Tổng quan",
  "/capture": "Chụp / tải ảnh sổ",
  "/uploads": "Thư viện ảnh",
  "/transactions": "Chứng từ",
  "/activities": "Hoạt động",
  "/users": "Người dùng",
  "/profile": "Hồ sơ người dùng",
};

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const items = NAV.filter((n) => !n.roles || hasRole(...n.roles));
  const sidebarItems = items.filter((n) => n.to !== "/profile");
  const mobileItems = items.filter((n) => n.mobile);
  const title =
    TITLES[loc.pathname] ?? (loc.pathname.startsWith("/review") ? "Duyệt & sửa chứng từ" : "FinOS Hotel");
  const initials = (user?.full_name || user?.username || "?").trim().charAt(0).toUpperCase();

  function locked(item: NavItem) {
    return !!user && !!item.disabledFor?.includes(user.role);
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-ink-900 text-slate-300 md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/logo_finos.png" alt="FinOS Hotel" className="h-9 w-9 rounded-lg object-cover" />
          <div>
            <div className="text-base font-bold leading-tight text-white">FinOS Hotel</div>
            <div className="text-[11px] text-slate-400">Kế toán khách sạn</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Nghiệp vụ
          </div>
          {sidebarItems.map((item) => {
            const { to, label, Icon } = item;
            if (locked(item)) {
              return (
                <div
                  key={to}
                  title="Chỉ quản trị viên được dùng chức năng này"
                  className="group flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 opacity-60"
                >
                  <Icon className="h-[18px] w-[18px]" />
                  <span className="flex-1">{label}</span>
                  <IconLock className="h-3.5 w-3.5" />
                </div>
              );
            }
            return (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <button
              onClick={() => nav("/profile")}
              title="Hồ sơ người dùng"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/20 font-bold text-brand-200">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">
                  {user?.full_name || user?.username}
                </div>
                <div className="text-[11px] text-slate-400">{user ? ROLE_LABEL[user.role] : ""}</div>
              </div>
            </button>
            <button
              onClick={logout}
              title="Đăng xuất"
              className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-rose-300"
            >
              <IconLogout className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <img src="/logo_finos.png" alt="FinOS Hotel" className="h-7 w-7 shrink-0 rounded-md object-cover md:hidden" />
            <h1 className="truncate text-base font-bold text-slate-900 md:text-lg">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">
              {user?.full_name || user?.username}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {initials}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 animate-fade-in px-4 pb-24 pt-5 md:px-8 md:pb-8">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {mobileItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-1 cursor-pointer flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                isActive ? "text-brand-600" : "text-slate-500"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
