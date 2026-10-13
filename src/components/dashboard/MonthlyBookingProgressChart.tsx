"use client";

import { useId, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  Clock, 
  Users, 
  Ticket, 
  Flame, 
  Layers, 
  Percent, 
  Train 
} from "lucide-react";

export interface MonthlyBookingProgress {
  label: string;
  monthIndex: number;
  total: number;
  booked: number;
  failed: number;
  cancelled: number;
  pending: number;
  successRate: number; // Adjusted rate: booked / (total - userCancelled - pending)
  rawSuccessRate?: number; // Raw rate: booked / total
  tatkal?: number;
  general?: number;
  passengers?: number;
  bookedPassengers?: number;
}

interface MonthlyBookingProgressChartProps {
  months: MonthlyBookingProgress[];
  year: number;
  availableYears?: number[];
  onYearChange?: (year: number) => void;
  currentMonthIndex: number;
}

type ViewMode = "volume" | "rate" | "bookingType";

type SeriesKey = "total" | "booked" | "failed" | "cancelled";

const WIDTH = 760;
const HEIGHT = 270;
const LEFT = 52;
const RIGHT = 24;
const TOP = 26;
const BOTTOM = 38;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;
const formatCount = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function MonthlyBookingProgressChart({ 
  months, 
  year, 
  availableYears,
  onYearChange,
  currentMonthIndex 
}: MonthlyBookingProgressChartProps) {
  const chartId = useId();
  
  // State
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("volume");
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    total: true,
    booked: true,
    failed: true,
    cancelled: false,
  });

  const toggleSeries = (key: SeriesKey) => {
    setVisibleSeries(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // Ensure at least one series remains active
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  };

  // Active month: hovered first, then selected, then current, then last
  const activeMonthIndex = hoveredMonthIndex 
    ?? selectedMonthIndex 
    ?? (months.some(m => m.monthIndex === currentMonthIndex) ? currentMonthIndex : months[months.length - 1]?.monthIndex ?? 0);

  const activeMonth = months.find((m) => m.monthIndex === activeMonthIndex) ?? months[months.length - 1];

  const hasBookings = months.some((month) => month.total > 0);

  // Month-over-month calculation for active month
  const activeMonthPos = months.findIndex((m) => m.monthIndex === activeMonth?.monthIndex);
  const previousMonth = activeMonthPos > 0 ? months[activeMonthPos - 1] : undefined;
  const momTotalChange = previousMonth && previousMonth.total > 0 && activeMonth
    ? Math.round(((activeMonth.total - previousMonth.total) / previousMonth.total) * 100)
    : null;
  const momBookedChange = previousMonth && previousMonth.booked > 0 && activeMonth
    ? Math.round(((activeMonth.booked - previousMonth.booked) / previousMonth.booked) * 100)
    : null;

  // Annual KPIs
  const annualStats = useMemo(() => {
    const totalRequests = months.reduce((sum, m) => sum + m.total, 0);
    const totalBooked = months.reduce((sum, m) => sum + m.booked, 0);
    const totalFailed = months.reduce((sum, m) => sum + m.failed, 0);
    const totalCancelled = months.reduce((sum, m) => sum + m.cancelled, 0);
    const totalPending = months.reduce((sum, m) => sum + m.pending, 0);
    const totalPassengers = months.reduce((sum, m) => sum + (m.passengers || 0), 0);
    const totalTatkal = months.reduce((sum, m) => sum + (m.tatkal || 0), 0);
    const totalGeneral = months.reduce((sum, m) => sum + (m.general || 0), 0);

    const eligible = totalRequests - (totalCancelled + totalPending);
    const avgSuccessRate = eligible > 0 ? Math.round((totalBooked / eligible) * 100) : 0;
    const rawConversion = totalRequests > 0 ? Math.round((totalBooked / totalRequests) * 100) : 0;

    const peak = months.reduce(
      (max, m) => (m.total > (max?.total ?? 0) ? m : max), 
      months[0]
    );

    return {
      totalRequests,
      totalBooked,
      totalFailed,
      totalCancelled,
      totalPending,
      totalPassengers,
      totalTatkal,
      totalGeneral,
      avgSuccessRate,
      rawConversion,
      peak,
    };
  }, [months]);

  // Coordinates and scaling
  const slotWidth = PLOT_WIDTH / Math.max(1, months.length);
  const x = (index: number) => LEFT + slotWidth * (index + 0.5);

  // Maximum scale depending on view mode
  const axisMaximum = useMemo(() => {
    if (viewMode === "rate") return 100;

    let maxVal = 1;
    if (viewMode === "bookingType") {
      maxVal = Math.max(1, ...months.flatMap(m => [m.tatkal || 0, m.general || 0, m.total]));
    } else {
      const activeValues = months.flatMap(m => {
        const vals: number[] = [];
        if (visibleSeries.total) vals.push(m.total);
        if (visibleSeries.booked) vals.push(m.booked);
        if (visibleSeries.failed) vals.push(m.failed);
        if (visibleSeries.cancelled) vals.push(m.cancelled);
        return vals.length ? vals : [m.total];
      });
      maxVal = Math.max(1, ...activeValues);
    }
    const step = Math.ceil(maxVal / 4);
    return Math.max(4, step * 4);
  }, [months, viewMode, visibleSeries]);

  const tickStep = axisMaximum / 4;
  const y = (count: number) => TOP + PLOT_HEIGHT * (1 - Math.max(0, count) / axisMaximum);

  // Path generator for polylines and area fills
  const getLinePoints = (getValue: (m: MonthlyBookingProgress) => number) => {
    return months.map((month, index) => `${x(index)},${y(getValue(month))}`).join(" ");
  };

  const getAreaPolygon = (getValue: (m: MonthlyBookingProgress) => number) => {
    if (months.length === 0) return "";
    const pts = months.map((month, index) => `${x(index)},${y(getValue(month))}`);
    const firstX = x(0);
    const lastX = x(months.length - 1);
    const baseY = y(0);
    return `${firstX},${baseY} ${pts.join(" ")} ${lastX},${baseY}`;
  };

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="pb-3 space-y-4">
        {/* Title, Year & Top-Level Description */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl font-bold tracking-tight">Monthly Booking Progress</CardTitle>
              {availableYears && availableYears.length > 1 && onYearChange ? (
                <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5 border text-xs">
                  {availableYears.map(yVal => (
                    <button
                      key={yVal}
                      type="button"
                      onClick={() => onYearChange(yVal)}
                      className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                        yVal === year 
                          ? "bg-primary text-primary-foreground shadow-xs" 
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {yVal}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="rounded-md bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  {year}
                </span>
              )}
            </div>
            <CardDescription className="mt-1">
              Deep dive into requests, success rates, cancellation trends, and booking channels.
            </CardDescription>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 rounded-xl bg-muted/70 p-1 border border-border/60 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode("volume")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "volume"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Volume
            </button>
            <button
              type="button"
              onClick={() => setViewMode("rate")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "rate"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Percent className="h-3.5 w-3.5" />
              Success Rate
            </button>
            <button
              type="button"
              onClick={() => setViewMode("bookingType")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "bookingType"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Train className="h-3.5 w-3.5" />
              Tatkal vs General
            </button>
          </div>
        </div>

        {/* Annual KPI Summary Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
          <div className="rounded-xl border bg-muted/30 p-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Annual Requests</span>
              <Ticket className="h-3.5 w-3.5 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {annualStats.totalRequests.toLocaleString()}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Across {months.filter(m => m.total > 0).length} recorded months
            </div>
          </div>

          <div className="rounded-xl border bg-muted/30 p-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Successful Bookings</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {annualStats.totalBooked.toLocaleString()}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {annualStats.rawConversion}% overall conversion
            </div>
          </div>

          <div className="rounded-xl border bg-muted/30 p-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Avg Success Rate</span>
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {annualStats.avgSuccessRate}%
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Excludes user cancels & pending
            </div>
          </div>

          <div className="rounded-xl border bg-muted/30 p-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Peak Month</span>
              <Flame className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 truncate">
              {annualStats.peak?.label ?? "—"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {annualStats.peak?.total ?? 0} total requests ({annualStats.peak?.booked ?? 0} booked)
            </div>
          </div>
        </div>

        {/* Legend Controls / Metric Series Toggles */}
        {viewMode === "volume" && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50 text-xs">
            <span className="text-muted-foreground font-medium mr-1 text-[11px] uppercase tracking-wider">Metrics:</span>
            
            <button
              type="button"
              onClick={() => toggleSeries("total")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${
                visibleSeries.total
                  ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-600 dark:text-indigo-400 font-medium"
                  : "bg-muted/30 border-transparent text-muted-foreground/60 line-through opacity-60"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              Total Requests
            </button>

            <button
              type="button"
              onClick={() => toggleSeries("booked")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${
                visibleSeries.booked
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-medium"
                  : "bg-muted/30 border-transparent text-muted-foreground/60 line-through opacity-60"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Successful (Booked)
            </button>

            <button
              type="button"
              onClick={() => toggleSeries("failed")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${
                visibleSeries.failed
                  ? "bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400 font-medium"
                  : "bg-muted/30 border-transparent text-muted-foreground/60 line-through opacity-60"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Failed
            </button>

            <button
              type="button"
              onClick={() => toggleSeries("cancelled")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${
                visibleSeries.cancelled
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 font-medium"
                  : "bg-muted/30 border-transparent text-muted-foreground/60 line-through opacity-60"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Cancelled
            </button>
          </div>
        )}

        {viewMode === "rate" && (
          <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-border/50 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Monthly Success Rate (%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-emerald-500/60" style={{ borderTop: "2px dashed" }} />
              Annual Average ({annualStats.avgSuccessRate}%)
            </span>
          </div>
        )}

        {viewMode === "bookingType" && (
          <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-border/50 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              Tatkal Bookings ({annualStats.totalTatkal.toLocaleString()})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              General Bookings ({annualStats.totalGeneral.toLocaleString()})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-indigo-400" />
              Total Requests
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {hasBookings ? (
          <>
            {/* Scrollable / Responsive SVG Chart */}
            <div className="overflow-x-auto pb-1">
              <div 
                className="relative mx-auto min-w-[620px] w-full"
                onMouseLeave={() => setHoveredMonthIndex(null)}
              >
                {/* Floating Interactive Hover Tooltip */}
                {hoveredMonthIndex !== null && activeMonth && (
                  <div 
                    className="pointer-events-none absolute z-30 transition-all duration-150 -translate-x-1/2 drop-shadow-xl"
                    style={{
                      left: `${Math.max(16, Math.min(84, (x(Math.max(0, activeMonthPos)) / WIDTH) * 100))}%`,
                      top: "8px"
                    }}
                  >
                    <div className="rounded-xl border border-slate-700/80 bg-slate-900/95 backdrop-blur-md p-3 text-xs text-white shadow-2xl min-w-[210px] space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-700/60 pb-1.5">
                        <span className="font-bold text-sm text-slate-100">{activeMonth.label} {year}</span>
                        {momTotalChange !== null && (
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            momTotalChange >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                          }`}>
                            {momTotalChange >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                            {momTotalChange > 0 ? `+${momTotalChange}%` : `${momTotalChange}%`}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-slate-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> Total
                          </span>
                          <span className="font-bold">{activeMonth.total}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-slate-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Booked
                          </span>
                          <span className="font-bold text-emerald-400">{activeMonth.booked}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-slate-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Failed
                          </span>
                          <span className="font-bold text-rose-400">{activeMonth.failed}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-slate-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Cancelled
                          </span>
                          <span className="font-bold text-amber-400">{activeMonth.cancelled}</span>
                        </div>
                      </div>

                      <div className="pt-1 border-t border-slate-700/60 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Success Rate:</span>
                        <span className="font-bold text-emerald-400">{activeMonth.successRate}%</span>
                      </div>

                      {(activeMonth.tatkal !== undefined || activeMonth.general !== undefined) && (
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                          <span>Tatkal: <strong className="text-purple-300 font-semibold">{activeMonth.tatkal || 0}</strong></span>
                          <span>General: <strong className="text-sky-300 font-semibold">{activeMonth.general || 0}</strong></span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <svg 
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`} 
                  className="block w-full select-none" 
                  role="img" 
                  aria-labelledby={`${chartId}-title ${chartId}-description`}
                >
                  <title id={`${chartId}-title`}>Monthly booking trends for {year}</title>
                  <desc id={`${chartId}-description`}>
                    Interactive chart displaying total requests, booked, failed, and cancelled tickets by month.
                  </desc>

                  {/* Gradient Definitions */}
                  <defs>
                    <linearGradient id={`${chartId}-grad-total`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id={`${chartId}-grad-booked`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id={`${chartId}-grad-failed`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.20" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id={`${chartId}-grad-tatkal`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.20" />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Gridlines & Y-Axis Labels */}
                  {[0, 1, 2, 3, 4].map((tick) => {
                    const tickValue = tick * tickStep;
                    const yPos = y(tickValue);
                    return (
                      <g key={tick}>
                        <line 
                          x1={LEFT} 
                          x2={WIDTH - RIGHT} 
                          y1={yPos} 
                          y2={yPos} 
                          className="stroke-border/70" 
                          strokeDasharray={tick === 0 ? undefined : "4 4"} 
                        />
                        <text 
                          x={LEFT - 12} 
                          y={yPos + 4} 
                          textAnchor="end" 
                          className="fill-muted-foreground text-[11px] font-medium"
                        >
                          {viewMode === "rate" ? `${tickValue}%` : formatCount.format(tickValue)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Benchmark line for Success Rate mode */}
                  {viewMode === "rate" && (
                    <line 
                      x1={LEFT} 
                      x2={WIDTH - RIGHT} 
                      y1={y(annualStats.avgSuccessRate)} 
                      y2={y(annualStats.avgSuccessRate)} 
                      stroke="#10b981" 
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                      opacity={0.6}
                    />
                  )}

                  {/* Active Month Spotlight Vertical Bar */}
                  {months.map((month, index) => month.monthIndex === activeMonth?.monthIndex && (
                    <rect 
                      key={month.monthIndex} 
                      x={LEFT + index * slotWidth + 2} 
                      y={TOP} 
                      width={Math.max(1, slotWidth - 4)} 
                      height={PLOT_HEIGHT} 
                      rx={8} 
                      className="fill-indigo-500/10 dark:fill-indigo-400/15" 
                    />
                  ))}

                  {/* Mode: VOLUME (Counts) */}
                  {viewMode === "volume" && (
                    <>
                      {/* Area Fills */}
                      {visibleSeries.total && (
                        <polygon 
                          points={getAreaPolygon(m => m.total)} 
                          fill={`url(#${chartId}-grad-total)`} 
                        />
                      )}
                      {visibleSeries.booked && (
                        <polygon 
                          points={getAreaPolygon(m => m.booked)} 
                          fill={`url(#${chartId}-grad-booked)`} 
                        />
                      )}

                      {/* Polylines */}
                      {visibleSeries.cancelled && (
                        <polyline 
                          points={getLinePoints(m => m.cancelled)} 
                          fill="none" 
                          strokeWidth={2} 
                          strokeLinecap="round"
                          strokeLinejoin="round" 
                          className="stroke-amber-500 dark:stroke-amber-400" 
                        />
                      )}
                      {visibleSeries.failed && (
                        <polyline 
                          points={getLinePoints(m => m.failed)} 
                          fill="none" 
                          strokeWidth={2} 
                          strokeLinecap="round"
                          strokeLinejoin="round" 
                          className="stroke-rose-500 dark:stroke-rose-400" 
                        />
                      )}
                      {visibleSeries.total && (
                        <polyline 
                          points={getLinePoints(m => m.total)} 
                          fill="none" 
                          strokeWidth={2.5} 
                          strokeLinecap="round"
                          strokeLinejoin="round" 
                          className="stroke-indigo-500 dark:stroke-indigo-400" 
                        />
                      )}
                      {visibleSeries.booked && (
                        <polyline 
                          points={getLinePoints(m => m.booked)} 
                          fill="none" 
                          strokeWidth={2.5} 
                          strokeLinecap="round"
                          strokeLinejoin="round" 
                          className="stroke-emerald-600 dark:stroke-emerald-400" 
                        />
                      )}

                      {/* Dots and Labels */}
                      {months.map((month, index) => {
                        const isCurrentActive = month.monthIndex === activeMonth?.monthIndex;
                        const isPeak = month.monthIndex === annualStats.peak?.monthIndex && visibleSeries.total;
                        return (
                          <g key={month.monthIndex}>
                            {visibleSeries.cancelled && (
                              <circle 
                                cx={x(index)} 
                                cy={y(month.cancelled)} 
                                r={isCurrentActive ? 4.5 : 2.5} 
                                className="fill-amber-500 stroke-card" 
                                strokeWidth={2} 
                              />
                            )}
                            {visibleSeries.failed && (
                              <circle 
                                cx={x(index)} 
                                cy={y(month.failed)} 
                                r={isCurrentActive ? 4.5 : 2.5} 
                                className="fill-rose-500 stroke-card" 
                                strokeWidth={2} 
                              />
                            )}
                            {visibleSeries.total && (
                              <circle 
                                cx={x(index)} 
                                cy={y(month.total)} 
                                r={isCurrentActive ? 5.5 : 3.5} 
                                className="fill-indigo-500 stroke-card dark:fill-indigo-400" 
                                strokeWidth={2} 
                              />
                            )}
                            {visibleSeries.booked && (
                              <circle 
                                cx={x(index)} 
                                cy={y(month.booked)} 
                                r={isCurrentActive ? 5.5 : 3.5} 
                                className="fill-emerald-600 stroke-card dark:fill-emerald-400" 
                                strokeWidth={2} 
                              />
                            )}

                            {/* Peak Month Indicator */}
                            {isPeak && (
                              <g transform={`translate(${x(index)}, ${y(month.total) - 12})`}>
                                <circle cx={0} cy={0} r={3} className="fill-amber-400 animate-ping" opacity={0.6} />
                              </g>
                            )}

                            {/* Active Point Glow Ring */}
                            {isCurrentActive && visibleSeries.booked && (
                              <circle 
                                cx={x(index)} 
                                cy={y(month.booked)} 
                                r={9} 
                                fill="none" 
                                stroke="#10b981" 
                                strokeWidth={1.5} 
                                opacity={0.5} 
                              />
                            )}

                            <text 
                              x={x(index)} 
                              y={HEIGHT - 12} 
                              textAnchor="middle" 
                              className={`text-[12px] font-medium transition-colors ${
                                isCurrentActive ? "fill-foreground font-bold" : "fill-muted-foreground"
                              }`}
                            >
                              {month.label}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  )}

                  {/* Mode: SUCCESS RATE */}
                  {viewMode === "rate" && (
                    <>
                      <polygon 
                        points={getAreaPolygon(m => m.successRate)} 
                        fill={`url(#${chartId}-grad-booked)`} 
                      />
                      <polyline 
                        points={getLinePoints(m => m.successRate)} 
                        fill="none" 
                        strokeWidth={3} 
                        strokeLinecap="round"
                        strokeLinejoin="round" 
                        className="stroke-emerald-500 dark:stroke-emerald-400" 
                      />
                      {months.map((month, index) => {
                        const isCurrentActive = month.monthIndex === activeMonth?.monthIndex;
                        return (
                          <g key={month.monthIndex}>
                            <circle 
                              cx={x(index)} 
                              cy={y(month.successRate)} 
                              r={isCurrentActive ? 6 : 4} 
                              className="fill-emerald-500 stroke-card" 
                              strokeWidth={2} 
                            />
                            {isCurrentActive && (
                              <circle 
                                cx={x(index)} 
                                cy={y(month.successRate)} 
                                r={10} 
                                fill="none" 
                                stroke="#10b981" 
                                strokeWidth={1.5} 
                                opacity={0.5} 
                              />
                            )}
                            <text 
                              x={x(index)} 
                              y={HEIGHT - 12} 
                              textAnchor="middle" 
                              className={`text-[12px] font-medium ${
                                isCurrentActive ? "fill-foreground font-bold" : "fill-muted-foreground"
                              }`}
                            >
                              {month.label}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  )}

                  {/* Mode: TATKAL VS GENERAL */}
                  {viewMode === "bookingType" && (
                    <>
                      <polygon 
                        points={getAreaPolygon(m => m.tatkal || 0)} 
                        fill={`url(#${chartId}-grad-tatkal)`} 
                      />
                      <polyline 
                        points={getLinePoints(m => m.total)} 
                        fill="none" 
                        strokeWidth={1.5} 
                        strokeDasharray="4 4"
                        strokeLinecap="round"
                        strokeLinejoin="round" 
                        className="stroke-indigo-400 opacity-60" 
                      />
                      <polyline 
                        points={getLinePoints(m => m.tatkal || 0)} 
                        fill="none" 
                        strokeWidth={2.5} 
                        strokeLinecap="round"
                        strokeLinejoin="round" 
                        className="stroke-purple-500 dark:stroke-purple-400" 
                      />
                      <polyline 
                        points={getLinePoints(m => m.general || 0)} 
                        fill="none" 
                        strokeWidth={2.5} 
                        strokeLinecap="round"
                        strokeLinejoin="round" 
                        className="stroke-sky-500 dark:stroke-sky-400" 
                      />
                      {months.map((month, index) => {
                        const isCurrentActive = month.monthIndex === activeMonth?.monthIndex;
                        return (
                          <g key={month.monthIndex}>
                            <circle 
                              cx={x(index)} 
                              cy={y(month.tatkal || 0)} 
                              r={isCurrentActive ? 5.5 : 3.5} 
                              className="fill-purple-500 stroke-card" 
                              strokeWidth={2} 
                            />
                            <circle 
                              cx={x(index)} 
                              cy={y(month.general || 0)} 
                              r={isCurrentActive ? 5.5 : 3.5} 
                              className="fill-sky-500 stroke-card" 
                              strokeWidth={2} 
                            />
                            <text 
                              x={x(index)} 
                              y={HEIGHT - 12} 
                              textAnchor="middle" 
                              className={`text-[12px] font-medium ${
                                isCurrentActive ? "fill-foreground font-bold" : "fill-muted-foreground"
                              }`}
                            >
                              {month.label}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  )}
                </svg>

                {/* Keyboard & Mouse Accessible Interactive Columns */}
                <div 
                  className="absolute inset-0" 
                  role="group" 
                  aria-label="Select a month for booking details"
                >
                  {months.map((month, index) => (
                    <button
                      key={month.monthIndex}
                      type="button"
                      className="absolute inset-y-0 cursor-pointer rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
                      style={{ 
                        left: `${((LEFT + index * slotWidth) / WIDTH) * 100}%`, 
                        width: `${(slotWidth / WIDTH) * 100}%` 
                      }}
                      aria-pressed={month.monthIndex === activeMonth?.monthIndex}
                      onMouseEnter={() => setHoveredMonthIndex(month.monthIndex)}
                      onFocus={() => {
                        setSelectedMonthIndex(month.monthIndex);
                        setHoveredMonthIndex(month.monthIndex);
                      }}
                      onClick={() => setSelectedMonthIndex(month.monthIndex)}
                    >
                      <span className="sr-only">
                        {month.label} {year}: {month.booked} booked out of {month.total} requests ({month.successRate}% rate)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected Month Deep Inspector Panel */}
            {activeMonth && (
              <div className="rounded-2xl border bg-muted/40 p-4 shadow-xs transition-all space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/50 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-foreground">
                      {activeMonth.label} {year} Deep Breakdown
                    </span>
                    {activeMonth.monthIndex === currentMonthIndex && (
                      <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400">
                        Current Month
                      </span>
                    )}
                  </div>

                  {/* MoM trend indicators */}
                  <div className="flex items-center gap-3 text-xs">
                    {momTotalChange !== null ? (
                      <span className={`inline-flex items-center gap-1 font-semibold ${
                        momTotalChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      }`}>
                        {momTotalChange >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {momTotalChange > 0 ? `+${momTotalChange}%` : `${momTotalChange}%`} requests
                        {momBookedChange !== null && (
                          <span className="text-muted-foreground font-normal">
                            ({momBookedChange >= 0 ? `+${momBookedChange}%` : `${momBookedChange}%`} booked)
                          </span>
                        )}
                        <span>vs {previousMonth?.label}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">
                        {activeMonthPos === 0 ? "First recorded month of year" : "No bookings in previous month"}
                      </span>
                    )}
                  </div>
                </div>

                {/* 6-Card Detailed Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  <div className="rounded-xl border bg-background/60 p-2.5 flex flex-col justify-between">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-indigo-500" />
                      Total Requests
                    </span>
                    <span className="text-xl font-bold text-foreground mt-1">
                      {activeMonth.total.toLocaleString()}
                    </span>
                  </div>

                  <div className="rounded-xl border bg-background/60 p-2.5 flex flex-col justify-between">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Successful (Booked)
                    </span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                        {activeMonth.booked.toLocaleString()}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        ({activeMonth.total > 0 ? Math.round((activeMonth.booked / activeMonth.total) * 100) : 0}%)
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background/60 p-2.5 flex flex-col justify-between">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                      Success Rate
                    </span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-xl font-bold text-foreground">
                        {activeMonth.successRate}%
                      </span>
                      <span className="text-[10px] text-muted-foreground" title="Excludes cancelled & pending">
                        adjusted
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background/60 p-2.5 flex flex-col justify-between">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      Failed Requests
                    </span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-xl font-bold text-rose-600 dark:text-rose-400">
                        {activeMonth.failed.toLocaleString()}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        ({activeMonth.total > 0 ? Math.round((activeMonth.failed / activeMonth.total) * 100) : 0}%)
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background/60 p-2.5 flex flex-col justify-between">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Cancelled
                    </span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-xl font-bold text-amber-600 dark:text-amber-400">
                        {activeMonth.cancelled.toLocaleString()}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        ({activeMonth.total > 0 ? Math.round((activeMonth.cancelled / activeMonth.total) * 100) : 0}%)
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background/60 p-2.5 flex flex-col justify-between">
                    <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-blue-400" />
                      Pending Requests
                    </span>
                    <span className="text-xl font-bold text-foreground mt-1">
                      {activeMonth.pending.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Additional Details Footer: Channels & Passengers */}
                <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 pt-1 text-xs text-muted-foreground border-t border-border/40">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <Train className="h-3.5 w-3.5 text-purple-400" />
                      Tatkal: <strong className="text-foreground">{activeMonth.tatkal || 0}</strong>
                      {activeMonth.total > 0 && ` (${Math.round(((activeMonth.tatkal || 0) / activeMonth.total) * 100)}%)`}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Train className="h-3.5 w-3.5 text-sky-400" />
                      General: <strong className="text-foreground">{activeMonth.general || 0}</strong>
                      {activeMonth.total > 0 && ` (${Math.round(((activeMonth.general || 0) / activeMonth.total) * 100)}%)`}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-indigo-400" />
                      Total Passengers: <strong className="text-foreground">{activeMonth.passengers || activeMonth.total}</strong>
                    </span>
                    {activeMonth.bookedPassengers !== undefined && (
                      <span className="text-[11px]">
                        ({activeMonth.bookedPassengers} boarded)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Screen Reader Accessible Table */}
            <table className="sr-only">
              <caption>Monthly booking progress breakdown for {year}.</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Total</th>
                  <th scope="col">Booked</th>
                  <th scope="col">Failed</th>
                  <th scope="col">Cancelled</th>
                  <th scope="col">Pending</th>
                  <th scope="col">Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.monthIndex}>
                    <th scope="row">{month.label} {year}</th>
                    <td>{month.total}</td>
                    <td>{month.booked}</td>
                    <td>{month.failed}</td>
                    <td>{month.cancelled}</td>
                    <td>{month.pending}</td>
                    <td>{month.successRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No bookings recorded for {year} yet. Progress graphs will appear here as bookings are created.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
