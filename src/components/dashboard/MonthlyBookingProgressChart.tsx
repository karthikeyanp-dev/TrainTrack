"use client";

import { useId, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface MonthlyBookingProgress {
  label: string;
  monthIndex: number;
  total: number;
  booked: number;
}

interface MonthlyBookingProgressChartProps {
  months: MonthlyBookingProgress[];
  year: number;
  currentMonthIndex: number;
}

const WIDTH = 720;
const HEIGHT = 260;
const LEFT = 48;
const RIGHT = 16;
const TOP = 20;
const BOTTOM = 36;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;
const formatCount = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function MonthlyBookingProgressChart({ months, year, currentMonthIndex }: MonthlyBookingProgressChartProps) {
  const chartId = useId();
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);
  const selectedMonth = months.find((month) => month.monthIndex === selectedMonthIndex)
    ?? months.find((month) => month.monthIndex === currentMonthIndex)
    ?? months[months.length - 1];
  const hasBookings = months.some((month) => month.total > 0);

  // Integer ticks keep small booking counts readable and avoid a zero-height scale.
  const maximum = Math.max(1, ...months.map((month) => month.total));
  const tickStep = Math.ceil(maximum / 4);
  const axisMaximum = tickStep * 4;
  const slotWidth = PLOT_WIDTH / Math.max(1, months.length);
  const x = (index: number) => LEFT + slotWidth * (index + 0.5);
  const y = (count: number) => TOP + PLOT_HEIGHT * (1 - count / axisMaximum);
  const points = (field: "total" | "booked") => months.map((month, index) => `${x(index)},${y(month[field])}`).join(" ");
  const bookedShare = selectedMonth && selectedMonth.total > 0
    ? `${Math.round(selectedMonth.booked / selectedMonth.total * 100)}%`
    : "—";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">Monthly Booking Progress</CardTitle>
          <span className="text-sm font-medium text-muted-foreground">{year}</span>
        </div>
        <CardDescription>Successful bookings compared with all requests, by Book by month.</CardDescription>
        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-5 bg-indigo-500 dark:bg-indigo-400" aria-hidden="true" />
            Total bookings
          </span>
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-5 bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
            Successful bookings
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {hasBookings ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">Hover, tap, or focus a month for details. Scroll on smaller screens.</p>
            <div className="overflow-x-auto">
              <div className="relative mx-auto min-w-[600px] max-w-4xl">
                <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block w-full" role="img" aria-labelledby={`${chartId}-title ${chartId}-description`}>
                  <title id={`${chartId}-title`}>Monthly total and successful bookings for {year}</title>
                  <desc id={`${chartId}-description`}>The indigo line shows total bookings. The green line shows bookings with Booked status. Select a month below to read its counts and booked percentage.</desc>
                  {[0, 1, 2, 3, 4].map((tick) => (
                    <g key={tick}>
                      <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(tick * tickStep)} y2={y(tick * tickStep)} className="stroke-border" strokeDasharray={tick === 0 ? undefined : "4 4"} />
                      <text x={LEFT - 10} y={y(tick * tickStep) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{formatCount.format(tick * tickStep)}</text>
                    </g>
                  ))}
                  {months.map((month, index) => month.monthIndex === selectedMonth?.monthIndex && (
                    <rect key={month.monthIndex} x={LEFT + index * slotWidth} y={TOP} width={slotWidth} height={PLOT_HEIGHT} rx={6} className="fill-muted/60" />
                  ))}
                  <polyline points={points("total")} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-indigo-500 dark:stroke-indigo-400" />
                  <polyline points={points("booked")} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-emerald-600 dark:stroke-emerald-400" />
                  {months.map((month, index) => (
                    <g key={month.monthIndex}>
                      <circle cx={x(index)} cy={y(month.total)} r={month.monthIndex === selectedMonth?.monthIndex ? 5 : 3} className="fill-indigo-500 stroke-card dark:fill-indigo-400" strokeWidth={2} />
                      <circle cx={x(index)} cy={y(month.booked)} r={month.monthIndex === selectedMonth?.monthIndex ? 5 : 3} className="fill-emerald-600 stroke-card dark:fill-emerald-400" strokeWidth={2} />
                      <text x={x(index)} y={HEIGHT - 12} textAnchor="middle" className="fill-muted-foreground text-[12px]">{month.label}</text>
                    </g>
                  ))}
                </svg>
                <div className="absolute inset-0" role="group" aria-label="Select a month for booking details">
                  {months.map((month, index) => (
                    <button
                      key={month.monthIndex}
                      type="button"
                      className="absolute inset-y-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
                      style={{ left: `${(LEFT + index * slotWidth) / WIDTH * 100}%`, width: `${slotWidth / WIDTH * 100}%` }}
                      aria-pressed={month.monthIndex === selectedMonth?.monthIndex}
                      onMouseEnter={() => setSelectedMonthIndex(month.monthIndex)}
                      onFocus={() => setSelectedMonthIndex(month.monthIndex)}
                      onClick={() => setSelectedMonthIndex(month.monthIndex)}
                    >
                      <span className="sr-only">{month.label} {year}: {month.booked} successful of {month.total} total bookings{month.total > 0 ? `, ${Math.round(month.booked / month.total * 100)}% booked` : ", no bookings"}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {selectedMonth && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-muted/50 px-4 py-3 text-sm">
                <span className="font-semibold">{selectedMonth.label} {year}</span>
                <span className="text-muted-foreground">Total <strong className="text-foreground">{selectedMonth.total.toLocaleString()}</strong></span>
                <span className="text-muted-foreground">Successful <strong className="text-emerald-600 dark:text-emerald-400">{selectedMonth.booked.toLocaleString()}</strong></span>
                <span className="text-muted-foreground">Booked / total <strong className="text-foreground">{bookedShare}</strong></span>
              </div>
            )}
            <table className="sr-only">
              <caption>Monthly booking progress for {year}. Booked percentage includes pending and cancelled requests in the total.</caption>
              <thead><tr><th scope="col">Month</th><th scope="col">Total</th><th scope="col">Successful</th><th scope="col">Booked / total</th></tr></thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.monthIndex}>
                    <th scope="row">{month.label} {year}</th><td>{month.total}</td><td>{month.booked}</td><td>{month.total > 0 ? `${Math.round(month.booked / month.total * 100)}%` : "No bookings"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">No bookings for {year} yet. Monthly progress will appear here as requests are added.</p>
        )}
      </CardContent>
    </Card>
  );
}
