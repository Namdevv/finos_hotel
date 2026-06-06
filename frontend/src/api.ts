import type {
  Job,
  JobSummary,
  StatsBucket,
  StatsSummary,
  Transaction,
  User,
} from "./types";

const TOKEN_KEY = "finos_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers = new Headers(opts.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (opts.body && !(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (res.status === 401) {
    setToken(null);
    if (location.pathname !== "/login") location.href = "/login";
    throw new ApiError(401, "Phiên đăng nhập hết hạn");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<User>("/auth/me"),
  updateProfile: (body: {
    full_name?: string;
    current_password?: string;
    new_password?: string;
  }) => request<User>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),

  // Users
  listUsers: () => request<User[]>("/users"),
  createUser: (body: {
    username: string;
    password: string;
    full_name: string;
    role: string;
  }) => request<User>("/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: number, body: Record<string, unknown>) =>
    request<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id: number) =>
    request<void>(`/users/${id}`, { method: "DELETE" }),

  // Transactions
  listTransactions: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<Transaction[]>(`/transactions${q ? `?${q}` : ""}`);
  },
  createTransaction: (body: Record<string, unknown>) =>
    request<Transaction>("/transactions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTransaction: (id: number, body: Record<string, unknown>) =>
    request<Transaction>(`/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTransaction: (id: number) =>
    request<void>(`/transactions/${id}`, { method: "DELETE" }),

  // OCR — gửi ảnh GỐC (không nén) để giữ toàn vẹn cho VLM.
  // rotate: góc xoay khi upload (0/90/180/270); null = dùng mặc định cấu hình.
  uploadImage: (file: File, rotate: number | null = null) => {
    const fd = new FormData();
    fd.append("file", file, file.name || "capture.jpg");
    if (rotate !== null) fd.append("rotate", String(rotate));
    return request<{ id: number; status: string }>("/ocr/upload", {
      method: "POST",
      body: fd,
    });
  },
  getJob: (id: number) => request<Job>(`/ocr/jobs/${id}`),
  listJobs: () => request<JobSummary[]>("/ocr/jobs"),
  reocr: (id: number, rotate: number | null) =>
    request<Job>(`/ocr/jobs/${id}/reocr`, {
      method: "POST",
      body: JSON.stringify({ rotate }),
    }),
  cancelJob: (id: number) =>
    request<void>(`/ocr/jobs/${id}/cancel`, { method: "POST" }),
  deleteJob: (id: number) =>
    request<void>(`/ocr/jobs/${id}`, { method: "DELETE" }),

  // Stats
  summary: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<StatsSummary>(`/stats/summary${q ? `?${q}` : ""}`);
  },
  timeseries: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<StatsBucket[]>(`/stats/timeseries${q ? `?${q}` : ""}`);
  },
};

export { ApiError };
