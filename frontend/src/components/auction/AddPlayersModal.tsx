"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { normalizeError } from "@/services/api";
import { newBatchId, poolImportService } from "@/services/pool-import.service";
import type { PoolImportReportDTO, PoolImportRequestDTO, PoolImportRowDTO, PoolImportSource } from "@/types/backend";

export const MAX_CSV_CHARS = 1_500_000;
const PREVIEW_ROW_LIMIT = 200;
type Step = "input" | "preview" | "done";

const STATUS_STYLE: Record<PoolImportRowDTO["status"], string> = {
  ELIGIBLE: "border-[#00ff87]/40 bg-[#00ff87]/10 text-[#00ff87]",
  SKIPPED: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  REJECTED: "border-rose-400/40 bg-rose-500/10 text-rose-300",
};
const STATUS_LABEL: Record<PoolImportRowDTO["status"], string> = { ELIGIBLE: "NEW", SKIPPED: "SKIP", REJECTED: "REJECT" };
const FIELD = "w-full rounded-lg border border-[#334155] bg-[#080a0f] p-2.5 text-[#f8fafc] placeholder-[#64748b] focus:outline-2 focus:outline-[#00ff87]";

function RowTable({ rows, showCategory }: { rows: PoolImportRowDTO[]; showCategory?: boolean }) {
  const shown = rows.slice(0, PREVIEW_ROW_LIMIT);
  return (
    <div className="max-h-[34vh] overflow-auto rounded-lg border border-[#242c3d]">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-[#151a24] text-[#94a3b8]">
          <tr><th className="p-2">Row</th><th className="p-2">Player</th><th className="p-2">OVR</th><th className="p-2">Pot</th><th className="p-2">Status</th><th className="p-2">Reason</th></tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.row + ":" + r.playerId} className="border-t border-[#242c3d]" data-testid="import-row" data-status={r.status}>
              <td className="p-2 text-[#94a3b8]">{r.row}</td>
              <td className="p-2 font-semibold text-[#f8fafc]">{r.name || r.playerId || "(unnamed)"}
                {r.underdog ? <span className="ml-1.5 rounded border border-fuchsia-400/50 bg-fuchsia-500/20 px-1.5 py-0.5 text-[9px] font-black text-fuchsia-200">UNDERDOG</span> : null}
              </td>
              <td className="p-2">{r.ovr ?? "-"}</td>
              <td className="p-2">{r.potId ?? "-"}{showCategory && r.categoryState === "COMPLETED" ? " (completed, held)" : showCategory && r.categoryState === "NOT_IN_AUCTION" ? " (held)" : ""}</td>
              <td className="p-2"><span className={`rounded border px-1.5 py-0.5 text-[9px] font-black tracking-wider ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
              <td className="p-2 text-[#cbd5e1]">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && <p className="p-2 text-center text-xs text-[#94a3b8]">Showing the first {shown.length} of {rows.length} rows.</p>}
    </div>
  );
}

export function AddPlayersModal({ roomCode, enabled, poolSource, onClose }: {
  roomCode: string; enabled: boolean; poolSource: "DEFAULT" | "FC26"; onClose: () => void;
}) {
  const databaseSource: PoolImportSource = poolSource === "FC26" ? "FC26_DATABASE" : "DEFAULT_POOL";
  const [step, setStep] = useState<Step>("input");
  const [source, setSource] = useState<PoolImportSource>("CSV");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [search, setSearch] = useState("");
  const [idsText, setIdsText] = useState("");
  const [report, setReport] = useState<PoolImportReportDTO | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdded, setShowAdded] = useState(false);
  // One id per import attempt: a retried confirm is idempotent on the server.
  const batchId = useRef<string>("");
  const fileInput = useRef<HTMLInputElement>(null);

  const ids = idsText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const request = (): PoolImportRequestDTO => source === "CSV"
    ? { source, fileName: fileName || "upload.csv", csv }
    : { source, ...(search.trim() ? { search: search.trim() } : {}), ...(ids.length ? { playerIds: ids.slice(0, 500) } : {}) };
  const ready = source === "CSV" ? csv.length > 0 : search.trim().length > 0 || ids.length > 0;

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_CSV_CHARS) { setError("File is too large. The limit is about 1.5 MB (1000 rows)."); return; }
    try { setCsv(await file.text()); setFileName(file.name); } catch { setError("The file could not be read."); }
  };
  const run = async (mode: "preview" | "commit") => {
    if (!enabled || pending) return;
    setPending(true); setError(null);
    try {
      if (mode === "preview") {
        batchId.current = newBatchId();
        setReport(await poolImportService.preview(roomCode, request())); setStep("preview");
      } else {
        setReport(await poolImportService.commit(roomCode, request(), batchId.current)); setStep("done");
      }
    } catch (cause) { setError(normalizeError(cause).message); }
    finally { setPending(false); }
  };

  const rows = report?.rows ?? [];
  const t = report?.totals;
  const problems = rows.filter((r) => r.status !== "ELIGIBLE");
  const added = rows.filter((r) => r.status === "ELIGIBLE");
  const sourceBtn = (id: PoolImportSource, label: string) => (
    <button key={id} type="button" aria-pressed={source === id} disabled={pending} onClick={() => setSource(id)}
      className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-[#00ff87] ${source === id ? "bg-[#00ff87] font-bold text-[#08090d]" : "bg-[#151a24] text-[#cbd5e1] hover:bg-[#1e2433]"}`}>
      {label}
    </button>
  );

  return (
    <Modal isOpen onClose={() => { if (!pending) onClose(); }} title="ADD PLAYERS TO AUCTION" maxWidth="xl" className="max-w-3xl">
      <div className="space-y-4 text-sm text-[#cbd5e1]">
        {step === "input" && <>
          <p>New players are appended to the end of the pool. The current player, bids and timer continue unchanged.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Player source">
            {sourceBtn("CSV", "Upload CSV")}{sourceBtn(databaseSource, poolSource === "FC26" ? "FC26 database" : "Default pool")}
          </div>
          {source === "CSV" ? <div className="space-y-2">
            <input ref={fileInput} type="file" accept=".csv,text/csv" aria-label="CSV file" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()} leftIcon={<FileUp className="h-3.5 w-3.5" aria-hidden="true" />}>Choose CSV file</Button>
            <span className="ml-2 text-xs" data-testid="csv-file-name">{fileName || "No file selected"}</span>
            <p className="text-xs text-[#94a3b8]">Required columns: player_id, overall, a name column (short_name or name) and a position column (player_positions, auction_group or position). Up to 1000 rows. Prices come from the server.</p>
          </div> : <div className="space-y-2">
            <input aria-label="Search players" placeholder="Search by name or club..." value={search} onChange={(e) => setSearch(e.target.value)} className={FIELD} />
            <input aria-label="Player IDs" placeholder="Or player IDs, comma separated" value={idsText} onChange={(e) => setIdsText(e.target.value)} className={FIELD} />
          </div>}
        </>}

        {step === "preview" && t && <>
          <div className="flex flex-wrap gap-3 text-xs" data-testid="preview-totals">
            <span><b>{t.totalRecords}</b> records</span><span className="text-[#00ff87]"><b>{t.eligible}</b> eligible</span>
            <span className="text-amber-300"><b>{t.skipped}</b> skipped</span><span className="text-rose-300"><b>{t.rejected}</b> rejected</span>
          </div>
          <RowTable rows={rows} showCategory />
          {t.eligible === 0 && <p role="status">Nothing to import. Skipped and rejected players are never added.</p>}
        </>}

        {step === "done" && t && <div className="space-y-3" data-testid="import-summary">
          <h4 className="text-base font-black tracking-wider text-[#00ff87]">IMPORT COMPLETED</h4>
          <ul className="space-y-1">
            <li>Total CSV records: <b data-testid="sum-total">{t.totalRecords}</b></li>
            <li>Successfully added: <b data-testid="sum-added">{t.added}</b></li>
            <li>Skipped as duplicates: <b data-testid="sum-skipped">{t.skipped}</b></li>
            <li>Rejected: <b data-testid="sum-rejected">{t.rejected}</b></li>
          </ul>
          {report?.duplicate && <p role="status" className="text-xs text-amber-300">This batch was already imported. Nothing was added again.</p>}
          {problems.length > 0 && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">Skipped and rejected records</p><RowTable rows={problems} /></div>}
          {showAdded && <div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">New players</p><RowTable rows={added} showCategory /></div>}
        </div>}

        {error && <p role="alert" className="text-rose-300">{error}</p>}
        {!enabled && <p role="status">Adding players requires a synced, running or paused auction.</p>}

        <div className="flex justify-end gap-2 border-t border-[#242c3d] pt-3">
          {step === "input" && <>
            <Button size="sm" variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button>
            <Button size="sm" variant="stadium" disabled={!enabled || !ready || pending} isLoading={pending} onClick={() => void run("preview")}>Preview</Button>
          </>}
          {step === "preview" && <>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setStep("input"); setError(null); }}>Back</Button>
            <Button size="sm" variant="stadium" disabled={!enabled || pending || !t?.eligible} isLoading={pending} onClick={() => void run("commit")}>
              Confirm import ({t?.eligible ?? 0})
            </Button>
          </>}
          {step === "done" && <>
            {added.length > 0 && <Button size="sm" variant="secondary" onClick={() => setShowAdded(!showAdded)}>{showAdded ? "Hide new players" : "View new players"}</Button>}
            <Button size="sm" variant="stadium" onClick={onClose}>Close</Button>
          </>}
        </div>
      </div>
    </Modal>
  );
}
