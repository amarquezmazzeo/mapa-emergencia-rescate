import { getMissingPhoto } from "@/lib/missing";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const photo = await getMissingPhoto(id);
  if (!photo) {
    return new Response("No encontrada", { status: 404 });
  }
  // Foto alojada externamente: redirigimos al origen en vez de servir bytes.
  if ("redirectTo" in photo) {
    return Response.redirect(photo.redirectTo, 302);
  }
  // La foto de una persona no cambia: se cachea de forma agresiva en el CDN.
  return new Response(new Uint8Array(photo.buffer), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
