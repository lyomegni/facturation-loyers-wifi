"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { readSheet } from "read-excel-file/browser";
import { parseCustomerSheet, type ImportResult } from "@/lib/domain/import";
import { parseCsv } from "@/lib/domain/csv";
import { formatXaf } from "@/lib/domain/money";
import { formatPhone } from "@/lib/domain/phone";
import { SERVICE_LABELS } from "@/lib/domain/invoicing";
import { importCustomers, type ImportOutcome } from "@/app/app/actions/import";
import type { Property } from "@/lib/types";

export function ImportClient({ properties }: { properties: Property[] }) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [pending, start] = useTransition();

  async function onFile(file: File | undefined) {
    setResult(null);
    setOutcome(null);
    setReadError(null);
    if (!file) return;
    try {
      const table: unknown[][] = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(await file.text())
        : ((await readSheet(file)) as unknown[][]);
      setResult(parseCustomerSheet(table));
    } catch {
      setReadError("Fichier illisible. Utilisez un fichier Excel (.xlsx) ou CSV.");
    }
  }

  function submit() {
    if (!result) return;
    start(async () => setOutcome(await importCustomers({ rows: result.rows, defaultPropertyId: propertyId })));
  }

  if (outcome?.ok) {
    return (
      <div className="card flex flex-col gap-2">
        <p className="font-medium text-ok">
          Import terminé : {outcome.customers} client(s), {outcome.contracts} contrat(s)
          {outcome.properties > 0 && `, ${outcome.properties} bien(s) créé(s)`}.
        </p>
        <div className="flex gap-2">
          <Link href="/app/clients" className="btn-primary">Voir les clients</Link>
          <Link href="/app/factures" className="btn-secondary">Émettre les factures</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="file" className="label">Fichier Excel (.xlsx) ou CSV</label>
          <input id="file" type="file" accept=".xlsx,.csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
          {readError && <p className="mt-1 text-sm text-risk">{readError}</p>}
        </div>
        <div>
          <label htmlFor="default-property" className="label">Bien par défaut</label>
          <select id="default-property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="input">
            <option value="">Aucun : la colonne « Immeuble » est obligatoire</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">Utilisé quand la colonne « Immeuble / Zone » est vide.</p>
        </div>
      </div>

      {result && (
        <>
          {result.errors.length > 0 && (
            <div className="card border-risk/40">
              <p className="mb-2 text-sm font-medium text-risk">{result.errors.length} ligne(s) ignorée(s)</p>
              <ul className="list-inside list-disc text-sm">
                {result.errors.slice(0, 50).map((e, i) => <li key={i}>Ligne {e.line} : {e.message}</li>)}
              </ul>
            </div>
          )}
          {result.rows.length > 0 && (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Ligne</th><th>Nom</th><th>WhatsApp</th><th>Bien</th><th>Service</th><th>Logement</th><th>Montant</th><th>Jour</th></tr></thead>
                  <tbody>
                    {result.rows.slice(0, 200).map((r) => (
                      <tr key={r.line}>
                        <td className="font-mono text-xs">{r.line}</td>
                        <td>{r.name}</td>
                        <td className="whitespace-nowrap">{formatPhone(r.phone)}</td>
                        <td>{r.propertyName ?? <span className="text-slate-400">par défaut</span>}</td>
                        <td>{SERVICE_LABELS[r.service]}</td>
                        <td>{r.unit ?? "—"}</td>
                        <td className="whitespace-nowrap">{r.amount ? formatXaf(r.amount) : "—"}</td>
                        <td>{r.dueDay}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {outcome && !outcome.ok && <p className="text-sm text-risk">{outcome.error}</p>}
              <button type="button" onClick={submit} disabled={pending} className="btn-primary w-fit">
                {pending ? "Import en cours…" : `Importer ${result.rows.length} ligne(s)`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
