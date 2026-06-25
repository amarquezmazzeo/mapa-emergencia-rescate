import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();

  if (query.length < 3) {
    return NextResponse.json({ results: [] });
  }

  const allowed = await checkRateLimit(`geo:${clientIp(request)}`, 30);
  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiadas búsquedas. Espera un momento." },
      { status: 429 },
    );
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("countrycodes", "ve");
  url.searchParams.set("limit", "6");
  url.searchParams.set("accept-language", "es");

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "MapaEmergenciaVenezuela/1.0 (https://terremotovenezuela.app)",
        "Accept-Language": "es",
      },
      // Cachea en el edge de Vercel: las direcciones no cambian, así que
      // muchas búsquedas iguales no golpean Nominatim repetidamente.
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "No se pudo buscar la dirección." },
        { status: 502 },
      );
    }

    const data = (await res.json()) as NominatimResult[];
    const results = data.map((item) => ({
      lat: Number(item.lat),
      lng: Number(item.lon),
      label: item.display_name,
    }));

    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control":
            "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo buscar la dirección." },
      { status: 502 },
    );
  }
}
