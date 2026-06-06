import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { AuthProvider, useAuth } from "./auth";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import type { Role } from "./types";
import Activities from "./pages/Activities";
import Capture from "./pages/Capture";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Review from "./pages/Review";
import Transactions from "./pages/Transactions";
import Uploads from "./pages/Uploads";
import Users from "./pages/Users";
import "./index.css";

// Đăng ký service worker. Với registerType "autoUpdate", khi phát hiện bản
// build mới, SW mới sẽ skipWaiting + claim rồi tự reload trang → người dùng
// luôn nhận code mới mà KHÔNG cần Ctrl+Shift+R.
registerSW({ immediate: true });

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <Spinner label="Đang tải..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !hasRole(...roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Home() {
  return <Dashboard />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/uploads" element={<Uploads />} />
            <Route path="/review/:jobId" element={<Review />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/profile" element={<Profile />} />
            <Route
              path="/activities"
              element={
                <Protected roles={["admin"]}>
                  <Activities />
                </Protected>
              }
            />
            <Route
              path="/users"
              element={
                <Protected roles={["admin"]}>
                  <Users />
                </Protected>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
