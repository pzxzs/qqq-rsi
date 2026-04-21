"use client";

import { useEffect, useMemo, useState } from "react";

type DailyRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type WeeklyRow = {
  mondayDate: string;
  weekEndDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type WeeklyRSIRow = WeeklyRow & {
  rsi: number | null;
};

type ModeType = "공격모드" | "안전모드";

type WeeklyModeRow = {
  mondayDate: string;
  basedOnFriday: string;
  close: number;
  rsi: number;
  mode: ModeType | null;
};

type ChartPoint = {
  x: number;
  y: number;
};

type DailyChartRow = DailyRow & {
  mondayDate: string;
  mode: ModeType | null;
};

const RSI_CHART_WIDTH = 820;
const RSI_CHART_HEIGHT = 220;
const PRICE_CHART_WIDTH = 820;
const PRICE_CHART_HEIGHT = 240;

function formatDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function getMondayOfWeek(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.getDay(); // 0:일 ~ 6:토
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return formatDate(date);
}

function getNextMondayFromFriday(fridayDate: string) {
  return addDays(fridayDate, 3);
}

function aggregateDailyToWeekly(rows: DailyRow[]): WeeklyRow[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map<string, WeeklyRow>();

  for (const row of sorted) {
    const mondayDate = getMondayOfWeek(row.date);

    if (!map.has(mondayDate)) {
      map.set(mondayDate, {
        mondayDate,
        weekEndDate: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      });
    } else {
      const current = map.get(mondayDate)!;
      current.high = Math.max(current.high, row.high);
      current.low = Math.min(current.low, row.low);
      current.close = row.close;
      current.weekEndDate = row.date;
      current.volume += row.volume;
    }
  }

  return [...map.values()].sort((a, b) => a.weekEndDate.localeCompare(b.weekEndDate));
}

function calculateCutlerRSI(rows: WeeklyRow[], length = 14): WeeklyRSIRow[] {
  const closes = rows.map((r) => r.close);
  const changes = closes.map((close, i) => (i === 0 ? null : close - closes[i - 1]));
  const gains = changes.map((v) => (v == null ? null : Math.max(v, 0)));
  const losses = changes.map((v) => (v == null ? null : Math.max(-v, 0)));

  return rows.map((row, i) => {
    if (i < length) {
      return { ...row, rsi: null };
    }

    const gainSlice = gains.slice(i - length + 1, i + 1);
    const lossSlice = losses.slice(i - length + 1, i + 1);

    const avgGain =
      gainSlice.reduce<number>((sum, v) => sum + (v ?? 0), 0) / length;
    const avgLoss =
      lossSlice.reduce<number>((sum, v) => sum + (v ?? 0), 0) / length;

    let rsi: number;
    if (avgGain === 0 && avgLoss === 0) {
      rsi = 50;
    } else if (avgLoss === 0) {
      rsi = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi = 100 - 100 / (1 + rs);
    }

    return {
      ...row,
      rsi: Number(rsi.toFixed(2)),
    };
  });
}

function getTriggeredMode(
  twoWeeksAgoRsi: number,
  lastWeekRsi: number
): ModeType | null {
  const isUp = lastWeekRsi > twoWeeksAgoRsi;
  const isDown = lastWeekRsi < twoWeeksAgoRsi;

  if (
    (twoWeeksAgoRsi < 50 && lastWeekRsi > 50) ||
    (twoWeeksAgoRsi >= 50 && twoWeeksAgoRsi <= 60 && isUp) ||
    (twoWeeksAgoRsi <= 35 && isUp)
  ) {
    return "공격모드";
  }

  if (
    (twoWeeksAgoRsi >= 65 && isDown) ||
    (twoWeeksAgoRsi >= 40 && twoWeeksAgoRsi <= 50 && isDown) ||
    (twoWeeksAgoRsi >= 50 && lastWeekRsi < 50)
  ) {
    return "안전모드";
  }

  return null;
}

function getModeColorClass(mode: ModeType | null) {
  if (mode === "공격모드") return "text-red-600";
  if (mode === "안전모드") return "text-green-600";
  return "text-gray-400";
}

function getModePointColor(mode: ModeType | null) {
  if (mode === "공격모드") return "#dc2626";
  if (mode === "안전모드") return "#16a34a";
  return "#94a3b8";
}

function buildLinePath(values: number[], width: number, height: number) {
  if (values.length === 0) return "";

  const points = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width;
    const y = height - (v / 100) * height;
    return `${x},${y}`;
  });

  return `M ${points.join(" L ")}`;
}

