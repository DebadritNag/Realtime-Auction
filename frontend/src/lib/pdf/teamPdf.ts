import { Player, Team } from "@/types";
import {
  PDF_COLORS,
  drawDocHeader,
  drawDocFooters,
  drawStatCard,
  formatCr,
  sanitizeFilename,
} from "./pdfHelpers";

export interface TeamPdfData {
  auctionName: string;
  roomCode: string;
  team: Team;
  maxSquadSize?: number;
  minSquadSize?: number;
}

export async function generateTeamPdf(data: TeamPdfData): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { auctionName, roomCode, team, maxSquadSize = 24, minSquadSize = 15 } = data;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Top Brand Header
  let currentY = drawDocHeader(
    doc,
    "Official Team Squad & Transfer Report",
    auctionName || "Live Auction",
    `ROOM: ${roomCode || "N/A"}`
  );

  // 2. Team Overview Box
  doc.setFillColor(...PDF_COLORS.cardBg);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, currentY, pageWidth - 28, 20, 2, 2, "FD");

  // Accent vertical strip with team accentColor or mint
  doc.setFillColor(...PDF_COLORS.mint);
  doc.roundedRect(14, currentY, 3, 20, 1, 1, "F");

  // Team Name & Manager
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PDF_COLORS.navyDark);
  doc.text(team.name || "Unnamed Team", 21, currentY + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.textMuted);
  const managerName = team.managerUsername || "Not Assigned";
  doc.text(`Manager: ${managerName}   •   Auction: ${auctionName || "ArenaAuction"}`, 21, currentY + 13);

  // Position breakdown pills on the right side of team overview
  const gkCount = team.positions?.gk ?? team.squad.filter((p) => p.position === "GK").length;
  const defCount = team.positions?.def ?? team.squad.filter((p) => p.position === "DEF").length;
  const midCount = team.positions?.mid ?? team.squad.filter((p) => p.position === "MID").length;
  const attCount = team.positions?.att ?? team.squad.filter((p) => p.position === "ATT").length;

  const posPillText = `GK: ${gkCount}  |  DEF: ${defCount}  |  MID: ${midCount}  |  ATT: ${attCount}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.navyDark);
  doc.text(posPillText, pageWidth - 18, currentY + 10, { align: "right" });

  currentY += 24;

  // 3. Financial & Squad Stat Cards (4 cards across width)
  const cardGap = 3;
  const totalCards = 4;
  const cardW = (pageWidth - 28 - cardGap * (totalCards - 1)) / totalCards;
  const cardH = 17;

  drawStatCard(doc, 14, currentY, cardW, cardH, "Starting Purse", formatCr(team.budgetTotal), PDF_COLORS.navyDark);
  drawStatCard(doc, 14 + (cardW + cardGap), currentY, cardW, cardH, "Total Spent", formatCr(team.budgetSpent), PDF_COLORS.amber);
  drawStatCard(doc, 14 + (cardW + cardGap) * 2, currentY, cardW, cardH, "Remaining Purse", formatCr(team.budgetRemaining), PDF_COLORS.mint);
  
  const squadRatio = `${team.squad.length} / ${maxSquadSize}`;
  drawStatCard(doc, 14 + (cardW + cardGap) * 3, currentY, cardW, cardH, "Squad Size", squadRatio, PDF_COLORS.cyan);

  currentY += cardH + 4;

  // 4. Secondary Analytical Metrics
  const squad = team.squad || [];
  const highestPlayer = squad.reduce<Player | null>((prev, curr) => {
    const prevPrice = prev?.soldPrice ?? 0;
    const currPrice = curr.soldPrice ?? 0;
    return currPrice > prevPrice ? curr : prev;
  }, null);

  const lowestPlayer = squad.reduce<Player | null>((prev, curr) => {
    if (!prev) return curr;
    const prevPrice = prev.soldPrice ?? 0;
    const currPrice = curr.soldPrice ?? 0;
    return currPrice < prevPrice ? curr : prev;
  }, null);

  const avgPrice = squad.length > 0 ? team.budgetSpent / squad.length : 0;
  const neededSlots = Math.max(0, maxSquadSize - squad.length);

  // Analytical bar
  doc.setFillColor(...PDF_COLORS.cardBg);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, currentY, pageWidth - 28, 10, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.textDark);

  const highTxt = highestPlayer ? `High: ${highestPlayer.name} (${formatCr(highestPlayer.soldPrice)})` : "High: N/A";
  const lowTxt = lowestPlayer ? `Low: ${lowestPlayer.name} (${formatCr(lowestPlayer.soldPrice)})` : "Low: N/A";
  const avgTxt = `Avg Buy: ${formatCr(avgPrice)}`;
  const neededTxt = `Slots Remaining: ${neededSlots}`;

  doc.text(`${highTxt}   |   ${lowTxt}   |   ${avgTxt}   |   ${neededTxt}`, 18, currentY + 6.2);

  currentY += 14;

  // 5. Squad Roster
  if (squad.length === 0) {
    // Empty state container
    doc.setFillColor(...PDF_COLORS.cardBg);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.roundedRect(14, currentY, pageWidth - 28, 30, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text("No players purchased yet.", pageWidth / 2, currentY + 13, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("This team has not acquired any players in the auction room.", pageWidth / 2, currentY + 20, { align: "center" });

    currentY += 36;
  } else {
    // Position groups in structured football order
    const positionGroups: { title: string; pos: "GK" | "DEF" | "MID" | "ATT"; color: [number, number, number] }[] = [
      { title: "GOALKEEPERS", pos: "GK", color: [234, 88, 12] },
      { title: "DEFENDERS", pos: "DEF", color: [37, 99, 235] },
      { title: "MIDFIELDERS", pos: "MID", color: [16, 185, 129] },
      { title: "ATTACKERS", pos: "ATT", color: [225, 29, 72] },
    ];

    const tableHeaders = [
      "Player",
      "OVR",
      "POS",
      "Club",
      "Nation",
      "Price",
      "Base",
      "Age",
      "Foot",
      "PAC",
      "SHO",
      "PAS",
      "DRI",
      "DEF",
      "PHY",
    ];

    for (const group of positionGroups) {
      const playersInGroup = squad.filter((p) => p.position === group.pos);
      if (playersInGroup.length === 0) continue;

      // Group section title
      if (currentY > pageHeight - 35) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFillColor(...group.color);
      doc.rect(14, currentY, 2.5, 5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...PDF_COLORS.navyDark);
      doc.text(`${group.title} (${playersInGroup.length})`, 19, currentY + 4);

      currentY += 6;

      const rows = playersInGroup.map((p) => [
        p.name,
        p.ovr?.toString() || "-",
        p.subPosition || p.position,
        p.club || "-",
        p.nationality || "-",
        formatCr(p.soldPrice ?? p.basePrice),
        formatCr(p.basePrice),
        p.age ? p.age.toString() : "-",
        p.preferredFoot ? p.preferredFoot.charAt(0).toUpperCase() + p.preferredFoot.slice(1).toLowerCase() : "-",
        p.stats?.pac != null ? p.stats.pac.toString() : "-",
        p.stats?.sho != null ? p.stats.sho.toString() : "-",
        p.stats?.pas != null ? p.stats.pas.toString() : "-",
        p.stats?.dri != null ? p.stats.dri.toString() : "-",
        p.stats?.def != null ? p.stats.def.toString() : "-",
        p.stats?.phy != null ? p.stats.phy.toString() : "-",
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [tableHeaders],
        body: rows,
        theme: "striped",
        margin: { left: 14, right: 14 },
        styles: {
          font: "helvetica",
          fontSize: 7.2,
          cellPadding: 1.6,
          textColor: PDF_COLORS.textDark,
          lineColor: PDF_COLORS.border,
          lineWidth: 0.1,
          overflow: "ellipsize",
        },
        headStyles: {
          fillColor: PDF_COLORS.navyPanel,
          textColor: PDF_COLORS.white,
          fontStyle: "bold",
          fontSize: 7.2,
          halign: "center",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { halign: "left", fontStyle: "bold", cellWidth: 32 }, // Player Name
          1: { halign: "center", fontStyle: "bold", cellWidth: 10 }, // OVR
          2: { halign: "center", cellWidth: 11 }, // POS
          3: { halign: "left", cellWidth: 24 }, // Club
          4: { halign: "left", cellWidth: 20 }, // Nation
          5: { halign: "right", fontStyle: "bold", textColor: PDF_COLORS.mint, cellWidth: 16 }, // Price
          6: { halign: "right", cellWidth: 14 }, // Base
          7: { halign: "center", cellWidth: 9 }, // Age
          8: { halign: "center", cellWidth: 10 }, // Foot
          9: { halign: "center", cellWidth: 6 }, // PAC
          10: { halign: "center", cellWidth: 6 }, // SHO
          11: { halign: "center", cellWidth: 6 }, // PAS
          12: { halign: "center", cellWidth: 6 }, // DRI
          13: { halign: "center", cellWidth: 6 }, // DEF
          14: { halign: "center", cellWidth: 6 }, // PHY
        },
      });

      currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 7 : currentY + 25;
    }
  }

  // 6. Draw footers on every page
  drawDocFooters(doc, roomCode);

  // 7. Save file with sanitized name
  const cleanTeam = sanitizeFilename(team.name || "Team");
  const cleanRoom = sanitizeFilename(roomCode || "Auction");
  doc.save(`${cleanTeam}_${cleanRoom}_Squad.pdf`);
}
