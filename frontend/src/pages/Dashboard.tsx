import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Badge, Card, Spinner } from "../components/ui";
import {
  IconArrowDown,
  IconArrowUp,
  IconReceipt,
  IconWallet,
} from "../components/icons";
import { firstOfMonthIso, fmtVnd, previousMonthRangeIso, todayIso } from "../lib";
import { ROLE_LABEL, type Activity, type StatsBucket, type StatsSummary, type Transaction } from "../types";
import { actionLabel, detailText, fmtTime } from "./Activities";

const INCOME = "#10b981"; // emerald-500
const EXPENSE = "#f43f5e"; // rose-500
const BRAND = "#2563eb"; // brand-600

/** Rút gọn số tiền cho trục/biểu đồ: 1.200.000 -> "1,2tr". */
function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}tỷ`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}tr`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/** % thay đổi so với kỳ trước. null nếu không đủ dữ liệu để so. */
function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** Format ngày YYYY-MM-DD -> DD/MM. */
function fmtDay(s: string): string {
  const [, m, d] = s.split("-");
  return m && d ? `${d}/${m}` : s;
}

export default function Dashboard() {
  const { hasRole } = useAuth();
  const employeeView = hasRole("receptionist");
  const isAdmin = hasRole("admin");
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<StatsSummary | null>(null);
  const [series, setSeries] = useState<StatsBucket[] | null>(null);
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [group, setGroup] = useState<"day" | "month">("day");

  // Nhật ký hoạt động chỉ admin được xem (endpoint /activities guard admin).
  useEffect(() => {
    if (!isAdmin) return;
    setActivities(null);
    api.listActivities({ limit: "6" }).then(setActivities).catch(() => setActivities([]));
  }, [isAdmin]);

  useEffect(() => {
    setSummary(null);
    setPrevSummary(null);
    setSeries(employeeView ? [] : null);
    setTxns(employeeView ? [] : null);

    if (employeeView) {
      const today = todayIso();
      api.summary({ date_from: today, date_to: today }).then(setSummary);
      return;
    }

    const tsParams: Record<string, string> = { group };
    const sumParams: Record<string, string> = {};
    const txnParams: Record<string, string> = { limit: "1000" };
    if (group === "day") {
      const monthStart = firstOfMonthIso();
      tsParams.date_from = monthStart;
      sumParams.date_from = monthStart;
      txnParams.date_from = monthStart;

      // Kỳ trước (tháng trước) để tính xu hướng.
      const prev = previousMonthRangeIso();
      api.summary({ date_from: prev.start, date_to: prev.end }).then(setPrevSummary);
    }

    api.summary(sumParams).then(setSummary);
    api.timeseries(tsParams).then(setSeries);
    api.listTransactions(txnParams).then(setTxns);
  }, [group, employeeView]);

  // Số dư lũy kế qua từng kỳ -> đường xu hướng trên biểu đồ.
  const chartData = useMemo(() => {
    if (!series) return [];
    let running = 0;
    return series.map((b) => {
      running += b.income - b.expense;
      return { ...b, balance: running };
    });
  }, [series]);

  // Top phòng theo doanh thu (thu) trong kỳ.
  const topRooms = useMemo(() => {
    if (!txns) return [];
    const acc = new Map<string, number>();
    for (const t of txns) {
      if (t.kind !== "income") continue;
      const room = (t.room || "—").trim() || "—";
      acc.set(room, (acc.get(room) || 0) + t.amount);
    }
    return [...acc.entries()]
      .map(([room, total]) => ({ room, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [txns]);

  const recent = useMemo(() => (txns ? txns.slice(0, 6) : []), [txns]);

  const periodLabel = employeeView
    ? "Tổng thu / chi hôm nay"
    : group === "day"
      ? "Số liệu tháng này"
      : "Số liệu theo tháng";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tổng quan</h1>
          <p className="text-sm text-slate-500">{periodLabel}</p>
        </div>
        {!employeeView && (
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as "day" | "month")}
            className="field w-auto cursor-pointer"
          >
            <option value="day">Theo ngày (tháng này)</option>
            <option value="month">Theo tháng</option>
          </select>
        )}
      </div>

      {/* KPI */}
      {!summary ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Tổng thu"
            value={fmtVnd(summary.total_income)}
            tone="green"
            icon={<IconArrowUp className="h-5 w-5" />}
            delta={pctDelta(summary.total_income, prevSummary?.total_income ?? 0)}
            goodWhenUp
          />
          <KpiCard
            label="Tổng chi"
            value={fmtVnd(summary.total_expense)}
            tone="red"
            icon={<IconArrowDown className="h-5 w-5" />}
            delta={pctDelta(summary.total_expense, prevSummary?.total_expense ?? 0)}
            goodWhenUp={false}
          />
          <KpiCard
            label="Lợi nhuận"
            value={fmtVnd(summary.balance)}
            tone={summary.balance < 0 ? "red" : "brand"}
            icon={<IconWallet className="h-5 w-5" />}
            delta={pctDelta(summary.balance, prevSummary?.balance ?? 0)}
            goodWhenUp
          />
          <KpiCard
            label="Số chứng từ"
            value={String(summary.count)}
            tone="brand"
            icon={<IconReceipt className="h-5 w-5" />}
            delta={pctDelta(summary.count, prevSummary?.count ?? 0)}
            goodWhenUp
            plain
          />
        </div>
      )}

      {!employeeView && (
        <>
          {/* Biểu đồ chính + cơ cấu thu/chi */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800">
                  Thu / Chi {group === "day" ? "theo ngày" : "theo tháng"}
                </h2>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <LegendDot color={INCOME} label="Thu" />
                  <LegendDot color={EXPENSE} label="Chi" />
                  <LegendDot color={BRAND} label="Số dư lũy kế" />
                </div>
              </div>
              {!series ? (
                <Spinner />
              ) : chartData.length === 0 ? (
                <Empty>Chưa có dữ liệu trong kỳ.</Empty>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ left: 4, right: 4, top: 4 }}>
                      <defs>
                        <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={BRAND} stopOpacity={0.18} />
                          <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis
                        dataKey="period"
                        tickFormatter={group === "day" ? fmtDay : undefined}
                        fontSize={11}
                        tickMargin={6}
                        stroke="#94a3b8"
                        interval="preserveStartEnd"
                        minTickGap={24}
                      />
                      <YAxis fontSize={11} width={48} stroke="#94a3b8" tickFormatter={(v) => fmtShort(v)} />
                      <Tooltip
                        formatter={(v: number, name) => [fmtVnd(v), name]}
                        labelFormatter={(l) => (group === "day" ? `Ngày ${fmtDay(String(l))}` : `Tháng ${l}`)}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="balance"
                        name="Số dư lũy kế"
                        stroke="none"
                        fill="url(#balFill)"
                      />
                      <Bar dataKey="income" name="Thu" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="expense" name="Chi" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Line
                        type="monotone"
                        dataKey="balance"
                        name="Số dư lũy kế"
                        stroke={BRAND}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Cơ cấu thu/chi */}
            <Card>
              <h2 className="mb-4 text-sm font-bold text-slate-800">Cơ cấu thu / chi</h2>
              {!summary ? (
                <Spinner />
              ) : summary.total_income + summary.total_expense === 0 ? (
                <Empty>Chưa có dữ liệu.</Empty>
              ) : (
                <Composition summary={summary} />
              )}
            </Card>
          </div>

          {/* Giao dịch gần đây + Top phòng */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card pad={false} className="overflow-hidden">
              <div className="flex items-center justify-between px-5 pb-3 pt-5">
                <h2 className="text-sm font-bold text-slate-800">Giao dịch gần đây</h2>
                <Link to="/transactions" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Xem tất cả
                </Link>
              </div>
              {!txns ? (
                <Spinner />
              ) : recent.length === 0 ? (
                <Empty>Chưa có giao dịch.</Empty>
              ) : (
                <table className="acc-table">
                  <tbody>
                    {recent.map((t) => (
                      <tr key={t.id}>
                        <td className="whitespace-nowrap text-xs text-slate-500">{fmtDay(t.txn_date)}</td>
                        <td>
                          <div className="font-medium text-slate-800">{t.room || "—"}</div>
                          {t.note && <div className="truncate text-xs text-slate-400">{t.note}</div>}
                        </td>
                        <td>
                          <Badge color={t.kind === "income" ? "green" : "red"}>
                            {t.kind === "income" ? "Thu" : "Chi"}
                          </Badge>
                        </td>
                        <td
                          className={`num font-semibold tabular-nums ${
                            t.kind === "income" ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {t.kind === "income" ? "+" : "−"}
                          {fmtVnd(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 text-sm font-bold text-slate-800">Top phòng theo doanh thu</h2>
              {!txns ? (
                <Spinner />
              ) : topRooms.length === 0 ? (
                <Empty>Chưa có dữ liệu doanh thu.</Empty>
              ) : (
                <div className="space-y-3">
                  {topRooms.map((r, i) => {
                    const max = topRooms[0].total || 1;
                    return (
                      <div key={r.room}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 font-medium text-slate-700">
                            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-50 text-[11px] font-bold text-brand-600">
                              {i + 1}
                            </span>
                            {r.room}
                          </span>
                          <span className="font-semibold tabular-nums text-slate-800">{fmtVnd(r.total)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${Math.max(4, (r.total / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Hoạt động gần đây — chỉ admin */}
          {isAdmin && (
            <Card pad={false} className="overflow-hidden">
              <div className="flex items-center justify-between px-5 pb-3 pt-5">
                <h2 className="text-sm font-bold text-slate-800">Hoạt động gần đây</h2>
                <Link to="/activities" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Xem tất cả
                </Link>
              </div>
              {!activities ? (
                <Spinner />
              ) : activities.length === 0 ? (
                <Empty>Chưa có hoạt động nào.</Empty>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activities.map((a) => (
                    <ActivityRow key={a.id} a={a} />
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/** Một dòng trong feed hoạt động gần đây. */
function ActivityRow({ a }: { a: Activity }) {
  const cat = actionCategory(a.action);
  const detail = detailText(a.detail);
  const target = a.target_type ? `${a.target_type}${a.target_id ? ` #${a.target_id}` : ""}` : "";
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${cat}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="font-semibold text-slate-800">{a.full_name || a.username || "Hệ thống"}</span>
          <span className="text-slate-500">{actionLabel(a.action).toLowerCase()}</span>
          {target && <span className="text-slate-400">· {target}</span>}
        </div>
        {detail && <div className="truncate text-xs text-slate-400">{detail}</div>}
      </div>
      <div className="shrink-0 text-right">
        {a.role && (
          <Badge color="blue">{ROLE_LABEL[a.role]}</Badge>
        )}
        <div className="mt-1 whitespace-nowrap text-[11px] text-slate-400">{fmtTime(a.created_at)}</div>
      </div>
    </li>
  );
}

/** Màu chấm theo nhóm thao tác: tạo=xanh, xóa=đỏ, sửa=brand, còn lại=xám. */
function actionCategory(action: string): string {
  if (action.includes("create")) return "bg-emerald-500";
  if (action.includes("delete")) return "bg-rose-500";
  if (action.includes("update")) return "bg-brand-500";
  return "bg-slate-300";
}

/** Thẻ KPI có chỉ báo xu hướng so với kỳ trước. */
function KpiCard({
  label,
  value,
  icon,
  tone,
  delta,
  goodWhenUp,
  plain = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "brand" | "green" | "red";
  delta: number | null;
  goodWhenUp: boolean;
  plain?: boolean;
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-rose-50 text-rose-600",
  }[tone];
  const valueTone = plain
    ? "text-slate-900"
    : { brand: "text-slate-900", green: "text-emerald-600", red: "text-rose-600" }[tone];

  const up = delta !== null && delta > 0;
  const down = delta !== null && delta < 0;
  const good = delta === null || delta === 0 ? null : up === goodWhenUp;

  return (
    <Card className="flex items-start gap-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className={`mt-0.5 truncate text-xl font-bold tabular-nums ${valueTone}`}>{value}</div>
        {delta !== null && (
          <div
            className={`mt-1 inline-flex items-center gap-0.5 text-xs font-semibold ${
              good === null ? "text-slate-400" : good ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {up && <IconArrowUp className="h-3 w-3" />}
            {down && <IconArrowDown className="h-3 w-3" />}
            {delta === 0 ? "—" : `${Math.abs(delta).toFixed(0)}%`}
            <span className="font-normal text-slate-400">vs kỳ trước</span>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Donut cơ cấu thu/chi với số dư ở giữa. */
function Composition({ summary }: { summary: StatsSummary }) {
  const data = [
    { name: "Thu", value: summary.total_income, color: INCOME },
    { name: "Chi", value: summary.total_expense, color: EXPENSE },
  ];
  const total = summary.total_income + summary.total_expense;
  const incPct = total ? Math.round((summary.total_income / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="relative mx-auto h-44 w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={56}
              outerRadius={80}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => fmtVnd(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Số dư</span>
          <span className={`text-base font-bold tabular-nums ${summary.balance < 0 ? "text-rose-600" : "text-slate-900"}`}>
            {fmtShort(summary.balance)}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Row color={INCOME} label="Thu" value={summary.total_income} pct={incPct} />
        <Row color={EXPENSE} label="Chi" value={summary.total_expense} pct={100 - incPct} />
      </div>
    </div>
  );
}

function Row({ color, label, value, pct }: { color: string; label: string; value: number; pct: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-slate-600">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {label}
        <span className="text-xs text-slate-400">{pct}%</span>
      </span>
      <span className="font-semibold tabular-nums text-slate-800">{fmtVnd(value)}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-12 text-center text-sm text-slate-400">{children}</div>;
}
