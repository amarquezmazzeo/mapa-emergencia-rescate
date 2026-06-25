import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` solo se usa en desarrollo local (ver lib/db.ts). Lo mantenemos fuera
  // del bundle para que se cargue como módulo de Node en tiempo de ejecución.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
