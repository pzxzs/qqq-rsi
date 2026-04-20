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
  mondayDate: string;   // 실제 표시할 주간 시작일(월요일)
  basedOnFriday: string; // 이 모드를 결정한 직전 금요일
  close: number;
  rsi: number;
  mode: ModeType | null;
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

function getTriggeredMode(prev: number, curr: number): ModeType | null {
  const isUp = curr > prev;
  const isDown = curr < prev;

  // 공격모드 조건
  if (
    (prev <= 50 && curr > 50) ||           // RSI가 50 위로 상승
    (curr > 50 && curr < 60 && isUp) ||    // 50 < RSI < 60 에서 상승
    (curr < 35 && isUp)                    // RSI < 35 영역에서 상승
  ) {
    return "공격모드";
  }

  // 안전모드 조건
  if (
    (curr > 65 && isDown) ||               // RSI > 65 영역에서 하락
    (curr > 40 && curr < 50 && isDown) ||  // 40 < RSI < 50 에서 하락
    (prev >= 50 && curr < 50)              // RSI가 50 밑으로 하락
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

  const modeHistory = useMemo<WeeklyModeRow[]>(() => {
    if (weeklyRSI.length < 2) return [];

    const result: WeeklyModeRow[] = [];
    let activeMode: ModeType | null = null;

    for (let i = 1; i < weeklyRSI.length; i++) {
      const prevRow = weeklyRSI[i - 1]; // 전전주 금요일
      const currRow = weeklyRSI[i];     // 전주 금요일

      const triggeredMode = getTriggeredMode(
        prevRow.rsi as number,
        currRow.rsi as number
      );

      if (triggeredMode !== null) {
        activeMode = triggeredMode;
      }

      result.push({
        mondayDate: getNextMondayFromFriday(currRow.date), // 이 월요일 주간 모드
        basedOnFriday: currRow.date,
        close: currRow.close,
        rsi: currRow.rsi as number,
        mode: activeMode,
      });
    }

    return result;
  }, [weeklyRSI]);

  const latestRSI = weeklyRSI.at(-1) ?? null;
  const currentModeRow = modeHistory.at(-1) ?? null;
  const currentWeekMode = currentModeRow?.mode ?? null;
  const currentMondayDate = currentModeRow?.mondayDate ?? "-";

  const chartRows = weeklyRSI.slice(-40);
  const chartValues = chartRows.map((r) => r.rsi as number);
  const path = buildLinePath(chartValues, 800, 260);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold">QQQ 주봉 Cutler RSI</h1>
        <p className="mt-2 text-sm text-slate-600">
          금요일에 확정된 RSI를 기준으로, 다음 월요일 주간에 적용되는 매매 모드를 표시한다.
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
                <div className="text-sm text-slate-500">현재 주간 시작일</div>
                <div className="mt-2 text-2xl font-semibold">{currentMondayDate}</div>
              </div>

              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="text-sm text-slate-500">최근 확정 RSI(직전 금요일)</div>
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
                <svg viewBox="0 0 800 260" className="h-[260px] w-full min-w-[800px]">
                  <line x1="0" y1="78" x2="800" y2="78" stroke="#cbd5e1" strokeDasharray="4 4" />
                  <line x1="0" y1="130" x2="800" y2="130" stroke="#cbd5e1" strokeDasharray="4 4" />
                  <line x1="0" y1="182" x2="800" y2="182" stroke="#cbd5e1" strokeDasharray="4 4" />
                  <path d={path} fill="none" stroke="#0f172a" strokeWidth="3" />
                </svg>
              </div>

              <div className="mt-3 flex gap-4 text-sm text-slate-500">
                <span>70</span>
                <span>50</span>
                <span>30</span>
              </div>
            </section>

            <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">주간 모드 히스토리 (최근 50주)</h2>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-100 text-left">
                      <th className="px-4 py-3">주간 시작일(월)</th>
                      <th className="px-4 py-3">기준 RSI 계산일(직전 금)</th>
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