import type jsPDF from "jspdf";

export const PDF_COLORS = {
  navyDark: [9, 21, 31] as [number, number, number],
  navyPanel: [14, 31, 44] as [number, number, number],
  mint: [0, 180, 120] as [number, number, number],
  mintBright: [0, 242, 157] as [number, number, number],
  cyan: [0, 190, 220] as [number, number, number],
  textDark: [30, 41, 59] as [number, number, number],
  textMuted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  cardBg: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  amber: [217, 119, 6] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
};

export function formatCr(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(val)) return "₹0.0 Cr";
  return `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Cr`;
}

export function formatDateTime(dateInput?: string | number | Date): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleString("en-IN");
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").trim();
}

/**
 * Renders the top brand header on the first page or standard pages.
 */
export function drawDocHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  badgeText?: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header background rectangle
  doc.setFillColor(...PDF_COLORS.navyDark);
  doc.rect(0, 0, pageWidth, 26, "F");

  // Mint bottom accent bar
  doc.setFillColor(...PDF_COLORS.mintBright);
  doc.rect(0, 25, pageWidth, 1.2, "F");

  // Logo / Brand name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...PDF_COLORS.mintBright);
  doc.text("ARENA", 14, 12);
  
  const arenaWidth = doc.getTextWidth("ARENA");
  doc.setTextColor(...PDF_COLORS.white);
  doc.text("AUCTION", 14 + arenaWidth, 12);

  // Subtitle / Document Title
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.cyan);
  doc.text(title.toUpperCase(), 14, 19);

  // Subtitle right side or badge
  if (badgeText) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const badgeWidth = doc.getTextWidth(badgeText) + 8;
    const badgeX = pageWidth - 14 - badgeWidth;
    doc.setFillColor(...PDF_COLORS.navyPanel);
    doc.roundedRect(badgeX, 8, badgeWidth, 10, 2, 2, "F");
    doc.setTextColor(...PDF_COLORS.mintBright);
    doc.text(badgeText, badgeX + 4, 14.5);
  }

  // Right-aligned secondary timestamp / subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 215, 225);
  const timeStr = `Exported: ${formatDateTime()}`;
  doc.text(timeStr, pageWidth - 14, 21, { align: "right" });

  return 34; // returns Y starting point for subsequent content
}

/**
 * Draws page numbers and official footer on every page.
 */
export function drawDocFooters(doc: jsPDF, roomCode?: string) {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Subtle divider
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    // Footer left
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.textMuted);
    const roomRef = roomCode ? ` • Room Code: ${roomCode}` : "";
    doc.text(`ArenaAuction Real-Time Platform${roomRef} • Confidential`, 14, pageHeight - 7);

    // Footer right
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: "right" });
  }
}

/**
 * Helper to draw a KPI summary card.
 */
export function drawStatCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  highlightColor: [number, number, number] = PDF_COLORS.navyDark
) {
  doc.setFillColor(...PDF_COLORS.cardBg);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");

  // Top accent line
  doc.setFillColor(...highlightColor);
  doc.rect(x, y, w, 1, "F");

  // Label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(label.toUpperCase(), x + 4, y + 6);

  // Value
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...highlightColor);
  doc.text(value, x + 4, y + 13);
}
