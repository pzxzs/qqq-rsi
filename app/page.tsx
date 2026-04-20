"use client";

import { useEffect, useMemo, useState } from "react";

type WeeklyRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type WeeklyRSIRow = WeeklyRow & {
  rsi: number | null;
};

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

    const avgGain = gainSlice.reduce<number>((sum, v) => sum + (v ?? 0), 0) / length;
    const avgLoss = lossSlice.reduce<number>((sum, v) => sum + (v ?? 0), 0) / length;

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

  const latest = weeklyRSI.at(-1) ?? null;
  const chartRows = weeklyRSI.slice(-40);
  const chartValues = chartRows.map((r) => r.rsi as number);
  const path = buildLinePath(chartValues, 800, 260);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold">QQQ 주봉 Cutler RSI</h1>
        <p className="mt-2 text-sm text-slate-600">
          QQQ 주봉 데이터를 자동으로 받아와서 Cutler RSI를 계산한다.
        </p>

        {loading ? (
          <div className="mt-8 rounded-2xl border bg-white p-6">불러오는 중...</div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            오류: {error}
          </div>
        ) : (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="text-sm text-slate-500">종목</div>
                <div className="mt-2 text-2xl font-semibold">QQQ</div>
              </div>

              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="text-sm text-slate-500">최신 주 날짜</div>
                <div className="mt-2 text-2xl font-semibold">
                  {latest ? latest.date : "-"}
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="text-sm text-slate-500">최신 Cutler RSI(14)</div>
                <div className="mt-2 text-2xl font-semibold">
                  {latest ? latest.rsi : "-"}
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
              <h2 className="text-xl font-semibold">최근 20주 데이터</h2>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-100 text-left">
                      <th className="px-4 py-3">날짜</th>
                      <th className="px-4 py-3">종가</th>
                      <th className="px-4 py-3">RSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...weeklyRSI]
                      .slice(-20)
                      .reverse()
                      .map((row) => (
                        <tr key={row.date} className="border-b last:border-0">
                          <td className="px-4 py-3">{row.date}</td>
                          <td className="px-4 py-3">{row.close.toFixed(2)}</td>
                          <td className="px-4 py-3 font-medium">{row.rsi}</td>
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