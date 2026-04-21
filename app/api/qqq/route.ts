import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AlphaVantageDailyRow = {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
  "5. volume": string;
};

type AlphaVantageWeeklyRow = {
  "1. open": string;
  "2. high": string;
  "3. low": string;
  "4. close": string;
  "5. volume": string;
};

export async function GET() {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ALPHA_VANTAGE_API_KEY가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const dailyUrl =
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=QQQ&outputsize=compact&apikey=${apiKey}`;

  const weeklyUrl =
    `https://www.alphavantage.co/query?function=TIME_SERIES_WEEKLY&symbol=QQQ&apikey=${apiKey}`;

  const [dailyRes, weeklyRes] = await Promise.all([
    fetch(dailyUrl, { cache: "no-store" }),
    fetch(weeklyUrl, { cache: "no-store" }),
  ]);

  if (!dailyRes.ok || !weeklyRes.ok) {
    return NextResponse.json(
      { error: "외부 데이터 요청에 실패했습니다." },
      { status: 502 }
    );
  }

  const [dailyData, weeklyData] = await Promise.all([
    dailyRes.json(),
    weeklyRes.json(),
  ]);

  const errorMessage =
    dailyData["Error Message"] ||
    weeklyData["Error Message"] ||
    dailyData["Note"] ||
    weeklyData["Note"] ||
    dailyData["Information"] ||
    weeklyData["Information"];

  if (errorMessage) {
    return NextResponse.json(
      { error: "Alpha Vantage 응답 오류", detail: errorMessage },
      { status: 500 }
    );
  }

  const dailySeries = dailyData["Time Series (Daily)"] as
    | Record<string, AlphaVantageDailyRow>
    | undefined;

  const weeklySeries = weeklyData["Weekly Time Series"] as
    | Record<string, AlphaVantageWeeklyRow>
    | undefined;

  if (!dailySeries || !weeklySeries) {
    return NextResponse.json(
      {
        error: "일봉 또는 주봉 데이터가 없습니다.",
        raw: { dailyData, weeklyData },
      },
      { status: 500 }
    );
  }

  const dailyRows = Object.entries(dailySeries)
    .map(([date, value]) => ({
      date,
      open: Number(value["1. open"]),
      high: Number(value["2. high"]),
      low: Number(value["3. low"]),
      close: Number(value["4. close"]),
      volume: Number(value["5. volume"]),
    }))
    .filter(
      (row) =>
        row.date &&
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close)
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const weeklyRows = Object.entries(weeklySeries)
    .map(([date, value]) => ({
      date, // 금요일 기준
      open: Number(value["1. open"]),
      high: Number(value["2. high"]),
      low: Number(value["3. low"]),
      close: Number(value["4. close"]),
      volume: Number(value["5. volume"]),
    }))
    .filter(
      (row) =>
        row.date &&
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close)
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json(
    {
      symbol: "QQQ",
      source: "Alpha Vantage",
      dailyRows,
      weeklyRows,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    }
  );
}