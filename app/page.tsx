"use client";

import { useEffect, useMemo, useState } from "react";

type WeeklyRow = {
  date: string; // API에서 받는 금요일 날짜
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
  mondayDate: string; // 실제 적용 주간의 월요일
  basedOnFriday: string; // 직전 금요일(전주)
  close: number; // 직전 금요일 종가
  rsi: number; // 직전 금요일 RSI
  mode: ModeType | null; // 해당 월요일 주간 모드
};

type ChartPoint = {
  x: number;
  y: number;
  value: number;
};

function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getNextMondayFromFriday(fridayDate: string) {
  return addDays(fridayDate, 3);
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

function buildLinePath(values: number[], width: number, height: number) {
  if (values.length === 0) return "";

  const points = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width;
    const y = height - (v / 100) * height;
    return `${x},${y}`;
  });

  return `M ${points.join(" L ")}`;
}

function buildChartPoints(values: number[], width: number, height: number): ChartPoint[] {
  return values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width;
    const y = height - (v / 100) * height;
    return { x, y, value: v };
  });
}

/**
 * 월요일 주간 모드를 결정할 때 쓰는 비교 기준:
 * - twoWeeksAgoRsi = 전전주 금요일 RSI
 * - lastWeekRsi    = 전주 금요일 RSI
 */
function getTriggeredMode(
  twoWeeksAgoRsi: number,
  lastWeekRsi: number
): ModeType | null {
  const isUp = lastWeekRsi > twoWeeksAgoRsi;
  const isDown = lastWeekRsi < twoWeeksAgoRsi;

  // 공격모드 전환
  if (
    (twoWeeksAgoRsi < 50 && lastWeekRsi > 50) || // 이전 RSI가 50 미만에서 50 초과로 상승 돌파
    (twoWeeksAgoRsi >= 50 && twoWeeksAgoRsi <= 60 && isUp) || // 이전 RSI가 50~60 사이에서 상승 전환
    (twoWeeksAgoRsi <= 35 && isUp) // 이전 RSI가 35 이하에서 상승 전환
  ) {
    return "공격모드";
  }

  // 안전모드 전환
  if (
    (twoWeeksAgoRsi >= 65 && isDown) || // 이전 RSI가 65 이상에서 하락 전환
    (twoWeeksAgoRsi >= 40 && twoWeeksAgoRsi <= 50 && isDown) || // 이전 RSI가 40~50 사이에서 하락 전환
    (twoWeeksAgoRsi >= 50 && lastWeekRsi < 50) // 이전 RSI가 50 이상에서 50 미만으로 하락 돌파
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
  if (mode === "공격모드") return "#dc2626"; // red-600
  if (mode === "안전모드") return "#16a34a"; // green-600
  return "#94a3b8"; // slate-400
}

export default function HomePage() {
  const [rows, setRows] = useState<WeeklyRow[]>([]);
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

  const weeklyRSI = useMemo(() => {
    return calculateCutlerRSI(rows, 14).filter((row) => row.rsi !== null);
  }, [rows]);

  /**
   * modeHistory의 각 행은 "월요일 기준 주간 모드"
   * 예:
   * - weeklyRSI[i - 1] = 전전주 금요일 RSI
   * - weeklyRSI[i]     = 전주 금요일 RSI
   * - 그 비교 결과로 weeklyRSI[i] 다음 월요일 주간 모드를 결정
   */
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
        mondayDate: getNextMondayFromFriday(lastWeek.date),
        basedOnFriday: lastWeek.date,
        close: lastWeek.close,
        rsi: lastWeek.rsi as number,
        mode: activeMode,
      });
    }

    return result;
  }, [weeklyRSI]);

  const latestRSI = weeklyRSI.at(-1) ?? null;
  const currentModeRow = modeHistory.at(-1) ?? null;
  const currentWeekMode = currentModeRow?.mode ?? null;
  const currentMondayDate = currentModeRow?.mondayDate ?? "-";

  const chartModeRows = modeHistory.slice(-40);
  const chartValues = chartModeRows.map((row) => row.rsi);
  const chartPath = buildLinePath(chartValues, 740, 220);
  const chartPoints = buildChartPoints(chartValues, 740, 220);

  const firstChartMonday = chartModeRows[0]?.mondayDate ?? "";
  const middleChartMonday =
    chartModeRows[Math.floor(chartModeRows.length / 2)]?.mondayDate ?? "";
  const lastChartMonday = chartModeRows[chartModeRows.length - 1]?.mondayDate ?? "";

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
                  {latestRSI ? latestRSI.rsi : "-"}
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
              <h2 className="text-xl font-semibold">최근 40주 RSI 차트</h2>

              <div className="mt-4 overflow-x-auto">
                <svg viewBox="0 0 820 300" className="h-[300px] w-full min-w-[820px]">
                  {/* Y축 기준선 */}
                  <line x1="50" y1="66" x2="790" y2="66" stroke="#cbd5e1" strokeDasharray="4 4" />
                  <line x1="50" y1="110" x2="790" y2="110" stroke="#cbd5e1" strokeDasharray="4 4" />
                  <line x1="50" y1="154" x2="790" y2="154" stroke="#cbd5e1" strokeDasharray="4 4" />

                  {/* Y축 라벨 */}
                  <text x="18" y="70" fontSize="12" fill="#64748b">70</text>
                  <text x="18" y="114" fontSize="12" fill="#64748b">50</text>
                  <text x="18" y="158" fontSize="12" fill="#64748b">30</text>

                  {/* X축 날짜 */}
                  {chartModeRows.length > 0 && (
                    <>
                      <text x="50" y="285" fontSize="12" fill="#64748b">
                        {firstChartMonday}
                      </text>
                      <text x="350" y="285" fontSize="12" fill="#64748b">
                        {middleChartMonday}
                      </text>
                      <text x="670" y="285" fontSize="12" fill="#64748b">
                        {lastChartMonday}
                      </text>
                    </>
                  )}

                  {/* 그래프 영역 */}
                  <g transform="translate(50, 0)">
                    <path d={chartPath} fill="none" stroke="#0f172a" strokeWidth="2.5" />

                    {chartPoints.map((point, index) => {
                      const row = chartModeRows[index];
                      const pointColor = getModePointColor(row.mode);

                      return (
                        <circle
                          key={`${row.mondayDate}-${index}`}
                          cx={point.x}
                          cy={point.y}
                          r="4.5"
                          fill={pointColor}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        >
                          <title>{`${row.mondayDate} | RSI ${row.rsi} | ${row.mode ?? "-"}`}</title>
                        </circle>
                      );
                    })}
                  </g>
                </svg>
              </div>

              <div className="mt-3 flex gap-6 text-sm text-slate-500">
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
                    {[...modeHistory]
                      .filter((row) => row.mode !== null)
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