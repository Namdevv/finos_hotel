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

export interface Job {
  job_id: number;
  status: "queued" | "processing" | "done" | "failed";
  image_path?: string | null;
  rows: OcrRow[];
  error?: string | null;
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
  receptionist: "Lễ tân",
};
