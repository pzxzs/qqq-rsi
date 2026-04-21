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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  // 무료 키는 초당 1회 제한이 있어서 순차 호출 + 대기
  const dailyRes = await fetch(dailyUrl, { cache: "no-store" });
  const dailyData = await dailyRes.json();

  if (!dailyRes.ok) {
    return NextResponse.json(
      { error: "일봉 데이터 요청에 실패했습니다." },
      { status: 502 }
    );
  }

  if (dailyData["Error Message"] || dailyData["Note"] || dailyData["Information"]) {
    return NextResponse.json(
      {
        error: "Alpha Vantage 일봉 응답 오류",
        detail:
          dailyData["Error Message"] ||
          dailyData["Note"] ||
          dailyData["Information"],
      },
      { status: 500 }
    );
  }

  // burst limit 회피
  await sleep(1200);

  const weeklyRes = await fetch(weeklyUrl, { cache: "no-store" });
  const weeklyData = await weeklyRes.json();

  if (!weeklyRes.ok) {
    return NextResponse.json(
      { error: "주봉 데이터 요청에 실패했습니다." },
      { status: 502 }
    );
  }

  if (weeklyData["Error Message"] || weeklyData["Note"] || weeklyData["Information"]) {
    return NextResponse.json(
      {
        error: "Alpha Vantage 주봉 응답 오류",
        detail:
          weeklyData["Error Message"] ||
          weeklyData["Note"] ||
          weeklyData["Information"],
      },
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