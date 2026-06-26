const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Verdicto de la verificación de Turnstile. */
export type TurnstileResult =
  // No hay TURNSTILE_SECRET_KEY: la verificación se omite por completo.
  | "disabled"
  // Token válido y fresco.
  | "ok"
  // Token que fue válido pero ya caducó o se reutilizó ("timeout-or-duplicate").
  // Ocurre con reportes encolados sin conexión que se reintentan minutos
  // después; se acepta para no perder reportes reales.
  | "expired"
  // Token ausente, malformado o inválido.
  | "failed";

/** ¿Está configurada la verificación con Cloudflare Turnstile? */
export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

interface SiteVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

/**
 * Verifica un token de Cloudflare Turnstile contra el endpoint de siteverify.
 *
 * Si no hay clave secreta configurada, devuelve "disabled" y el endpoint
 * funciona como antes (mismo patrón que la base de datos o la analítica, que
 * también son opcionales).
 *
 * Si Cloudflare no responde, se falla en abierto ("ok") para no bloquear
 * reportes legítimos durante una caída del servicio: la protección de respaldo
 * sigue siendo el límite de peticiones por IP.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return "disabled";
  if (!token) return "failed";

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp && remoteIp !== "anon") body.set("remoteip", remoteIp);

  let data: SiteVerifyResponse;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    data = (await res.json()) as SiteVerifyResponse;
  } catch {
    // Cloudflare inalcanzable: no bloqueamos el reporte.
    return "ok";
  }

  if (data.success) return "ok";
  const codes = data["error-codes"] ?? [];
  if (codes.includes("timeout-or-duplicate")) return "expired";
  return "failed";
}
