import { AuctionAnalytics, Team } from "@/types";
import {
  PDF_COLORS,
  drawDocHeader,
  drawDocFooters,
  drawStatCard,
  formatCr,
  formatDateTime,
  sanitizeFilename,
} from "./pdfHelpers";

export interface ResultsPdfData {
  analytics: AuctionAnalytics;
  teams?: Team[];
}

export async function generateResultsPdf(data: ResultsPdfData): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { analytics, teams = [] } = data;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Top Brand Header
  const badgeStatus = analytics.provisional ? "PROVISIONAL RESULTS" : "OFFICIAL GAVEL CLOSED";
  let currentY = drawDocHeader(
    doc,
    "Official Auction Tournament Results & Analytics",
    analytics.auctionName || "Live Auction",
    badgeStatus
  );

  // 2. Room Overview Box
  doc.setFillColor(...PDF_COLORS.cardBg);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, currentY, pageWidth - 28, 18, 2, 2, "FD");

  doc.setFillColor(...PDF_COLORS.mint);
  doc.roundedRect(14, currentY, 3, 18, 1, 1, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PDF_COLORS.navyDark);
  doc.text(analytics.auctionName || "ArenaAuction Tournament", 21, currentY + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.textMuted);
  const subtitleInfo = `Room Code: ${analytics.roomCode}   •   Generated: ${formatDateTime()}   •   Status: ${badgeStatus}`;
  doc.text(subtitleInfo, 21, currentY + 13);

  currentY += 22;

  // 3. Aggregate Stats Cards (5 cards across width)
  const cardGap = 2.5;
  const totalCards = 5;
  const cardW = (pageWidth - 28 - cardGap * (totalCards - 1)) / totalCards;
  const cardH = 16;

  drawStatCard(doc, 14, currentY, cardW, cardH, "Teams", analytics.totalTeams.toString(), PDF_COLORS.navyDark);
  drawStatCard(doc, 14 + (cardW + cardGap), currentY, cardW, cardH, "Sold", analytics.playersSold.toString(), PDF_COLORS.mint);
  drawStatCard(doc, 14 + (cardW + cardGap) * 2, currentY, cardW, cardH, "Total Spend", formatCr(analytics.totalSpend), PDF_COLORS.amber);
  drawStatCard(doc, 14 + (cardW + cardGap) * 3, currentY, cardW, cardH, "Unsold", analytics.unsoldPlayers.toString(), PDF_COLORS.red);
  drawStatCard(doc, 14 + (cardW + cardGap) * 4, currentY, cardW, cardH, "Avg Sale", formatCr(analytics.averageSale), PDF_COLORS.cyan);

  currentY += cardH + 6;

  // 4. Auction Highlights & Awards Section
  doc.setFillColor(...PDF_COLORS.navyDark);
  doc.rect(14, currentY, 2.5, 5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.navyDark);
  doc.text("TOURNAMENT HIGHLIGHTS & HONORS", 19, currentY + 4);

  currentY += 6;

  const highlights = [
    [
      "Most Expensive Player",
      analytics.mostExpensivePlayer
        ? `${analytics.mostExpensivePlayer.player.name} (${formatCr(analytics.mostExpensivePlayer.price)})`
        : "None",
      analytics.mostExpensivePlayer?.boughtByTeam || "-",
    ],
    [
      "Biggest Spender Team",
      analytics.biggestSpenderTeam ? analytics.biggestSpenderTeam.teamName : "None",
      analytics.biggestSpenderTeam ? formatCr(analytics.biggestSpenderTeam.totalSpent) : "-",
    ],
    [
      "Highest Remaining Purse",
      analytics.highestRemainingBudget ? analytics.highestRemainingBudget.teamName : "None",
      analytics.highestRemainingBudget ? formatCr(analytics.highestRemainingBudget.budget) : "-",
    ],
    [
      "Most Players Acquired",
      analytics.mostPlayersPurchased ? analytics.mostPlayersPurchased.teamName : "None",
      analytics.mostPlayersPurchased ? `${analytics.mostPlayersPurchased.count} Players` : "-",
    ],
  ];

  if (analytics.longestBiddingWar) {
    highlights.push([
      "Longest Bidding War",
      `${analytics.longestBiddingWar.player.name} (${analytics.longestBiddingWar.totalBids} bids)`,
      formatCr(analytics.longestBiddingWar.finalPrice),
    ]);
  }

  autoTable(doc, {
    startY: currentY,
    head: [["Category / Award", "Player or Team", "Key Metric / Beneficiary"]],
    body: highlights,
    theme: "striped",
    margin: { left: 14, right: 14 },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1.8,
      textColor: PDF_COLORS.textDark,
      lineColor: PDF_COLORS.border,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: PDF_COLORS.navyPanel,
      textColor: PDF_COLORS.white,
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { cellWidth: 70 },
      2: { cellWidth: 62 },
    },
  });

  currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : currentY + 30;

  // 5. Participating Teams Summary Table
  if (teams.length > 0) {
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(...PDF_COLORS.mint);
    doc.rect(14, currentY, 2.5, 5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.navyDark);
    doc.text(`PARTICIPATING TEAMS SUMMARY (${teams.length})`, 19, currentY + 4);

    currentY += 6;

    const teamRows = teams.map((team) => {
      const squad = team.squad || [];
      const topSigning = squad.reduce<any>((prev, curr) => {
        const prevPrice = prev?.soldPrice ?? 0;
        const currPrice = curr.soldPrice ?? 0;
        return currPrice > prevPrice ? curr : prev;
      }, null);

      const topSigningText = topSigning ? `${topSigning.name} (${formatCr(topSigning.soldPrice)})` : "-";

      return [
        team.name,
        team.managerUsername || "Not Assigned",
        squad.length.toString(),
        formatCr(team.budgetTotal),
        formatCr(team.budgetSpent),
        formatCr(team.budgetRemaining),
        topSigningText,
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [["Team Name", "Manager", "Squad", "Starting", "Spent", "Remaining", "Top Signing"]],
      body: teamRows,
      theme: "striped",
      margin: { left: 14, right: 14 },
      styles: {
        font: "helvetica",
        fontSize: 7.2,
        cellPadding: 1.8,
        textColor: PDF_COLORS.textDark,
        lineColor: PDF_COLORS.border,
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: PDF_COLORS.navyPanel,
        textColor: PDF_COLORS.white,
        fontStyle: "bold",
        fontSize: 7.2,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 36 },
        1: { cellWidth: 26 },
        2: { halign: "center", cellWidth: 14 },
        3: { halign: "right", cellWidth: 22 },
        4: { halign: "right", fontStyle: "bold", textColor: PDF_COLORS.amber, cellWidth: 22 },
        5: { halign: "right", fontStyle: "bold", textColor: PDF_COLORS.mint, cellWidth: 22 },
        6: { cellWidth: 40 },
      },
    });

    currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : currentY + 30;
  }

  // 6. Full Transfer Ledger Table
  const transfers = analytics.transfers || [];
  if (transfers.length > 0) {
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFillColor(...PDF_COLORS.cyan);
    doc.rect(14, currentY, 2.5, 5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.navyDark);
    doc.text(`COMPLETE TRANSFER LEDGER (${transfers.length} PLAYERS SOLD)`, 19, currentY + 4);

    currentY += 6;

    const transferRows = transfers.map((t, index) => {
      const base = t.player.basePrice ?? 0;
      const sold = t.price ?? 0;
      const diff = sold - base;
      const premiumText = diff > 0 ? `+${formatCr(diff)}` : diff === 0 ? "At Base" : formatCr(diff);

      return [
        (index + 1).toString(),
        t.player.name,
        t.player.subPosition || t.player.position,
        t.player.ovr?.toString() || "-",
        t.player.club || "-",
        formatCr(base),
        formatCr(sold),
        t.teamName || "-",
        premiumText,
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [["#", "Player", "POS", "OVR", "Club", "Base Price", "Final Price", "Acquired By", "Premium"]],
      body: transferRows,
      theme: "striped",
      margin: { left: 14, right: 14 },
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: 1.5,
        textColor: PDF_COLORS.textDark,
        lineColor: PDF_COLORS.border,
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: PDF_COLORS.navyPanel,
        textColor: PDF_COLORS.white,
        fontStyle: "bold",
        fontSize: 7,
        halign: "center",
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { fontStyle: "bold", cellWidth: 34 },
        2: { halign: "center", cellWidth: 12 },
        3: { halign: "center", fontStyle: "bold", cellWidth: 10 },
        4: { cellWidth: 26 },
        5: { halign: "right", cellWidth: 20 },
        6: { halign: "right", fontStyle: "bold", textColor: PDF_COLORS.mint, cellWidth: 22 },
        7: { cellWidth: 30 },
        8: { halign: "right", cellWidth: 20 },
      },
    });

    currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : currentY + 30;
  }

  // 7. Unsold Players Section
  const unsoldList = analytics.unsoldList || [];
  if (currentY > pageHeight - 35) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(...PDF_COLORS.red);
  doc.rect(14, currentY, 2.5, 5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.navyDark);
  doc.text(`UNSOLD & RECALL ROSTER (${unsoldList.length})`, 19, currentY + 4);

  currentY += 6;

  if (unsoldList.length === 0) {
    doc.setFillColor(...PDF_COLORS.cardBg);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.roundedRect(14, currentY, pageWidth - 28, 14, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text("All listed players were successfully sold during the auction. Zero unsold players.", 18, currentY + 9);

    currentY += 20;
  } else {
    const unsoldRows = unsoldList.map((p, idx) => [
      (idx + 1).toString(),
      p.name,
      p.subPosition || p.position,
      p.ovr?.toString() || "-",
      p.club || "-",
      p.nationality || "-",
      formatCr(p.basePrice),
      "Unsold / Passed",
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["#", "Player", "POS", "OVR", "Club", "Nationality", "Base Price", "Status"]],
      body: unsoldRows,
      theme: "striped",
      margin: { left: 14, right: 14 },
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: 1.5,
        textColor: PDF_COLORS.textDark,
        lineColor: PDF_COLORS.border,
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: PDF_COLORS.navyPanel,
        textColor: PDF_COLORS.white,
        fontStyle: "bold",
        fontSize: 7,
        halign: "center",
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { fontStyle: "bold", cellWidth: 40 },
        2: { halign: "center", cellWidth: 14 },
        3: { halign: "center", cellWidth: 12 },
        4: { cellWidth: 32 },
        5: { cellWidth: 26 },
        6: { halign: "right", cellWidth: 22 },
        7: { halign: "center", textColor: PDF_COLORS.red, cellWidth: 28 },
      },
    });

    currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : currentY + 30;
  }

  // 8. Draw Footers on every page
  drawDocFooters(doc, analytics.roomCode);

  // 9. Save file
  const cleanAuction = sanitizeFilename(analytics.auctionName || "Auction");
  const cleanRoom = sanitizeFilename(analytics.roomCode || "Room");
  doc.save(`${cleanAuction}_${cleanRoom}_Results.pdf`);
}
