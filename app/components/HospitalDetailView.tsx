"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PATIENT_CONDITION_META,
  PATIENT_STATUS_META,
  type Hospital,
  type HospitalPatient,
} from "@/lib/hospitals-meta";
import HospitalPatientForm, { type PatientPayload } from "./HospitalPatientForm";
import { timeAgo } from "@/lib/format";

const ADMIN_STORAGE_KEY = "emergency:adminToken";
const POLL_MS = 30_000;

interface Props {
  hospital: Hospital;
  initialPatients: HospitalPatient[];
}

export default function HospitalDetailView({
  hospital: initialHospital,
  initialPatients,
}: Props) {
  const [hospital, setHospital] = useState<Hospital>(initialHospital);
  const [patients, setPatients] = useState<HospitalPatient[]>(initialPatients);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hospitalIdRef = useRef(initialHospital.id);

  useEffect(() => {
    setAdminToken(
      typeof window !== "undefined"
        ? sessionStorage.getItem(ADMIN_STORAGE_KEY)
        : null,
    );
  }, []);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch(
        `/api/hospitals/${hospitalIdRef.current}/patients`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("No se pudieron cargar los pacientes.");
      const data = await res.json();
      setPatients(data.patients ?? []);
      if (data.hospital) setHospital(data.hospital);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar.");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      load();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function handleSubmit(payload: PatientPayload) {
    const res = await fetch(`/api/hospitals/${hospital.id}/patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "No se pudo guardar el paciente.");
    }
    setShowForm(false);
    await load(true);
  }

  async function handleDelete(id: string) {
    if (!adminToken) return;
    if (!confirm("¿Eliminar este paciente?")) return;
    const res = await fetch(
      `/api/hospitals/${hospital.id}/patients/${id}`,
      {
        method: "DELETE",
        headers: { "x-admin-token": adminToken },
      },
    );
    if (res.ok) await load(true);
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? patients.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.notes.toLowerCase().includes(q) ||
          p.contact.toLowerCase().includes(q),
      )
    : patients;
  const active = patients.filter((p) => p.status === "hospitalized").length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            Pacientes registrados
          </h2>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            {active} hospitalizados
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
          >
            {refreshing ? "Actualizando…" : "🔄 Actualizar"}
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
          >
            + Paciente
          </button>
        </div>
      </div>

      <div className="border-b border-slate-200 px-5 py-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar paciente por nombre, nota o contacto…"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
        />
      </div>

      <div className="px-5 py-4">
        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
            <p className="text-2xl" aria-hidden>🏥</p>
            <p className="mt-2 text-sm font-medium text-slate-700">
              {patients.length === 0
                ? "Todavía no hay pacientes registrados en este hospital."
                : "Sin resultados para la búsqueda."}
            </p>
            {patients.length === 0 && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-3 inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                + Registrar paciente
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((p) => {
              const condition = PATIENT_CONDITION_META[p.condition];
              const status = PATIENT_STATUS_META[p.status];
              return (
                <li
                  key={p.id}
                  id={`paciente-${p.id}`}
                  className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition target:border-red-400 target:bg-red-50 hover:border-slate-300"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {p.name}
                        {p.age !== null && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {p.age} años
                          </span>
                        )}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Pill bg={status.color}>{status.label}</Pill>
                        <Pill bg={condition.color}>{condition.label}</Pill>
                      </div>
                    </div>
                    {adminToken && (
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  {p.notes && (
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">
                      {p.notes}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span>📅 Ingreso {timeAgo(p.admittedAt, now)}</span>
                    {p.contact && (
                      <span className="truncate">📞 {p.contact}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showForm && (
        <HospitalPatientForm
          hospitalName={hospital.name}
          onCancel={() => setShowForm(false)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function Pill({
  bg,
  children,
}: {
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
      style={{ background: bg }}
    >
      {children}
    </span>
  );
}
