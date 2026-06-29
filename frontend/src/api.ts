import type {
  Activity,
  Job,
  JobSummary,
  Notification,
  NotificationPreference,
  PushKey,
  PushStatus,
  Report,
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
  bulkDeleteTransactions: (ids: number[]) =>
    request<void>("/transactions", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    }),
  bulkUpdateDate: (ids: number[], txn_date: string) =>
    request<Transaction[]>("/transactions", {
      method: "PATCH",
      body: JSON.stringify({ ids, txn_date }),
    }),

  // OCR — gửi ảnh GỐC (không nén) để giữ toàn vẹn cho VLM.
  // rotate: góc xoay khi upload (0/90/180/270); null = dùng mặc định cấu hình.
  listActivities: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<Activity[]>(`/activities${q ? `?${q}` : ""}`);
  },

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
  listJobs: (params: { limit?: number; before_id?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.before_id != null) q.set("before_id", String(params.before_id));
    const qs = q.toString();
    return request<JobSummary[]>(`/ocr/jobs${qs ? `?${qs}` : ""}`);
  },
  reocr: (id: number, rotate: number | null) =>
    request<Job>(`/ocr/jobs/${id}/reocr`, {
      method: "POST",
      body: JSON.stringify({ rotate }),
    }),
  commitOcrJob: (id: number, rows: Array<{
    txn_date: string;
    room: string;
    note: string;
    kind: string;
    amount: number;
  }>) =>
    request<Transaction[]>(`/ocr/jobs/${id}/commit`, {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  // Chứng từ đã lưu từ một job (để mở lại ảnh thấy đúng dữ liệu đã duyệt, không phải OCR gốc).
  jobTransactions: (id: number) =>
    request<Transaction[]>(`/ocr/jobs/${id}/transactions`),
  // Ghi đè toàn bộ chứng từ đã lưu từ job bằng bản đã sửa.
  updateJobTransactions: (id: number, rows: Array<{
    txn_date: string;
    room: string;
    note: string;
    kind: string;
    amount: number;
  }>) =>
    request<Transaction[]>(`/ocr/jobs/${id}/transactions`, {
      method: "PUT",
      body: JSON.stringify({ rows }),
    }),
  cancelJob: (id: number) =>
    request<void>(`/ocr/jobs/${id}/cancel`, { method: "POST" }),
  deleteJob: (id: number, alsoDeleteTransactions = false) =>
    request<void>(
      `/ocr/jobs/${id}${alsoDeleteTransactions ? "?also_delete_transactions=true" : ""}`,
      { method: "DELETE" },
    ),

  // Notifications — thông báo trong ứng dụng (mỗi người xem của chính mình).
  listNotifications: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<Notification[]>(`/notifications${q ? `?${q}` : ""}`);
  },
  unreadCount: () => request<{ count: number }>("/notifications/unread_count"),
  markNotifRead: (id: number) =>
    request<void>(`/notifications/${id}/read`, { method: "POST" }),
  markAllNotifRead: () =>
    request<void>("/notifications/read_all", { method: "POST" }),
  deleteNotif: (id: number) =>
    request<void>(`/notifications/${id}`, { method: "DELETE" }),
  listNotificationPreferences: () =>
    request<NotificationPreference[]>("/notifications/preferences"),
  updateNotificationPreferences: (preferences: Record<string, boolean>) =>
    request<NotificationPreference[]>("/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify({ preferences }),
    }),
  pushKey: () => request<PushKey>("/notifications/push/key"),
  pushStatus: () => request<PushStatus>("/notifications/push/status"),
  subscribePush: (body: { endpoint: string; p256dh: string; auth: string }) =>
    request<PushStatus>("/notifications/push/subscribe", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  unsubscribePush: (body: { endpoint: string; p256dh: string; auth: string }) =>
    request<PushStatus>("/notifications/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Stats
  summary: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<StatsSummary>(`/stats/summary${q ? `?${q}` : ""}`);
  },
  timeseries: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<StatsBucket[]>(`/stats/timeseries${q ? `?${q}` : ""}`);
  },

  // Reports — báo cáo Excel theo tháng (admin & kế toán).
  listReports: () => request<Report[]>("/reports"),
  generateReport: (period: string) =>
    request<Report>("/reports", { method: "POST", body: JSON.stringify({ period }) }),
  deleteReport: (id: number) => request<void>(`/reports/${id}`, { method: "DELETE" }),
  // Tải file .xlsx kèm bearer token rồi kích hoạt lưu về máy.
  downloadReport: async (id: number, period: string) => {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`/api/reports/${id}/download`, { headers });
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
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bao_cao_thu_chi_${period}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export { ApiError };
