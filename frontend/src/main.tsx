import { lazy, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { AuthProvider, useAuth } from "./auth";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import type { Role } from "./types";
import "./index.css";

const Activities = lazy(() => import("./pages/Activities"));
const Capture = lazy(() => import("./pages/Capture"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Login = lazy(() => import("./pages/Login"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Profile = lazy(() => import("./pages/Profile"));
const Reports = lazy(() => import("./pages/Reports"));
const Review = lazy(() => import("./pages/Review"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Uploads = lazy(() => import("./pages/Uploads"));
const Users = lazy(() => import("./pages/Users"));

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
        <Suspense fallback={<Spinner label="Đang tải..." />}>
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
              <Route
                path="/reports"
                element={
                  <Protected roles={["admin", "accountant"]}>
                    <Reports />
                  </Protected>
                }
              />
              <Route path="/notifications" element={<Notifications />} />
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
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
