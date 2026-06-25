export const CONTACT_EMAIL = "info@terremotovenezuela.app";

/** Calma — primeros auxilios psicológicos en línea (Universidad Continental). */
export const PSYCHOLOGY_HELP_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdbhPR8aO-dOLYgdnilRIYkv7nNbsaaA0JkonX1-VusOTxjXA/viewform";

export function contactMailto(subject?: string): string {
  if (!subject) return `mailto:${CONTACT_EMAIL}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export function psychologyHelpUrl(): string {
  return process.env.NEXT_PUBLIC_PSYCHOLOGY_HELP_URL ?? PSYCHOLOGY_HELP_URL;
}
