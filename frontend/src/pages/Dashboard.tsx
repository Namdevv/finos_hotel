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
import { Card, Spinner, StatTile } from "../components/ui";
import { IconArrowDown, IconArrowUp, IconWallet } from "../components/icons";
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
    setSummary(null);
    setSeries(null);
    api.summary(sumParams).then(setSummary);
    api.timeseries(tsParams).then(setSeries);
  }, [group]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {group === "day" ? "Số liệu tháng này" : "Số liệu theo tháng"}
        </p>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value as "day" | "month")}
          className="field w-auto cursor-pointer"
        >
          <option value="day">Theo ngày (tháng này)</option>
          <option value="month">Theo tháng</option>
        </select>
      </div>

      {!summary ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="Tổng thu" value={fmtVnd(summary.total_income)} tone="green" icon={<IconArrowUp className="h-5 w-5" />} />
          <StatTile label="Tổng chi" value={fmtVnd(summary.total_expense)} tone="red" icon={<IconArrowDown className="h-5 w-5" />} />
          <StatTile
            label="Chênh lệch"
            value={fmtVnd(summary.balance)}
            tone={summary.balance < 0 ? "red" : "brand"}
            icon={<IconWallet className="h-5 w-5" />}
          />
        </div>
      )}

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">
            Thu / Chi {group === "day" ? "theo ngày" : "theo tháng"}
          </h2>
          {summary && (
            <span className="text-xs text-slate-400">{summary.count} chứng từ</span>
          )}
        </div>
        {!series ? (
          <Spinner />
        ) : series.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Chưa có dữ liệu trong kỳ.</div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ left: 4, right: 4, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="period" fontSize={11} tickMargin={6} stroke="#94a3b8" />
                <YAxis fontSize={11} width={56} stroke="#94a3b8" tickFormatter={(v) => (v ? `${v / 1_000_000}tr` : "0")} />
                <Tooltip
                  formatter={(v: number) => fmtVnd(v)}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Thu" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="expense" name="Chi" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
