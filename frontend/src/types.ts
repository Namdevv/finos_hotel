export type Role = "admin" | "accountant" | "receptionist";
export type Kind = "income" | "expense";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export interface Transaction {
  id: number;
  txn_date: string;
  room: string;
  note: string;
  kind: Kind;
  amount: number;
  source: string;
  job_id?: number | null;
  image_path?: string | null;
  created_by: number;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: number | null;
}

export interface OcrField {
  value: string;
  confidence: number;
}

export interface OcrRow {
  txn_date: OcrField;
  room: OcrField;
  note: OcrField;
  kind: Kind;
  amount: OcrField;
  min_confidence: number;
}

export type JobStage = "preparing" | "recognizing" | "parsing";

export type JobStatus = "queued" | "processing" | "done" | "failed";

export interface Job {
  job_id: number;
  status: JobStatus;
  stage?: JobStage | null;
  rotate?: number | null;
  cancelled?: boolean;
  image_path?: string | null;
  rows: OcrRow[];
  error?: string | null;
}

export interface JobSummary {
  id: number;
  status: JobStatus;
  stage?: JobStage | null;
  error?: string | null;
  rotate?: number | null;
  cancelled?: boolean;
  n_rows: number;
  image_path?: string | null;
  created_at: string;
  finished_at?: string | null;
}

export interface StatsSummary {
  total_income: number;
  total_expense: number;
  balance: number;
  count: number;
}

export interface StatsBucket {
  period: string;
  income: number;
  expense: number;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Quản trị",
  accountant: "Kế toán",
  receptionist: "Nhân viên",
};

export interface Activity {
  id: number;
  user_id?: number | null;
  username?: string | null;
  full_name?: string | null;
  role?: Role | null;
  action: string;
  target_type: string;
  target_id?: number | null;
  detail: string;
  created_at: string;
}
