import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { TrendPoint } from '@pfos/shared';
import { TrendingUp, TrendingDown, Layers, ArrowUpRight } from 'lucide-react';
import { money, signedMoney } from '../lib/format';

interface MonthlyNetIncomeChartProps {
  data: TrendPoint[];
  currency: string;
}

export function MonthlyNetIncomeChart({ data, currency }: MonthlyNetIncomeChartProps) {
  const [showBreakdownLines, setShowBreakdownLines] = useState(false);

  if (!data || data.length === 0) {
    return (
      <div
        id="monthly-net-income-chart-card"
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <TrendingUp className="h-4 w-4 text-[#0C3826]" />
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Monthly Net Income Trend
          </h3>
        </div>
        <p className="py-8 text-center text-xs text-slate-400">
          No historical monthly data recorded yet.
        </p>
      </div>
    );
  }

  // Calculate summary metrics
  const latestPoint = data[data.length - 1];
  const totalNetMinor = data.reduce((sum, p) => sum + p.netMinor, 0);
  const avgMonthlyNetMinor = Math.round(totalNetMinor / data.length);
  const profitableMonths = data.filter((p) => p.netMinor > 0).length;

  const formatCompactCurrency = (minor: number) => {
    const major = minor / 100;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(major);
    } catch {
      // Fallback if currency code is non-standard
      if (Math.abs(major) >= 1_000_000) return `${(major / 1_000_000).toFixed(1)}M`;
      if (Math.abs(major) >= 1_000) return `${(major / 1_000).toFixed(0)}k`;
      return `${major}`;
    }
  };

  const formatMonthTick = (label: string) => {
    const parts = label.split(' ');
    if (parts.length === 2) {
      return `${parts[0]} '${parts[1].slice(-2)}`;
    }
    return label;
  };

  return (
    <div
      id="monthly-net-income-chart-card"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
    >
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-[#0C3826] border border-emerald-100/80 shrink-0">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Monthly Net Income Trend
              </h3>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                12-Month Trajectory
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Operating profitability trend over time (Revenue minus Operating Expenses)
            </p>
          </div>
        </div>

        {/* Action / Toggle button & Quick Highlights */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            id="toggle-breakdown-lines-btn"
            onClick={() => setShowBreakdownLines((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              showBreakdownLines
                ? 'border-[#0C3826] bg-[#0C3826] text-white shadow-xs'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-3 w-3" />
            <span>{showBreakdownLines ? 'Hide Inflow/Outflow' : 'Compare Inflow & Outflow'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-lg bg-slate-50/70 p-3 border border-slate-100">
        <div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block">
            Latest Month ({latestPoint?.label})
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`text-sm font-bold font-mono ${
                latestPoint?.netMinor >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {signedMoney(latestPoint?.netMinor ?? 0, currency)}
            </span>
            {latestPoint?.netMinor >= 0 ? (
              <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700">
                <ArrowUpRight className="h-3 w-3" />
                Profit
              </span>
            ) : (
              <span className="inline-flex items-center text-[10px] font-semibold text-rose-700">
                <TrendingDown className="h-3 w-3" />
                Deficit
              </span>
            )}
          </div>
        </div>

        <div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block">
            12-Month Average Net
          </span>
          <span
            className={`text-sm font-bold font-mono mt-0.5 block ${
              avgMonthlyNetMinor >= 0 ? 'text-slate-800' : 'text-rose-700'
            }`}
          >
            {signedMoney(avgMonthlyNetMinor, currency)}/mo
          </span>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block">
            Profitable Months
          </span>
          <span className="text-sm font-bold text-slate-800 mt-0.5 block">
            {profitableMonths} of {data.length} months
          </span>
        </div>
      </div>

      {/* Recharts Line Chart */}
      <div className="h-64 sm:h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 10, right: 16, left: -4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              tickFormatter={formatMonthTick}
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              dy={6}
            />
            <YAxis
              tickFormatter={formatCompactCurrency}
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={65}
            />
            {/* Zero break-even reference line */}
            <ReferenceLine
              y={0}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />

            <Tooltip content={<CustomNetIncomeTooltip currency={currency} />} />

            {/* Optional gross income and expenses comparison lines */}
            {showBreakdownLines && (
              <>
                <Line
                  type="monotone"
                  dataKey="incomeMinor"
                  name="Gross Income"
                  stroke="#059669"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={{ r: 2.5, fill: '#059669' }}
                  activeDot={{ r: 4, fill: '#059669' }}
                />
                <Line
                  type="monotone"
                  dataKey="expensesMinor"
                  name="Total Expenses"
                  stroke="#e11d48"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={{ r: 2.5, fill: '#e11d48' }}
                  activeDot={{ r: 4, fill: '#e11d48' }}
                />
              </>
            )}

            {/* Primary Net Income Trend Line */}
            <Line
              type="monotone"
              dataKey="netMinor"
              name="Net Income"
              stroke="#0C3826"
              strokeWidth={2.75}
              dot={{
                r: 3.5,
                fill: '#0C3826',
                stroke: '#ffffff',
                strokeWidth: 2,
              }}
              activeDot={{
                r: 6,
                fill: '#0C3826',
                stroke: '#ffffff',
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend & Legend Indicator */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#0C3826]" />
            <span className="font-semibold text-slate-800">Net Income</span>
          </div>
          {showBreakdownLines && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-3 border-t-2 border-dashed border-emerald-600" />
                <span>Gross Inflow</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-3 border-t-2 border-dashed border-rose-600" />
                <span>Total Outflow</span>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          <span>Dashed center: Break-even (₱0)</span>
        </div>
      </div>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    payload: TrendPoint;
  }>;
  currency: string;
}

function CustomNetIncomeTooltip({ active, payload, currency }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload;
  const isNetPositive = point.netMinor >= 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl text-xs space-y-2 min-w-48">
      <div className="border-b border-slate-100 pb-1.5">
        <p className="font-bold text-slate-900">{point.label}</p>
        <span className="text-[10px] text-slate-400 font-mono">{point.month}</span>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">Net Income:</span>
          <span
            className={`font-mono font-bold ${
              isNetPositive ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {signedMoney(point.netMinor, currency)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 text-[11px] pt-1 border-t border-slate-100/70">
          <span className="text-slate-400">Inflow (Income):</span>
          <span className="font-mono text-slate-700">{money(point.incomeMinor, currency)}</span>
        </div>

        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="text-slate-400">Outflow (Expenses):</span>
          <span className="font-mono text-slate-700">{money(point.expensesMinor, currency)}</span>
        </div>
      </div>
    </div>
  );
}
