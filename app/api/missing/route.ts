import { NextResponse } from "next/server";
import {
  addMissing,
  DEFAULT_PAGE_SIZE,
  isValidPhotoDataUrl,
  listMissingPage,
  MAX_NAME,
  MAX_PHOTO_CHARS,
  type MissingStatusFilter,
} from "@/lib/missing";
import { isPersistent } from "@/lib/store";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const LIST_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=15",
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // Por defecto se listan solo las personas activas (las localizadas se
  // ocultan para proteger su privacidad y mantener el foco). Con
  // ?status=found devolvemos solo las localizadas (caso "muro de
  // esperanza"); con ?status=all devolvemos ambas.
  const statusParam = params.get("status");
  const status: MissingStatusFilter =
    statusParam === "found" ? "found" : statusParam === "all" ? "all" : "active";

  const result = await listMissingPage({
    status,
    page: Number(params.get("page") ?? "1"),
    pageSize: Number(params.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)),
    search: params.get("q") ?? undefined,
  });

  return NextResponse.json(
    {
      people: result.people,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      persistent: isPersistent(),
    },
    { headers: LIST_CACHE_HEADERS },
  );
}

export async function POST(request: Request) {
  const allowed = await checkRateLimit(`missing:${clientIp(request)}`, 10);
  if (!allowed) {
    return NextResponse.json(
      { error: "Vas muy rápido. Espera un momento antes de enviar más reportes." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  let body: {
    name?: string;
    age?: number | string | null;
    description?: string;
    lastSeen?: string;
    contact?: string;
    photo?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "Indica el nombre de la persona desaparecida." },
      { status: 400 },
    );
  }
  if (name.length > MAX_NAME) {
    return NextResponse.json(
      { error: `El nombre no puede superar ${MAX_NAME} caracteres.` },
      { status: 400 },
    );
  }

  if (body.photo) {
    if (typeof body.photo !== "string" || !isValidPhotoDataUrl(body.photo)) {
      return NextResponse.json(
        { error: "La foto debe ser una imagen JPG, PNG o WebP válida." },
        { status: 400 },
      );
    }
    if (body.photo.length > MAX_PHOTO_CHARS) {
      return NextResponse.json(
        { error: "La foto es demasiado grande. Usa una imagen más liviana." },
        { status: 413 },
      );
    }
  }

  try {
    const person = await addMissing({
      name,
      age: body.age,
      description: body.description,
      lastSeen: body.lastSeen,
      contact: body.contact,
      photo: body.photo,
    });
    return NextResponse.json({ person }, { status: 201 });
  } catch {
    return NextResponse.json(
      {
        error:
          "No se pudo guardar el reporte. Revisa tu conexión e inténtalo de nuevo.",
      },
      { status: 503 },
    );
  }
}
