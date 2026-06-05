import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import type { Role } from "./types";
import Capture from "./pages/Capture";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Review from "./pages/Review";
import Transactions from "./pages/Transactions";
import Uploads from "./pages/Uploads";
import Users from "./pages/Users";
import "./index.css";

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <Spinner label="Đang tải…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !hasRole(...roles)) return <Navigate to="/capture" replace />;
  return <>{children}</>;
}

// Trang mặc định: admin/kế toán -> Tổng quan; lễ tân -> Chụp sổ.
function Home() {
  const { hasRole } = useAuth();
  return hasRole("admin", "accountant") ? <Dashboard /> : <Navigate to="/capture" replace />;
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
