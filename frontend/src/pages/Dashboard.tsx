import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import { Card, Spinner } from "../components/ui";
import { fmtVnd } from "../lib";
import type { StatsBucket, StatsSummary } from "../types";

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function Dashboard() {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [series, setSeries] = useState<StatsBucket[] | null>(null);
  const [group, setGroup] = useState<"day" | "month">("day");

  useEffect(() => {
    const tsParams: Record<string, string> = { group };
    const sumParams: Record<string, string> = {};
    if (group === "day") {
      tsParams.date_from = firstOfMonth();
      sumParams.date_from = firstOfMonth();
    }
    api.summary(sumParams).then(setSummary);
    api.timeseries(tsParams).then(setSeries);
  }, [group]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Tổng quan</h1>
        <select value={group} onChange={(e) => setGroup(e.target.value as "day" | "month")} className="field w-auto">
          <option value="day">Theo ngày (tháng này)</option>
          <option value="month">Theo tháng</option>
        </select>
      </div>

      {!summary ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard title="Tổng thu" value={fmtVnd(summary.total_income)} color="text-emerald-600" />
          <StatCard title="Tổng chi" value={fmtVnd(summary.total_expense)} color="text-red-600" />
          <StatCard
            title="Chênh lệch"
            value={fmtVnd(summary.balance)}
            color={summary.balance < 0 ? "text-red-600" : "text-brand-700"}
          />
        </div>
      )}

      <Card>
        <div className="mb-4 text-sm font-semibold text-slate-600">Thu / Chi {group === "day" ? "theo ngày" : "theo tháng"}</div>
        {!series ? (
          <Spinner />
        ) : series.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Chưa có dữ liệu.</div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ left: 4, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="period" fontSize={11} tickMargin={6} />
                <YAxis fontSize={11} width={64} tickFormatter={(v) => `${v / 1_000_000}tr`} />
                <Tooltip formatter={(v: number) => fmtVnd(v)} />
                <Legend />
                <Bar dataKey="income" name="Thu" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Chi" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <Card>
      <div className="text-xs text-slate-400">{title}</div>
      <div className={`mt-1 text-lg font-bold ${color}`}>{value}</div>
    </Card>
  );
}
