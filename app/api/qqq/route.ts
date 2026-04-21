import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AlphaVantageDailyRow = {
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

  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=QQQ&outputsize=full&apikey=${apiKey}`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    return NextResponse.json(
      { error: "외부 데이터 요청에 실패했습니다." },
      { status: 502 }
    );
  }

  const data = await res.json();

  if (data["Error Message"]) {
    return NextResponse.json(
      { error: "Alpha Vantage가 오류를 반환했습니다.", detail: data["Error Message"] },
      { status: 500 }
    );
  }

  if (data["Note"]) {
    return NextResponse.json(
      { error: "API 호출 제한에 걸렸습니다.", detail: data["Note"] },
      { status: 429 }
    );
  }

  if (data["Information"]) {
    return NextResponse.json(
      { error: "Alpha Vantage 안내 메시지", detail: data["Information"], raw: data },
      { status: 500 }
    );
  }

  const series = data["Time Series (Daily)"] as
    | Record<string, AlphaVantageDailyRow>
    | undefined;

  if (!series) {
    return NextResponse.json(
      { error: "일봉 데이터가 없습니다.", raw: data },
      { status: 500 }
    );
  }

  const rows = Object.entries(series)
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
      rows,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    }
  );
}