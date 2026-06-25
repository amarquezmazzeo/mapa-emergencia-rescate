import { NextResponse } from "next/server";
import { searchPatients } from "@/lib/hospitals";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=30",
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  const limit = Number(params.get("limit") ?? "50");
  const results = await searchPatients(q, limit);
  return NextResponse.json(
    { results, query: q },
    { headers: CACHE_HEADERS },
  );
}
