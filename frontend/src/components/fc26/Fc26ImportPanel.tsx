"use client";
import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, FileWarning, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { fc26Service } from "@/services/fc26.service";
import { normalizeError } from "@/services/api";
import { potLabel } from "@/lib/pots";
import type { Fc26ImportReportDTO, Fc26StatusDTO } from "@/types/backend";

export interface Fc26ImportPanelProps {
  /** Called with the catalog size once known (null while unknown or unavailable). */
  onCatalogChange?: (total: number | null) => void;
}

/** Catalog counts for the server-side FC26 database and an explicit import action with its report. */
export function Fc26ImportPanel({ onCatalogChange }: Fc26ImportPanelProps) {
  const [status, setStatus] = useState<Fc26StatusDTO | null>(null);
  const [report, setReport] = useState<Fc26ImportReportDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fc26Service.status();
      setStatus(next);
      setReport((current) => current ?? next.lastImport);
      onCatalogChange?.(next.total);
    } catch (e) {
      setError(normalizeError(e).message);
      onCatalogChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [onCatalogChange]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const runImport = async () => {
    setImporting(true);
    setError(null);
    try {
      setReport(await fc26Service.importAll());
      await loadStatus();
    } catch (e) {
      setError(normalizeError(e).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-[#7495B2]/25 bg-[#0A1724]/70 p-3 text-xs text-[#cbd5e1]" data-testid="fc26-import-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
          <Database className="h-3.5 w-3.5 text-[#22BDF6]" aria-hidden="true" /> FC26 database
        </h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void runImport()}
          isLoading={importing}
          disabled={loading}
          leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          Import FC26 database
        </Button>
      </div>

      {loading && !status ? (
        <p className="mt-2 flex items-center gap-1.5 text-[#94a3b8]" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading catalog status…
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      ) : null}

      {status ? (
        <div className="mt-2 space-y-1">
          <p>
            <strong className="font-mono text-white">{status.total}</strong> players in catalog,{" "}
            <strong className="font-mono text-fuchsia-200">{status.underdogs}</strong> underdogs.
          </p>
          {Object.keys(status.byPot).length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {Object.entries(status.byPot).map(([pot, count]) => (
                <li key={pot} className="rounded border border-[#242c3d] bg-[#151a24] px-1.5 py-0.5 text-[10px] text-[#94a3b8]">
                  {potLabel(pot)}: <span className="font-mono text-white">{count}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {status.total === 0 ? (
            <p role="alert" className="text-amber-300">The FC26 catalog is empty. Import it before creating an FC26 auction.</p>
          ) : null}
        </div>
      ) : null}

      {report ? (
        <div className="mt-3 space-y-1.5 border-t border-[#242c3d] pt-2" data-testid="fc26-import-report">
          <p className="flex items-center gap-1.5 font-semibold text-white">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#00F5A0]" aria-hidden="true" /> Import report
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-4">
            <div><dt className="text-[10px] uppercase text-[#64748b]">Imported</dt><dd className="font-mono text-white">{report.imported}</dd></div>
            <div><dt className="text-[10px] uppercase text-[#64748b]">Skipped duplicates</dt><dd className="font-mono text-white">{report.skippedDuplicates}</dd></div>
            <div><dt className="text-[10px] uppercase text-[#64748b]">Invalid rows</dt><dd className="font-mono text-white">{report.invalidRows.length}</dd></div>
            <div><dt className="text-[10px] uppercase text-[#64748b]">Missing files</dt><dd className="font-mono text-white">{report.missingFiles.length}</dd></div>
          </dl>
          {report.missingFiles.length > 0 ? (
            <p className="flex items-start gap-1.5 text-amber-300">
              <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Missing: {report.missingFiles.join(", ")}
            </p>
          ) : null}
          {report.invalidRows.length > 0 ? (
            <details className="text-[#94a3b8]">
              <summary className="cursor-pointer text-amber-300">Show invalid rows</summary>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto">
                {report.invalidRows.slice(0, 50).map((row, index) => (
                  <li key={row.file + ":" + row.row + ":" + index}>{row.file} row {row.row}: {row.reason}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