function buildRSIChartPoints(values: number[], width: number, height: number): ChartPoint[] {
  return values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width;
    const y = height - (v / 100) * height;
    return { x, y };
  });
}

function buildPriceChartPoints(values: number[], width: number, height: number): ChartPoint[] {
  if (values.length === 0) return [];

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = (maxValue - minValue) * 0.05 || 1;
  const minYValue = minValue - padding;
  const maxYValue = maxValue + padding;

  return values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width;
    const y = height - ((v - minYValue) / (maxYValue - minYValue)) * height;
    return { x, y };
  });
}

function getEvenlySpacedLabels<T>(items: T[], count: number) {
  if (items.length === 0) return [];
  if (items.length <= count) {
    return items.map((item, index) => ({ item, index }));
  }

  const result: { item: T; index: number }[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round((i * (items.length - 1)) / (count - 1));
    result.push({ item: items[index], index });
  }
  return result;
}

export default function HomePage() {
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/qqq");
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.detail || data?.error || "데이터를 불러오지 못했습니다.");
        }

        if (!cancelled) {
          setRows(data.rows || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "알 수 없는 오류");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const weeklyRows = useMemo(() => aggregateDailyToWeekly(rows), [rows]);

  const weeklyRSI = useMemo(() => {
    return calculateCutlerRSI(weeklyRows, 14).filter((row) => row.rsi !== null);
  }, [weeklyRows]);

  const modeHistory = useMemo<WeeklyModeRow[]>(() => {
    if (weeklyRSI.length < 2) return [];

    const result: WeeklyModeRow[] = [];
    let activeMode: ModeType | null = null;

    for (let i = 1; i < weeklyRSI.length; i++) {
      const twoWeeksAgo = weeklyRSI[i - 1];
      const lastWeek = weeklyRSI[i];

      const triggeredMode = getTriggeredMode(
        twoWeeksAgo.rsi as number,
        lastWeek.rsi as number
      );

      if (triggeredMode !== null) {
        activeMode = triggeredMode;
      }

      result.push({
        mondayDate: getNextMondayFromFriday(lastWeek.weekEndDate),
        basedOnFriday: lastWeek.weekEndDate,
        close: lastWeek.close,
        rsi: lastWeek.rsi as number,
        mode: activeMode,
      });
    }

    return result;
  }, [weeklyRSI]);

  const validModeHistory = useMemo(
    () => modeHistory.filter((row) => row.mode !== null),
    [modeHistory]
  );

  const latestWeeklyRSI = weeklyRSI.at(-1) ?? null;
  const currentModeRow = validModeHistory.at(-1) ?? null;
  const currentWeekMode = currentModeRow?.mode ?? null;
  const currentMondayDate = currentModeRow?.mondayDate ?? "-";

  const rsiChartRows = validModeHistory.slice(-50);
  const rsiChartValues = rsiChartRows.map((row) => row.rsi);
  const rsiChartPath = buildLinePath(
    rsiChartValues,
    RSI_CHART_WIDTH,
    RSI_CHART_HEIGHT
  );
  const rsiChartPoints = buildRSIChartPoints(
    rsiChartValues,
    RSI_CHART_WIDTH,
    RSI_CHART_HEIGHT
  );
  const rsiXAxisTicks = getEvenlySpacedLabels(rsiChartRows, 6);

  const modeMap = useMemo(() => {
    const map = new Map<string, ModeType | null>();
    for (const row of validModeHistory) {
      map.set(row.mondayDate, row.mode);
    }
    return map;
  }, [validModeHistory]);

  const visibleMondaySet = new Set(rsiChartRows.map((row) => row.mondayDate));

  const dailyChartRows = useMemo<DailyChartRow[]>(() => {
    return rows
      .map((row) => {
        const mondayDate = getMondayOfWeek(row.date);
        return {
          ...row,
          mondayDate,
          mode: modeMap.get(mondayDate) ?? null,
        };
      })
      .filter((row) => visibleMondaySet.has(row.mondayDate));
  }, [rows, modeMap, visibleMondaySet]);

  const dailyChartValues = dailyChartRows.map((row) => row.close);
  const dailyChartPath = (() => {
    const points = buildPriceChartPoints(
      dailyChartValues,
      PRICE_CHART_WIDTH,
      PRICE_CHART_HEIGHT
    );
    if (points.length === 0) return "";
    return `M ${points.map((p) => `${p.x},${p.y}`).join(" L ")}`;
  })();
  const dailyChartPoints = buildPriceChartPoints(
    dailyChartValues,
    PRICE_CHART_WIDTH,
    PRICE_CHART_HEIGHT
  );
  const dailyXAxisTicks = getEvenlySpacedLabels(dailyChartRows, 8);

  const priceMin = dailyChartValues.length ? Math.min(...dailyChartValues) : 0;
  const priceMax = dailyChartValues.length ? Math.max(...dailyChartValues) : 0;
  const pricePadding = (priceMax - priceMin) * 0.05 || 1;
  const priceBottom = Math.floor(priceMin - pricePadding);
  const priceTop = Math.ceil(priceMax + pricePadding);
  const priceMiddle = Math.round((priceTop + priceBottom) / 2);

  const priceToY = (price: number) => {
    const minValue = priceBottom;
    const maxValue = priceTop;
    return (
      PRICE_CHART_HEIGHT -
      ((price - minValue) / (maxValue - minValue)) * PRICE_CHART_HEIGHT
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold">QQQ 주봉 Cutler RSI</h1>
        <p className="mt-2 text-sm text-slate-600">
          전전주·전주 RSI를 기준으로, 다음 월요일부터 적용되는 주간 매매 모드를 표시한다.
        </p>

        {loading ? (
          <div className="mt-8 rounded-2xl border bg-white p-6">불러오는 중...</div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            오류: {error}
          </div>
        ) : (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="text-sm text-slate-500">종목</div>
                <div className="mt-2 text-2xl font-semibold">QQQ</div>
              </div>

              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="text-sm text-slate-500">현재 주간 시작일(월)</div>
                <div className="mt-2 text-2xl font-semibold">{currentMondayDate}</div>
              </div>

              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="text-sm text-slate-500">전주 확정 RSI(직전 금요일)</div>
                <div className="mt-2 text-2xl font-semibold">
                  {latestWeeklyRSI ? latestWeeklyRSI.rsi : "-"}
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="text-sm text-slate-500">현재 주간 모드</div>
                <div className={`mt-2 text-2xl font-semibold ${getModeColorClass(currentWeekMode)}`}>
                  {currentWeekMode ?? "-"}
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">최근 50주 RSI 차트</h2>

              <div className="mt-4 overflow-x-auto">
                <svg viewBox="0 0 920 320" className="h-[320px] w-full min-w-[920px]">
                  <line x1="60" y1="64" x2="880" y2="64" stroke="#cbd5e1" strokeDasharray="4 4" />
                  <line x1="60" y1="108" x2="880" y2="108" stroke="#cbd5e1" strokeDasharray="4 4" />
                  <line x1="60" y1="152" x2="880" y2="152" stroke="#cbd5e1" strokeDasharray="4 4" />

                  <text x="25" y="68" fontSize="12" fill="#64748b">70</text>
                  <text x="25" y="112" fontSize="12" fill="#64748b">50</text>
                  <text x="25" y="156" fontSize="12" fill="#64748b">30</text>

                  {rsiXAxisTicks.map(({ item, index }) => {
                    const x =
                      60 +
                      (index / Math.max(rsiXAxisTicks.length - 1, 1)) * RSI_CHART_WIDTH;
                    return (
                      <text
                        key={`rsi-x-${item.mondayDate}-${index}`}
                        x={x}
                        y="295"
                        fontSize="12"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        {item.mondayDate}
                      </text>
                    );
                  })}

                  <g transform="translate(60, 20)">
                    <path d={rsiChartPath} fill="none" stroke="#0f172a" strokeWidth="2.5" />

                    {rsiChartPoints.map((point, index) => {
                      const row = rsiChartRows[index];
                      const pointColor = getModePointColor(row.mode);

                      return (
                        <g key={`${row.mondayDate}-${index}`}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="3.5"
                            fill={pointColor}
                            stroke="#ffffff"
                            strokeWidth="1.2"
                          />
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="8"
                            fill="transparent"
                          >
                            <title>{`${row.mondayDate} | RSI ${row.rsi} | ${row.mode ?? "-"}`}</title>
                          </circle>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>

              <div className="mt-3 flex flex-wrap gap-6 text-sm text-slate-500">
                <span>기준선: 70 / 50 / 30</span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-red-600" />
                  공격모드
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-green-600" />
                  안전모드
                </span>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">QQQ 일봉 차트 (최근 50주 구간)</h2>

              <div className="mt-4 overflow-x-auto">
                <svg viewBox="0 0 920 340" className="h-[340px] w-full min-w-[920px]">
                  <line
                    x1="60"
                    y1={20 + priceToY(priceTop)}
                    x2="880"
                    y2={20 + priceToY(priceTop)}
                    stroke="#cbd5e1"
                    strokeDasharray="4 4"
                  />
                  <line
                    x1="60"
                    y1={20 + priceToY(priceMiddle)}
                    x2="880"
                    y2={20 + priceToY(priceMiddle)}
                    stroke="#cbd5e1"
                    strokeDasharray="4 4"
                  />
                  <line
                    x1="60"
                    y1={20 + priceToY(priceBottom)}
                    x2="880"
                    y2={20 + priceToY(priceBottom)}
                    stroke="#cbd5e1"
                    strokeDasharray="4 4"
                  />

                  <text x="10" y={24 + priceToY(priceTop)} fontSize="12" fill="#64748b">
                    {priceTop}
                  </text>
                  <text x="10" y={24 + priceToY(priceMiddle)} fontSize="12" fill="#64748b">
                    {priceMiddle}
                  </text>
                  <text x="10" y={24 + priceToY(priceBottom)} fontSize="12" fill="#64748b">
                    {priceBottom}
                  </text>

                  {dailyXAxisTicks.map(({ item, index }) => {
                    const x =
                      60 +
                      (index / Math.max(dailyXAxisTicks.length - 1, 1)) *
                        PRICE_CHART_WIDTH;
                    return (
                      <text
                        key={`daily-x-${item.date}-${index}`}
                        x={x}
                        y="315"
                        fontSize="12"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        {item.date}
                      </text>
                    );
                  })}

                  <g transform="translate(60, 20)">
                    <path d={dailyChartPath} fill="none" stroke="#0f172a" strokeWidth="1.8" />

                    {dailyChartPoints.map((point, index) => {
                      const row = dailyChartRows[index];
                      const pointColor = getModePointColor(row.mode);

                      return (
                        <g key={`${row.date}-${index}`}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="2.6"
                            fill={pointColor}
                            stroke="#ffffff"
                            strokeWidth="0.8"
                          />
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="7"
                            fill="transparent"
                          >
                            <title>{`${row.date} | 종가 ${row.close.toFixed(2)} | ${row.mode ?? "-"}`}</title>
                          </circle>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>

              <div className="mt-3 flex flex-wrap gap-6 text-sm text-slate-500">
                <span>최근 50주에 해당하는 일봉 구간</span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-red-600" />
                  공격모드
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-green-600" />
                  안전모드
                </span>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">주간 모드 히스토리 (최근 50주)</h2>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-100 text-left">
                      <th className="px-4 py-3">주간 시작일(월)</th>
                      <th className="px-4 py-3">기준 RSI 계산일(전주 금)</th>
                      <th className="px-4 py-3">종가</th>
                      <th className="px-4 py-3">RSI</th>
                      <th className="px-4 py-3">그 주간 모드</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...validModeHistory]
                      .slice(-50)
                      .reverse()
                      .map((row) => (
                        <tr key={`mode-${row.mondayDate}`} className="border-b last:border-0">
                          <td className="px-4 py-3">{row.mondayDate}</td>
                          <td className="px-4 py-3">{row.basedOnFriday}</td>
                          <td className="px-4 py-3">{row.close.toFixed(2)}</td>
                          <td className="px-4 py-3">{row.rsi}</td>
                          <td className={`px-4 py-3 font-semibold ${getModeColorClass(row.mode)}`}>
                            {row.mode}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}