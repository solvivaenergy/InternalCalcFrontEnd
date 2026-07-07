// =============================================================================
// PDF GENERATOR — v3-61
// =============================================================================
// Compiles a Solviva solar proposal PDF combining vector-rendered text pages
// (cover/overview, Step 1 inputs, T&C, Warranties, Schedule of Payments) and
// captured PNG snapshots of the live React components (Visualizing your system
// from the Calculator tab, Quote Summary tab).
//
// Page sequence (rep-mode):
//   1  Cover / overview      — vector text, 3 stat-tile rows + definitions + disclaimer
//   2  Step 1                — vector text, 1A-1D left column + donut/tiles right column
//   3  Visualizing your system — PNG snapshot (Radiance + Coverage + CFEI)
//   4  Quote Summary           — PNG snapshot (Step 2 line items + Step 3 cascade)
//   5+ Schedule of Payments    — vector autotable, paginates as needed
//   N  Terms & Conditions + Warranties — vector text, on its own page(s)
//
// Charts and Summary are PNG snapshots (captured before generation by App.jsx
// via html2canvas) so the PDF renders pixel-identical to what the rep sees on
// screen — no SVG re-implementation, no glyph fallback issues. The Schedule
// stays as a vector autotable so the 60 monthly rows are selectable and
// searchable in PDF readers.
//
// Currency note: Helvetica (jsPDF's default core font) lacks the U+20B1 peso
// glyph and U+2212 minus-sign glyph. Vector pages use "PHP " prefix and ASCII
// hyphen. Snapshots render with the live UI's actual ₱ symbol because they
// are pixel images, not text.
// =============================================================================

import jspdfModule from 'jspdf';
import autoTableModule from 'jspdf-autotable';

const jsPDF = jspdfModule.jsPDF || jspdfModule.default || jspdfModule;
const autoTable = (typeof autoTableModule === 'function')
  ? autoTableModule
  : (autoTableModule.default && typeof autoTableModule.default === 'function'
      ? autoTableModule.default
      : (autoTableModule.default && autoTableModule.default.default) || autoTableModule);

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const C = {
  brandGreen:   [37,  84,  58],
  cream:        [245, 241, 232],
  divider:      [229, 225, 214],
  textBody:     [31,  41,  55],
  textMuted:    [107, 114, 128],
  textTertiary: [156, 163, 175],
  brandOrange:  [232, 119,  34],
  white:        [255, 255, 255],
  surfaceCard:  [250, 250, 247],
};

const NEG = '-';

// ─── Currency / number formatters ───────────────────────────────────────────

function peso(v) {
  if (v == null || isNaN(v)) return '\u2014';
  return 'PHP ' + Number(v).toLocaleString('en-PH', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
}

function pct(v, decimals = 1) {
  if (v == null || isNaN(v)) return '\u2014';
  return (v * 100).toFixed(decimals) + '%';
}

function fmtDate(d) {
  if (!(d instanceof Date)) return '';
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function makeQuoteRef(generatedDate, contact) {
  const name = (contact?.name || 'X').toLowerCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  const dayOfYear = Math.floor(
    (generatedDate - new Date(generatedDate.getFullYear(), 0, 0)) / 86400000
  );
  const suffix = String(Math.abs(h ^ dayOfYear) % 10000).padStart(4, '0');
  return `SV-${generatedDate.getFullYear()}-${suffix}`;
}

function formatTimeOfDay(h) {
  if (h == null || isNaN(h)) return '\u2014';
  const hour = Math.floor(h);
  const min = Math.round((h - hour) * 60);
  const period = hour >= 12 ? 'PM' : 'AM';
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  return `${displayHour}:${String(min).padStart(2, '0')} ${period}`;
}

// ─── Page manager ───────────────────────────────────────────────────────────

function makePageManager(doc, ctx) {
  const mgr = {
    doc, ctx,
    y: MARGIN,
    pageNumber: 1,
    footerStamps: [],
  };
  drawFooter(mgr);
  return mgr;
}

function newPage(mgr) {
  mgr.doc.addPage();
  mgr.pageNumber++;
  mgr.y = MARGIN;
  drawFooter(mgr);
}

function pageBreakIfNeeded(mgr, reservedHeight) {
  if (mgr.y + reservedHeight > PAGE_H - 22) newPage(mgr);
}

/**
 * After an autotable runs, reconcile mgr.pageNumber to the actual number of
 * pages in the PDF, stamping a footer on any pages autotable silently added
 * without firing didAddPage. This ensures finalizeFooters knows about every
 * page that exists and re-renders "N / total" correctly.
 */
function reconcilePageNumber(mgr) {
  const actualPageCount = mgr.doc.internal.getNumberOfPages();
  while (mgr.pageNumber < actualPageCount) {
    mgr.pageNumber++;
    mgr.doc.setPage(mgr.pageNumber);
    drawFooter(mgr);
  }
  mgr.doc.setPage(mgr.pageNumber);
}

function drawFooter(mgr) {
  const { doc, ctx, pageNumber } = mgr;
  const footerY = PAGE_H - 12;
  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, footerY - 3, PAGE_W - MARGIN, footerY - 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.textTertiary);
  const leftText = `${ctx.brand?.legalEntity || 'Solviva Energy Corporation'} \u00B7 Confidential proposal for ${ctx.contact?.name || 'customer'}`;
  doc.text(leftText, MARGIN, footerY);
  mgr.footerStamps.push({ pageNumber, y: footerY });
  doc.text(`${pageNumber} / ?`, PAGE_W - MARGIN, footerY, { align: 'right' });
}

function finalizeFooters(mgr) {
  const total = mgr.pageNumber;
  for (const stamp of mgr.footerStamps) {
    mgr.doc.setPage(stamp.pageNumber);
    // Cover the placeholder thoroughly (page numbers can be 2-3 chars)
    mgr.doc.setFillColor(...C.white);
    mgr.doc.rect(PAGE_W - MARGIN - 25, stamp.y - 4, 25, 6, 'F');
    mgr.doc.setFont('helvetica', 'normal');
    mgr.doc.setFontSize(7.5);
    mgr.doc.setTextColor(...C.textTertiary);
    mgr.doc.text(`${stamp.pageNumber} / ${total}`, PAGE_W - MARGIN, stamp.y, { align: 'right' });
  }
  mgr.doc.setPage(total);
}

// ─── Layout primitives ──────────────────────────────────────────────────────

function drawSectionHeader(mgr, eyebrow, title) {
  pageBreakIfNeeded(mgr, 14);
  const startY = mgr.y;
  mgr.doc.setFillColor(...C.brandGreen);
  mgr.doc.rect(MARGIN, startY, 1.2, 9, 'F');
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(8);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text(eyebrow, MARGIN + 4, startY + 3.5);
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(13);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text(title, MARGIN + 4, startY + 8.5);
  mgr.y = startY + 12;
}

function drawSubHeading(mgr, text) {
  pageBreakIfNeeded(mgr, 6);
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text(text.toUpperCase(), MARGIN, mgr.y + 3);
  mgr.y += 4.5;
}

function drawParagraph(mgr, text, opts = {}) {
  const { fontSize = 9, color = C.textBody, italic = false, bold = false } = opts;
  mgr.doc.setFont('helvetica', italic ? 'italic' : (bold ? 'bold' : 'normal'));
  mgr.doc.setFontSize(fontSize);
  mgr.doc.setTextColor(...color);
  const lineHeight = fontSize * 0.42;
  const lines = mgr.doc.splitTextToSize(text, CONTENT_W);
  pageBreakIfNeeded(mgr, lines.length * lineHeight + 2);
  for (const line of lines) {
    mgr.doc.text(line, MARGIN, mgr.y + lineHeight * 0.7);
    mgr.y += lineHeight;
  }
  mgr.y += 1.5;
}

function drawBullets(mgr, items, opts = {}) {
  const { fontSize = 9, indent = 4, bulletChar = '\u2022' } = opts;
  const lineHeight = fontSize * 0.42;
  const textIndent = indent + 3;
  const maxWidth = CONTENT_W - textIndent;

  for (const item of items) {
    let term = '', rest = '', italic = false;
    if (typeof item === 'string') {
      rest = item;
    } else {
      term = item.term || '';
      rest = item.rest || '';
      italic = !!item.italic;
    }
    const isNumbered = /^\d+\.$/.test(term);

    const tokens = [];
    if (term) tokens.push({ text: term + ' ', bold: true, italic });
    const words = rest.trim().match(/\S+\s*/g) || [];
    for (const w of words) tokens.push({ text: w, bold: false, italic });

    const lines = [];
    let curLine = [];
    let curWidth = 0;
    for (const tok of tokens) {
      mgr.doc.setFont('helvetica',
        tok.bold ? (tok.italic ? 'bolditalic' : 'bold')
                 : (tok.italic ? 'italic' : 'normal'));
      mgr.doc.setFontSize(fontSize);
      const w = mgr.doc.getTextWidth(tok.text);
      if (curWidth + w > maxWidth && curLine.length > 0) {
        lines.push(curLine);
        curLine = [tok];
        curWidth = w;
      } else {
        curLine.push(tok);
        curWidth += w;
      }
    }
    if (curLine.length > 0) lines.push(curLine);

    const totalH = lines.length * lineHeight + 1.5;
    pageBreakIfNeeded(mgr, totalH + 1.5);

    if (!isNumbered) {
      mgr.doc.setFont('helvetica', 'normal');
      mgr.doc.setFontSize(fontSize);
      mgr.doc.setTextColor(...C.textBody);
      mgr.doc.text(bulletChar, MARGIN + indent, mgr.y + lineHeight * 0.7);
    }

    let curY = mgr.y + lineHeight * 0.7;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let curX = MARGIN + textIndent;
      for (const tok of line) {
        mgr.doc.setFont('helvetica',
          tok.bold ? (tok.italic ? 'bolditalic' : 'bold')
                   : (tok.italic ? 'italic' : 'normal'));
        mgr.doc.setFontSize(fontSize);
        mgr.doc.setTextColor(...C.textBody);
        mgr.doc.text(tok.text, curX, curY);
        curX += mgr.doc.getTextWidth(tok.text);
      }
      if (li < lines.length - 1) curY += lineHeight;
    }
    mgr.y += totalH;
  }
}

// ─── Page 1: Cover / Overview ───────────────────────────────────────────────

function drawCoverPage1(mgr) {
  const { ctx } = mgr;
  const { contact, agent, generatedDate, validUntil, quoteRef, adminParams } = ctx;

  // Header band
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(13);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text('SOLVIVA ENERGY', MARGIN, MARGIN + 4);
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text('solar \u00B7 battery \u00B7 returns', MARGIN, MARGIN + 8);
  mgr.doc.setFontSize(8.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(`Quote ref. ${quoteRef}`, PAGE_W - MARGIN, MARGIN + 3.5, { align: 'right' });
  mgr.doc.text(`Generated ${fmtDate(generatedDate)}`, PAGE_W - MARGIN, MARGIN + 8, { align: 'right' });
  mgr.doc.setDrawColor(...C.brandGreen);
  mgr.doc.setLineWidth(0.5);
  mgr.doc.line(MARGIN, MARGIN + 11, PAGE_W - MARGIN, MARGIN + 11);
  mgr.y = MARGIN + 14;

  // Title
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(8);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text('SOLAR PACKAGE PROPOSAL', MARGIN, mgr.y + 3);
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(20);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text('Your home solar & battery quote', MARGIN, mgr.y + 11);
  mgr.y += 16;

  // Customer + agent panels
  // v3-61: left panel now carries the proposed installation site; right panel
  // is "PREPARED BY" showing the selling agent's name + contact (both are
  // guaranteed populated — the rep-mode PDF gate requires them).
  const panelW = (CONTENT_W - 4) / 2;
  const panelH = 34;
  const rightX = MARGIN + panelW + 4;

  // ── Left: PREPARED FOR ──
  mgr.doc.setFillColor(...C.cream);
  mgr.doc.roundedRect(MARGIN, mgr.y, panelW, panelH, 1, 1, 'F');
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text('PREPARED FOR', MARGIN + 3, mgr.y + 4);
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(10.5);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text(contact?.name || '', MARGIN + 3, mgr.y + 9);
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setFontSize(8);
  mgr.doc.setTextColor(...C.textMuted);
  if (contact?.email) mgr.doc.text(contact.email, MARGIN + 3, mgr.y + 13);
  if (contact?.mobile) mgr.doc.text(contact.mobile, MARGIN + 3, mgr.y + 16.5);
  // Divider + installation site
  mgr.doc.setDrawColor(...C.divider);
  mgr.doc.setLineWidth(0.2);
  mgr.doc.line(MARGIN + 3, mgr.y + 19.5, MARGIN + panelW - 3, mgr.y + 19.5);
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(6.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text('INSTALLATION SITE', MARGIN + 3, mgr.y + 23.5);
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setFontSize(7.8);
  mgr.doc.setTextColor(...C.textBody);
  const addrLines = mgr.doc.splitTextToSize(contact?.installAddress || '', panelW - 6).slice(0, 2);
  addrLines.forEach((ln, i) => mgr.doc.text(ln, MARGIN + 3, mgr.y + 27.5 + i * 3.4));

  // ── Right: PREPARED BY ──
  mgr.doc.setFillColor(...C.cream);
  mgr.doc.roundedRect(rightX, mgr.y, panelW, panelH, 1, 1, 'F');
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text('PREPARED BY', rightX + 3, mgr.y + 4);
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(10.5);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text(agent?.name || 'Solviva Customer Support', rightX + 3, mgr.y + 9);
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setFontSize(8);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(agent?.email || 'hello@solvivaenergy.com', rightX + 3, mgr.y + 13);
  mgr.doc.text(agent?.phone || '0917-802-8948', rightX + 3, mgr.y + 16.5);
  mgr.doc.setDrawColor(...C.divider);
  mgr.doc.line(rightX + 3, mgr.y + 19.5, rightX + panelW - 3, mgr.y + 19.5);
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(8.5);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text(`Quote valid until ${fmtDate(validUntil)}`, rightX + 3, mgr.y + 24);
  mgr.y += panelH + 4;

  // 3 stat-tile rows
  drawSystemRow(mgr);
  mgr.y += 3;
  drawQuoteAtAGlanceRow(mgr);
  mgr.y += 3;
  drawSavingsRow(mgr);
  mgr.y += 5;

  // Definitions
  drawSubHeading(mgr, 'What do these numbers mean?');
  const paybackNote = ctx.disclaimers?.paybackNote || adminParams?.paybackNote || [];
  drawBullets(mgr, paybackNote, { fontSize: 7.5, indent: 0, bulletChar: '' });
  mgr.y += 2;

  // Disclaimer
  drawDisclaimerCallout(mgr);
}

function drawSystemRow(mgr) {
  const { ctx } = mgr;
  const { state, model } = ctx;

  const recPanelCount = model.recommended?.recommendedPanelCount ?? 0;
  const panelCount = state.panelCount ?? recPanelCount;
  const panelWatts = model.recommended?.panelWatts ?? 630;
  const systemKwp = model.systemKwp ?? (panelCount * panelWatts / 1000);
  const batteryKwh = model.batteryKwh ?? 0;

  const inverters = (model.effectiveInverters || []).filter(inv => inv && inv.ratedKw);
  const inverterKws = inverters.map(inv => Number(inv.ratedKw));
  const inverterTotalKw = inverterKws.reduce((a, b) => a + b, 0);
  const inverterSub = inverterKws.length > 0
    ? inverterKws.map(kw => `${kw} kW`).join(', ')
    : '\u2014';

  // v3-54: Battery unit-size for the "BATTERIES" tile sub-text reads from
  // the active battery package on the model (resolved by App.jsx via
  // resolveBatteryPackage). Falls back to legacy 5 if absent.
  const batteryUnitKwh = model.activeBatteryPackage?.batteryUnitKwh
                      || state.batteryUnitKwh
                      || 5;
  const batteryUnitCount = batteryKwh > 0 ? Math.ceil(batteryKwh / batteryUnitKwh) : 0;
  const batterySub = batteryUnitCount > 0
    ? `${batteryUnitCount} \u00D7 ${batteryUnitKwh} kWh`
    : '\u2014';

  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text('YOUR SYSTEM', MARGIN, mgr.y + 3);
  mgr.y += 5;

  const tileW = (CONTENT_W - 6) / 3;
  const tileH = 22;
  const tiles = [
    { label: 'SOLAR ARRAY', bigNum: `${systemKwp.toFixed(1)} kWp`, sub: `${panelCount} \u00D7 ${panelWatts}W` },
    { label: 'BATTERIES',   bigNum: `${batteryKwh.toFixed(1)} kWh`, sub: batterySub },
    { label: 'INVERTER(S)', bigNum: `${inverterTotalKw} kW`, sub: inverterSub },
  ];
  tiles.forEach((t, i) => {
    const tx = MARGIN + i * (tileW + 3);
    mgr.doc.setFillColor(...C.cream);
    mgr.doc.roundedRect(tx, mgr.y, tileW, tileH, 1, 1, 'F');
    mgr.doc.setFont('helvetica', 'bold');
    mgr.doc.setFontSize(6.5);
    mgr.doc.setTextColor(...C.textMuted);
    mgr.doc.text(t.label, tx + 3, mgr.y + 4);
    mgr.doc.setFont('helvetica', 'bold');
    mgr.doc.setFontSize(16);
    mgr.doc.setTextColor(...C.brandGreen);
    mgr.doc.text(t.bigNum, tx + 3, mgr.y + 12);
    mgr.doc.setFont('helvetica', 'normal');
    mgr.doc.setFontSize(8);
    mgr.doc.setTextColor(...C.textBody);
    mgr.doc.text(t.sub, tx + 3, mgr.y + 17.5);
  });
  mgr.y += tileH;
}

function drawQuoteAtAGlanceRow(mgr) {
  const { ctx } = mgr;
  const { state, model } = ctx;
  const terms = model.terms || {};
  const tenor = state.tenor ?? 60;
  const totalDue = terms.totalAmountDue ?? 0;
  const dpAmount = terms.dpTotalCharge ?? 0;
  const postBalance = terms.finalPostInstallBalance ?? 0;
  const monthlyPmt = terms.customerMonthlyPmt ?? 0;

  // v3-60: the "TENOR (via Credit Card Pmt Plan)" variant and its column
  // widening were removed along with the credit-card balance option. The
  // TENOR label is static and the column keeps its narrow 0.55 ratio.
  const tenorLabel = 'TENOR';
  const tenorRatio = 0.55;

  // Band height 32mm to accommodate 22pt big numbers.
  // Layout: TENOR gets a narrower column since "36" / "Months" need much less
  // width than 7-digit peso amounts. Width ratios: 1.15 / 1.15 / 1.15 / 0.55 /
  // 1.15 = total 5.15. Thin lifted-green dividers between columns visually
  // separate the metrics without breaking the unified band.
  const bandY = mgr.y;
  const bandH = 32;
  mgr.doc.setFillColor(...C.brandGreen);
  mgr.doc.roundedRect(MARGIN, bandY, CONTENT_W, bandH, 1, 1, 'F');

  // Eyebrow
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(...C.white);
  mgr.doc.text('QUOTE AT A GLANCE', MARGIN + 3, bandY + 4);

  // Y baselines — IDENTICAL across all columns so PHP/Months align and
  // big numbers align.
  const LABEL_Y    = bandY + 11;
  const LABEL_Y2   = bandY + 14;
  const UNIT_Y     = bandY + 20;
  const NUMBER_Y   = bandY + 28;

  // Variable-width columns
  const cols = [
    { label: 'TOTAL\nAMOUNT DUE',     unit: 'PHP',    number: peso(totalDue).replace('PHP ', ''),     ratio: 1.15 },
    { label: 'PRE-INSTALL\nDOWN PMT', unit: 'PHP',    number: peso(dpAmount).replace('PHP ', ''),     ratio: 1.15 },
    { label: 'POST-INSTALL\nBALANCE', unit: 'PHP',    number: peso(postBalance).replace('PHP ', ''),  ratio: 1.15 },
    { label: tenorLabel,              unit: 'Months', number: String(tenor),                          ratio: tenorRatio },
    { label: 'MONTHLY\nPAYMENT',      unit: 'PHP',    number: peso(monthlyPmt).replace('PHP ', ''),   ratio: 1.15 },
  ];
  const totalRatio = cols.reduce((s, c) => s + c.ratio, 0);
  const unitW = CONTENT_W / totalRatio;

  // Compute each column's [startX, width]
  let curX = MARGIN;
  const colBounds = cols.map(c => {
    const w = c.ratio * unitW;
    const bounds = { x: curX, w };
    curX += w;
    return bounds;
  });

  // Render text per column, with 3mm padding from each column's left edge
  const PAD = 3;
  const RIGHT_GUTTER = 2;

  // Determine ONE big-number font size shared by every column. Step down from
  // 22pt until the widest number fits inside its own column. Using a single
  // size keeps the band visually consistent — without this, a 7-digit
  // "Amount Due" would shrink while a 4-digit figure stayed large, and worse,
  // an unshrunk number would overflow into the next column (the "millions"
  // collision bug). Each column is measured against its own available width
  // since column widths differ (TENOR is narrower).
  mgr.doc.setFont('helvetica', 'bold');
  let numFontSize = 22;
  const numFits = (size) => {
    mgr.doc.setFontSize(size);
    return cols.every((col, i) => {
      const availW = colBounds[i].w - PAD - RIGHT_GUTTER;
      return mgr.doc.getTextWidth(col.number) <= availW;
    });
  };
  while (numFontSize > 9 && !numFits(numFontSize)) {
    numFontSize -= 0.5;
  }

  cols.forEach((col, i) => {
    const tx = colBounds[i].x + PAD;

    // Label (1 or 2 lines)
    mgr.doc.setFont('helvetica', 'bold');
    mgr.doc.setFontSize(7);
    mgr.doc.setTextColor(...C.white);
    const labelLines = col.label.split('\n');
    labelLines.forEach((line, idx) => {
      mgr.doc.text(line, tx, idx === 0 ? LABEL_Y : LABEL_Y2);
    });

    // Unit row — identical font and Y across all columns
    mgr.doc.setFont('helvetica', 'normal');
    mgr.doc.setFontSize(9);
    mgr.doc.setTextColor(...C.white);
    mgr.doc.text(col.unit, tx, UNIT_Y);

    // Big number — uniform auto-fit font size (computed above) so 7+ digit
    // peso figures (millions) stay inside their own column.
    mgr.doc.setFont('helvetica', 'bold');
    mgr.doc.setFontSize(numFontSize);
    mgr.doc.setTextColor(...C.white);
    mgr.doc.text(col.number, tx, NUMBER_Y);
  });

  // Thin dividers between columns. Lifted-green color reads as "subtle white
  // line" against the brand-green band — easier on the eye than pure white.
  // Vertical extent: from just below the eyebrow row to near the band bottom.
  mgr.doc.setDrawColor(95, 130, 110);  // brand green lifted ~30% toward white
  mgr.doc.setLineWidth(0.2);
  for (let i = 1; i < cols.length; i++) {
    const dx = colBounds[i].x;
    mgr.doc.line(dx, bandY + 8, dx, bandY + bandH - 3);
  }

  mgr.y = bandY + bandH;
}

function drawSavingsRow(mgr) {
  const { ctx } = mgr;
  const { state, model } = ctx;
  const cf = model.cashFlows || {};
  const irrYears = state.irrYears ?? 25;

  // Payback — keep full-form "6-Years & 9-Months", but split onto TWO LINES
  // matching the live Calculator tab's design ("6-Years" / "& 9-Months").
  const paybackLabelLong = (cf.paybackLabel || '\u2014')
    .replace(/\u2011/g, '-').replace(/\u00A0/g, ' ');
  // Try to split on " & " — if present, line 1 = before, line 2 = "& <rest>"
  let paybackLine1 = paybackLabelLong;
  let paybackLine2 = '';
  const ampIdx = paybackLabelLong.indexOf(' & ');
  if (ampIdx > 0) {
    paybackLine1 = paybackLabelLong.substring(0, ampIdx);
    paybackLine2 = '& ' + paybackLabelLong.substring(ampIdx + 3);
  }

  const irrLabel = cf.irr != null ? pct(cf.irr, 1) : '\u2014';
  const lcoeLabel = cf.lcoe != null ? `PHP ${cf.lcoe.toFixed(2)}/kWh` : '\u2014';
  // LCOE subnote — pulls live utility rate from state
  const utilityRate = Number(state.utilityRate || 0);
  const lcoeSubnote = utilityRate > 0
    ? `Compare to your current PHP ${utilityRate.toFixed(2)}/kWh`
    : '';
  // DU savings — full peso amount, NOT the "PHP 4.66M" abbreviation
  const duSavings = cf.totalDuSavings ?? 0;
  const duSavingsLabel = peso(duSavings);

  // Section header
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text('YOUR SAVINGS', MARGIN, mgr.y + 3);
  mgr.y += 5;

  // Tall cream tiles — bumped from 11mm to 28mm so big numbers get room.
  // Layout per tile:
  //   3.5mm  small bold muted label (UPPERCASE, 6.5pt)
  //   16mm   big bold green number (16pt)
  //   24mm   optional subnote (small muted, 7pt)
  // Payback tile uses two stacked big-number lines instead of one.
  const tileW = (CONTENT_W - 9) / 4;
  const tileH = 28;
  const tileY = mgr.y;

  const tiles = [
    {
      label: 'SIMPLE PAYBACK PERIOD',
      kind: 'two-line',
      line1: paybackLine1,
      line2: paybackLine2,
    },
    {
      label: `INTERNAL RATE OF RETURN (${irrYears}-YR)`,
      kind: 'big',
      value: irrLabel,
    },
    {
      label: 'LEVELIZED COST OF ENERGY',
      kind: 'big',
      value: lcoeLabel,
      subnote: lcoeSubnote,
    },
    {
      label: `${irrYears}-YR DU SAVINGS`,
      kind: 'big',
      value: duSavingsLabel,
    },
  ];

  tiles.forEach((t, i) => {
    const tx = MARGIN + i * (tileW + 3);
    // Background
    mgr.doc.setFillColor(...C.cream);
    mgr.doc.roundedRect(tx, tileY, tileW, tileH, 1, 1, 'F');

    // Label (small uppercase, top of tile)
    mgr.doc.setFont('helvetica', 'bold');
    mgr.doc.setFontSize(6.5);
    mgr.doc.setTextColor(...C.textMuted);
    // Wrap the label if it's too wide for the tile
    const labelLines = mgr.doc.splitTextToSize(t.label, tileW - 6);
    labelLines.forEach((line, idx) => {
      mgr.doc.text(line, tx + 3, tileY + 4 + idx * 2.5);
    });

    if (t.kind === 'two-line') {
      // Stacked big numbers — line 1 + line 2
      mgr.doc.setFont('helvetica', 'bold');
      mgr.doc.setFontSize(15);
      mgr.doc.setTextColor(...C.brandGreen);
      mgr.doc.text(t.line1, tx + 3, tileY + 16);
      if (t.line2) {
        mgr.doc.text(t.line2, tx + 3, tileY + 23);
      }
    } else {
      // Single big number, optional subnote below
      mgr.doc.setFont('helvetica', 'bold');
      mgr.doc.setFontSize(15);
      mgr.doc.setTextColor(...C.brandGreen);
      mgr.doc.text(t.value, tx + 3, tileY + 18);
      if (t.subnote) {
        mgr.doc.setFont('helvetica', 'normal');
        mgr.doc.setFontSize(6.5);
        mgr.doc.setTextColor(...C.textMuted);
        const subLines = mgr.doc.splitTextToSize(t.subnote, tileW - 6);
        subLines.forEach((line, idx) => {
          mgr.doc.text(line, tx + 3, tileY + 23 + idx * 2.5);
        });
      }
    }
  });

  mgr.y = tileY + tileH;
}

function drawDisclaimerCallout(mgr) {
  const { ctx } = mgr;
  const disclaimers = ctx.disclaimers || ctx.adminParams || {};
  const disBefore = disclaimers.irrDisclaimerBefore || '';
  const disHigh = disclaimers.irrDisclaimerHighlight || '';
  const disAfter = disclaimers.irrDisclaimerAfter || '';

  const tokens = [
    // Note: irrDisclaimerBefore already begins with "DISCLAIMER:" — split the
    // first word to render it bold while the rest of the sentence stays normal.
    ...(disBefore.match(/\S+\s*/g) || []).map((w, i) => ({ text: w, bold: i === 0 })),
    ...(disHigh.match(/\S+\s*/g) || []).map(w => ({ text: w, bold: true })),
    ...(disAfter.match(/\S+\s*/g) || []).map(w => ({ text: w, bold: false })),
  ];
  const fontSize = 7;
  const lineHeight = fontSize * 0.42;
  const padX = 4;
  const maxW = CONTENT_W - 2 * padX;
  const lines = [];
  let curLine = [];
  let curWidth = 0;
  for (const tok of tokens) {
    mgr.doc.setFont('helvetica', tok.bold ? 'bold' : 'normal');
    mgr.doc.setFontSize(fontSize);
    const w = mgr.doc.getTextWidth(tok.text);
    if (curWidth + w > maxW && curLine.length > 0) {
      lines.push(curLine);
      curLine = [tok];
      curWidth = w;
    } else {
      curLine.push(tok);
      curWidth += w;
    }
  }
  if (curLine.length > 0) lines.push(curLine);

  const blockH = lines.length * lineHeight + 4;
  pageBreakIfNeeded(mgr, blockH + 2);
  const startY = mgr.y;
  mgr.doc.setFillColor(...C.surfaceCard);
  mgr.doc.rect(MARGIN, startY, CONTENT_W, blockH, 'F');
  mgr.doc.setFillColor(...C.brandGreen);
  mgr.doc.rect(MARGIN, startY, 0.7, blockH, 'F');
  let curY = startY + 2 + lineHeight * 0.7;
  for (const line of lines) {
    let curX = MARGIN + padX;
    for (const tok of line) {
      mgr.doc.setFont('helvetica', tok.bold ? 'bold' : 'normal');
      mgr.doc.setFontSize(fontSize);
      mgr.doc.setTextColor(...C.textBody);
      mgr.doc.text(tok.text, curX, curY);
      curX += mgr.doc.getTextWidth(tok.text);
    }
    curY += lineHeight;
  }
  mgr.y = startY + blockH + 2;
}

// ─── Page 2: Step 1 (vector) ────────────────────────────────────────────────

function drawStep1Page(mgr) {
  const { ctx } = mgr;
  const { state, model, contact, quoteRef } = ctx;
  const recommended = model.recommended || {};

  // Slim subsequent-page header
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(10);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text('SOLVIVA ENERGY', MARGIN, MARGIN + 3);
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(`${contact?.name || ''} \u00B7 ${quoteRef}`, PAGE_W - MARGIN, MARGIN + 3, { align: 'right' });
  mgr.doc.setDrawColor(...C.divider);
  mgr.doc.setLineWidth(0.2);
  mgr.doc.line(MARGIN, MARGIN + 5, PAGE_W - MARGIN, MARGIN + 5);
  mgr.y = MARGIN + 9;

  drawSectionHeader(mgr, 'STEP 1', 'Tell us about your consumption');
  mgr.y += 1;

  const leftW = CONTENT_W * 0.6 - 3;
  const rightX = MARGIN + leftW + 6;
  const rightW = CONTENT_W - leftW - 6;
  const splitStartY = mgr.y;

  // ─── LEFT (1A-1D) ───
  let leftY = splitStartY;
  const drawKeyVal = (sub, label, value) => {
    if (sub) {
      mgr.doc.setFont('helvetica', 'bold');
      mgr.doc.setFontSize(7);
      mgr.doc.setTextColor(...C.brandGreen);
      mgr.doc.text(sub, MARGIN, leftY + 3);
      leftY += 4.5;
    }
    mgr.doc.setFont('helvetica', 'normal');
    mgr.doc.setFontSize(8.5);
    mgr.doc.setTextColor(...C.textMuted);
    mgr.doc.text(label, MARGIN, leftY + 3);
    mgr.doc.setFont('helvetica', 'bold');
    mgr.doc.setTextColor(...C.textBody);
    mgr.doc.text(value, MARGIN + leftW, leftY + 3, { align: 'right' });
    leftY += 4.5;
    mgr.doc.setDrawColor(...C.divider);
    mgr.doc.setLineWidth(0.15);
    mgr.doc.line(MARGIN, leftY, MARGIN + leftW, leftY);
    leftY += 0.5;
  };

  drawKeyVal('1A \u00B7 ELECTRIC SERVICE', 'Service type',
    state.phase === 3 ? 'Three-phase' : 'Single-phase');
  leftY += 2;
  drawKeyVal('1B \u00B7 UTILITY RATE', 'Rate per kWh', `PHP ${Number(state.utilityRate || 0).toFixed(2)}`);
  leftY += 2;
  drawKeyVal('1C \u00B7 MONTHLY BILL', 'Bill amount', peso(state.monthlyBill));
  leftY += 2;

  // 1D
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text('1D \u00B7 MAJOR DEVICES', MARGIN, leftY + 3);
  leftY += 4.5;

  const devRows = (state.deviceRows || [])
    .filter(r => r && r.deviceName)
    .map(r => ({
      name: r.deviceName,
      count: r.count || 0,
      on: formatTimeOfDay(r.onTime),
      off: formatTimeOfDay(r.offTime),
      days: r.daysPerWeek ?? 7,
    }));

  if (devRows.length > 0) {
    autoTable(mgr.doc, {
      startY: leftY,
      head: [['Device', 'Count', 'On', 'Off', 'd/wk']],
      body: devRows.map(r => [r.name, r.count, r.on, r.off, r.days]),
      tableWidth: leftW,
      margin: { left: MARGIN },
      styles: {
        font: 'helvetica', fontSize: 7.5, cellPadding: 1.2,
        textColor: C.textBody, lineColor: C.divider, lineWidth: 0.15,
      },
      headStyles: {
        fillColor: C.cream, textColor: C.textMuted,
        fontStyle: 'bold', fontSize: 6.5,
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 11 },
        2: { halign: 'right', cellWidth: 16 },
        3: { halign: 'right', cellWidth: 16 },
        4: { halign: 'right', cellWidth: 12 },
      },
    });
    leftY = mgr.doc.lastAutoTable.finalY;
  } else {
    mgr.doc.setFont('helvetica', 'italic');
    mgr.doc.setFontSize(7.5);
    mgr.doc.setTextColor(...C.textTertiary);
    mgr.doc.text('No devices listed', MARGIN, leftY + 3);
    leftY += 5;
  }

  // ─── RIGHT (donut + tiles) ───
  let rightY = splitStartY;
  const donutCardH = 50;
  mgr.doc.setFillColor(...C.cream);
  mgr.doc.roundedRect(rightX, rightY, rightW, donutCardH, 1, 1, 'F');
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(6.5);
  mgr.doc.setTextColor(...C.textMuted);
  const titleText = 'EST. MONTHLY CONSUMPTION';
  const titleW = mgr.doc.getTextWidth(titleText);
  mgr.doc.text(titleText, rightX + (rightW - titleW) / 2, rightY + 4);

  // Donut
  const dayKwh = recommended.dayTimeKwh ?? 0;
  const nightKwh = recommended.nightTimeKwh ?? 0;
  const totalKwh = recommended.estMonthlyKwh ?? (dayKwh + nightKwh);
  const total = Math.max(0.0001, dayKwh + nightKwh);
  const dayPct = dayKwh / total;
  const cx = rightX + rightW / 2;
  const cy = rightY + 22;
  const rOuter = 13;
  const rInner = 9;
  const DAY_COLOR = [59, 130, 196];
  const NIGHT_COLOR = [31, 58, 95];

  const drawArc = (startFrac, endFrac, color) => {
    const segments = 64;
    const startAngle = -Math.PI / 2 + startFrac * 2 * Math.PI;
    const endAngle = -Math.PI / 2 + endFrac * 2 * Math.PI;
    mgr.doc.setFillColor(...color);
    for (let i = 0; i < segments; i++) {
      const t1 = startAngle + (endAngle - startAngle) * (i / segments);
      const t2 = startAngle + (endAngle - startAngle) * ((i + 1) / segments);
      const x1o = cx + rOuter * Math.cos(t1);
      const y1o = cy + rOuter * Math.sin(t1);
      const x2o = cx + rOuter * Math.cos(t2);
      const y2o = cy + rOuter * Math.sin(t2);
      const x1i = cx + rInner * Math.cos(t1);
      const y1i = cy + rInner * Math.sin(t1);
      const x2i = cx + rInner * Math.cos(t2);
      const y2i = cy + rInner * Math.sin(t2);
      mgr.doc.triangle(x1o, y1o, x2o, y2o, x2i, y2i, 'F');
      mgr.doc.triangle(x1o, y1o, x2i, y2i, x1i, y1i, 'F');
    }
  };
  if (dayPct > 0) drawArc(0, dayPct, DAY_COLOR);
  if (dayPct < 1) drawArc(dayPct, 1, NIGHT_COLOR);

  // Center text
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(11);
  mgr.doc.setTextColor(...C.brandGreen);
  const centerNum = totalKwh > 0
    ? Number(totalKwh).toLocaleString('en-PH', { maximumFractionDigits: 0 })
    : '\u2014';
  const centerW = mgr.doc.getTextWidth(centerNum);
  mgr.doc.text(centerNum, cx - centerW / 2, cy + 1);
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setFontSize(5);
  mgr.doc.setTextColor(...C.textMuted);
  const subText = 'KWH / MO';
  const subW = mgr.doc.getTextWidth(subText);
  mgr.doc.text(subText, cx - subW / 2, cy + 4);

  // Legend
  const legY = rightY + 38;
  const dayPctNum = (dayPct * 100).toFixed(0);
  const nightPctNum = ((1 - dayPct) * 100).toFixed(0);
  mgr.doc.setFontSize(7);
  mgr.doc.setFillColor(...DAY_COLOR);
  mgr.doc.rect(rightX + 3, legY, 1.8, 1.8, 'F');
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text('Day Time', rightX + 6, legY + 1.5);
  mgr.doc.text(`${Math.round(dayKwh).toLocaleString('en-PH')} kWh`, rightX + rightW - 11, legY + 1.5, { align: 'right' });
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(`(${dayPctNum}%)`, rightX + rightW - 3, legY + 1.5, { align: 'right' });
  mgr.doc.setFillColor(...NIGHT_COLOR);
  mgr.doc.rect(rightX + 3, legY + 4, 1.8, 1.8, 'F');
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text('Night Time', rightX + 6, legY + 5.5);
  mgr.doc.text(`${Math.round(nightKwh).toLocaleString('en-PH')} kWh`, rightX + rightW - 11, legY + 5.5, { align: 'right' });
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(`(${nightPctNum}%)`, rightX + rightW - 3, legY + 5.5, { align: 'right' });
  rightY += donutCardH + 3;

  // Stat tiles
  const tileW = (rightW - 3) / 2;
  const tileH = 14;
  const fromListed = recommended.deviceTotalKwh ?? 0;
  const baseload = Math.max(0, recommended.baseloadKwh ?? 0);
  [
    { label: 'FROM LISTED', value: Math.round(fromListed).toLocaleString('en-PH') },
    { label: 'BASELOAD',    value: Math.round(baseload).toLocaleString('en-PH') },
  ].forEach((t, i) => {
    const tx = rightX + i * (tileW + 3);
    mgr.doc.setFillColor(...C.cream);
    mgr.doc.roundedRect(tx, rightY, tileW, tileH, 1, 1, 'F');
    mgr.doc.setFont('helvetica', 'bold');
    mgr.doc.setFontSize(6);
    mgr.doc.setTextColor(...C.textMuted);
    mgr.doc.text(t.label, tx + 2, rightY + 3.5);
    mgr.doc.setFont('helvetica', 'bold');
    mgr.doc.setFontSize(11);
    mgr.doc.setTextColor(...C.brandGreen);
    mgr.doc.text(t.value, tx + 2, rightY + 9);
    mgr.doc.setFont('helvetica', 'normal');
    mgr.doc.setFontSize(5.5);
    mgr.doc.setTextColor(...C.textMuted);
    mgr.doc.text('kWh / month', tx + 2, rightY + 12);
  });

  mgr.y = Math.max(leftY, rightY + tileH) + 3;
}

// ─── Snapshot page ──────────────────────────────────────────────────────────

function drawSnapshotPage(mgr, pngDataUrl, opts = {}) {
  const { topMargin = MARGIN } = opts;
  if (!pngDataUrl) {
    mgr.y = topMargin;
    mgr.doc.setFont('helvetica', 'italic');
    mgr.doc.setFontSize(10);
    mgr.doc.setTextColor(...C.textMuted);
    mgr.doc.text('[Snapshot unavailable]', PAGE_W / 2, PAGE_H / 2, { align: 'center' });
    return;
  }
  const imgProps = mgr.doc.getImageProperties(pngDataUrl);
  const imgW = imgProps.width;
  const imgH = imgProps.height;
  const aspect = imgH / imgW;
  const availableW = CONTENT_W;
  const availableH = PAGE_H - topMargin - 22;
  let drawW = availableW;
  let drawH = drawW * aspect;
  if (drawH > availableH) {
    drawH = availableH;
    drawW = drawH / aspect;
  }
  const x = MARGIN + (CONTENT_W - drawW) / 2;
  const y = topMargin;
  mgr.doc.addImage(pngDataUrl, 'PNG', x, y, drawW, drawH);
  mgr.y = y + drawH + 2;
}

// ─── Schedule of Payments — vector autotable ─────────────────────────────────

function drawSchedulePage(mgr) {
  const { ctx } = mgr;
  const { state, model, contact, quoteRef } = ctx;
  const annex = model.annex || { rows: [] };

  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(10);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text('SOLVIVA ENERGY', MARGIN, MARGIN + 3);
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(`${contact?.name || ''} \u00B7 ${quoteRef}`, PAGE_W - MARGIN, MARGIN + 3, { align: 'right' });
  mgr.doc.setDrawColor(...C.divider);
  mgr.doc.setLineWidth(0.2);
  mgr.doc.line(MARGIN, MARGIN + 5, PAGE_W - MARGIN, MARGIN + 5);
  mgr.y = MARGIN + 9;

  drawSectionHeader(mgr, 'SCHEDULE OF PAYMENTS', 'Month-by-month breakdown');
  mgr.y += 1;

  // Top totals strip
  const grossPrice = model.pkg?.totalRto60 ?? 0;
  const netPrice = model.terms?.totalAmountDue ?? 0;
  const discount = Math.max(0, grossPrice - netPrice);  // savings vs sticker
  const discountPct = grossPrice > 0 ? discount / grossPrice : 0;
  const tenor = state.tenor ?? 60;

  // v3-60: the "TENOR (VIA CREDIT CARD PMT PLAN)" variant was removed along
  // with the credit-card balance option; the strip's TENOR label is static.
  const tenorLabel = 'TENOR';
  const tenorLabelFontSize = 6;

  const stripY = mgr.y;
  const stripH = 11;
  mgr.doc.setFillColor(...C.cream);
  mgr.doc.roundedRect(MARGIN, stripY, CONTENT_W, stripH, 1, 1, 'F');
  const tiles = [
    { label: 'GROSS PRICE', value: peso(grossPrice), labelFontSize: 6 },
    { label: `${pct(discountPct, 1)} DISCOUNT`, value: peso(discount), labelFontSize: 6 },
    { label: 'NET PRICE', value: peso(netPrice), labelFontSize: 6 },
    { label: tenorLabel, value: `${tenor} Months`, labelFontSize: tenorLabelFontSize },
  ];
  const tileW = CONTENT_W / 4;
  tiles.forEach((t, i) => {
    const tx = MARGIN + i * tileW + 3;
    mgr.doc.setFont('helvetica', 'bold');
    mgr.doc.setFontSize(t.labelFontSize);
    mgr.doc.setTextColor(...C.textMuted);
    mgr.doc.text(t.label, tx, stripY + 3.5);
    mgr.doc.setFont('helvetica', 'bold');
    mgr.doc.setFontSize(10);
    mgr.doc.setTextColor(...C.brandGreen);
    mgr.doc.text(t.value, tx, stripY + 8.5);
  });
  mgr.y = stripY + stripH + 4;

  // Schedule rows table
  const rows = (annex.rows || [])
    .filter((r, idx) => idx === 0 || (r.minDue != null && r.minDue !== 0));

  const fmtDueDate = (d) => {
    if (!d) return '\u2014';
    if (typeof d === 'string') return d;
    if (d instanceof Date) {
      return d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    }
    return String(d);
  };

  const body = rows.map((r, idx) => [
    idx === 0 ? 'DP' : String(r.payment),
    fmtDueDate(r.dueDate),
    r.description || 'Monthly Payment',
    r.minDue != null ? peso(r.minDue) : '\u2014',
    r.earlyPayoff != null ? peso(r.earlyPayoff) : '\u2014',
    r.savings != null && r.savings > 0 ? peso(r.savings) : '\u2014',
  ]);

  // Re-stamp slim header on each new schedule page. didDrawPage fires once
  // per page autotable touches — including the first page where we already
  // drew our own header. Track the starting page so we only re-add the slim
  // header on continuation pages.
  const scheduleStartPage = mgr.pageNumber;
  const drawSlimHeader = () => {
    mgr.doc.setFont('helvetica', 'bold');
    mgr.doc.setFontSize(10);
    mgr.doc.setTextColor(...C.brandGreen);
    mgr.doc.text('SOLVIVA ENERGY', MARGIN, MARGIN + 3);
    mgr.doc.setFont('helvetica', 'normal');
    mgr.doc.setFontSize(7.5);
    mgr.doc.setTextColor(...C.textMuted);
    mgr.doc.text(`${contact?.name || ''} \u00B7 ${quoteRef}`, PAGE_W - MARGIN, MARGIN + 3, { align: 'right' });
    mgr.doc.setDrawColor(...C.divider);
    mgr.doc.setLineWidth(0.2);
    mgr.doc.line(MARGIN, MARGIN + 5, PAGE_W - MARGIN, MARGIN + 5);
  };

  autoTable(mgr.doc, {
    startY: mgr.y,
    head: [['#', 'Due date', 'Description', 'Min. due', 'Early payoff', 'Savings']],
    body,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN + 10, bottom: 22 },
    styles: {
      font: 'helvetica', fontSize: 8, cellPadding: 1.5,
      textColor: C.textBody, lineColor: C.divider, lineWidth: 0.15,
    },
    headStyles: {
      fillColor: C.cream, textColor: C.textMuted,
      fontStyle: 'bold', fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'left' },
      1: { cellWidth: 28, halign: 'left' },
      2: { cellWidth: 'auto', halign: 'left' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
    },
    didDrawPage: (data) => {
      const currentPage = data.pageNumber;
      // For continuation pages (not the first), add the slim header. The
      // first page already has the full section header drawn before autotable.
      if (currentPage > 1) {
        // Sync mgr.pageNumber to autotable's view of pages, then ensure
        // footer + header are drawn on this continuation page.
        const expectedMgrPage = scheduleStartPage + currentPage - 1;
        while (mgr.pageNumber < expectedMgrPage) {
          mgr.pageNumber++;
          drawFooter(mgr);
        }
        drawSlimHeader();
      }
    },
  });
  mgr.y = mgr.doc.lastAutoTable.finalY + 3;
  reconcilePageNumber(mgr);
}

// ─── Terms & Conditions ─────────────────────────────────────────────────────

function drawTermsAndConditions(mgr) {
  const { ctx } = mgr;
  const proposal = ctx.proposalContent || {};
  const blocks = proposal.termsAndConditions || [];
  const warranties = proposal.warranties || [];

  newPage(mgr);

  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(18);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text('Terms and Conditions', PAGE_W / 2, mgr.y + 6, { align: 'center' });
  mgr.y += 12;

  for (const block of blocks) {
    if (block.kind === 'heading') {
      pageBreakIfNeeded(mgr, 8);
      mgr.doc.setFont('helvetica', 'bold');
      mgr.doc.setFontSize(9.5);
      mgr.doc.setTextColor(...C.textBody);
      mgr.doc.text(block.text || '', MARGIN, mgr.y + 4);
      mgr.y += 6;
    } else if (block.kind === 'paragraph') {
      drawParagraph(mgr, block.text || '', { fontSize: 8.5 });
    } else if (block.kind === 'bullets') {
      drawBullets(mgr, block.items || [], { fontSize: 8.5, indent: 4 });
      mgr.y += 1;
    } else if (block.kind === 'warrantyTable') {
      drawWarrantyTable(mgr, warranties);
      mgr.y += 2;
    }
  }
}

function drawWarrantyTable(mgr, warranties) {
  pageBreakIfNeeded(mgr, 30);
  const bandY = mgr.y;
  const bandH = 7;
  mgr.doc.setFillColor(...C.brandGreen);
  mgr.doc.rect(MARGIN, bandY, CONTENT_W, bandH, 'F');
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(10);
  mgr.doc.setTextColor(...C.white);
  mgr.doc.text('Warranties and Coverage', PAGE_W / 2, bandY + 4.5, { align: 'center' });
  mgr.y = bandY + bandH;

  autoTable(mgr.doc, {
    startY: mgr.y,
    head: [],
    body: warranties.map(w => [w.component, w.term]),
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 22 },
    styles: {
      font: 'helvetica', fontSize: 9, cellPadding: 2,
      textColor: C.textBody, lineColor: C.divider, lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: CONTENT_W / 2, fontStyle: 'bold' },
      1: { cellWidth: CONTENT_W / 2, halign: 'left' },
    },
    didDrawPage: () => {},
  });
  mgr.y = mgr.doc.lastAutoTable.finalY + 1;
  reconcilePageNumber(mgr);
}

// ─── Acceptance & signatures page (v3-61) ───────────────────────────────────
// Rep-mode-only (the PDF itself is rep-only). Two party signature blocks
// (Customer + Solviva agent) where each signs above their pre-printed name,
// followed by a DCG approval block whose officer writes their own name by hand.

function drawSignatureField(mgr, x, y, w, label, printedName, role) {
  const h = 42;
  mgr.doc.setFillColor(...C.surfaceCard);
  mgr.doc.setDrawColor(...C.divider);
  mgr.doc.setLineWidth(0.2);
  mgr.doc.roundedRect(x, y, w, h, 1, 1, 'FD');
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(label, x + 4, y + 5);
  mgr.doc.setFont('helvetica', 'italic');
  mgr.doc.setFontSize(6.5);
  mgr.doc.setTextColor(...C.textTertiary);
  mgr.doc.text('sign above the line', x + 4, y + 24);
  mgr.doc.setDrawColor(...C.textBody);
  mgr.doc.setLineWidth(0.3);
  mgr.doc.line(x + 4, y + 27, x + w - 4, y + 27);
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(10);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text(printedName || '', x + 4, y + 32);
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(role, x + 4, y + 36);
  mgr.doc.text('Date: ______________________', x + 4, y + 39.5);
}

function drawAcceptancePage(mgr) {
  const { contact, agent, validUntil } = mgr.ctx;
  newPage(mgr);
  drawSectionHeader(mgr, 'PROPOSAL', 'Acceptance & Signatures');

  drawParagraph(mgr,
    `By signing below, the Customer and Solviva Energy, Inc. acknowledge and accept the terms of this proposal${validUntil ? `, valid until ${fmtDate(validUntil)}` : ''}. This acceptance is subject to review and approval by the Documents and Collections Group (DCG) before any installation may proceed.`,
    { fontSize: 9, color: C.textMuted });
  mgr.y += 3;

  const blockW = (CONTENT_W - 6) / 2;
  const topY = mgr.y;
  drawSignatureField(mgr, MARGIN, topY, blockW, 'CUSTOMER', contact?.name || '', 'Customer');
  drawSignatureField(mgr, MARGIN + blockW + 6, topY, blockW, 'SOLVIVA SALES AGENT', agent?.name || '', 'Solviva Energy, Inc.');
  mgr.y = topY + 42 + 10;

  // DCG approval — the officer's name is written by hand on the printout, so
  // it is NOT pre-filled (and not part of the pre-PDF requirement gate).
  drawSectionHeader(mgr, 'INTERNAL', 'DCG Approval');
  const stmtLines = mgr.doc.splitTextToSize(
    'All applications must be reviewed and approved by the Documents and Collections Group (DCG) before any installation may be allowed to proceed.',
    CONTENT_W - 8);
  const stmtH = stmtLines.length * 4 + 6;
  mgr.doc.setFillColor(...C.cream);
  mgr.doc.roundedRect(MARGIN, mgr.y, CONTENT_W, stmtH, 1, 1, 'F');
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setFontSize(8.5);
  mgr.doc.setTextColor(74, 72, 66);
  stmtLines.forEach((ln, i) => mgr.doc.text(ln, MARGIN + 4, mgr.y + 5.5 + i * 4));
  mgr.y += stmtH + 5;

  const dcgY = mgr.y;
  const dcgH = 42;
  mgr.doc.setFillColor(...C.surfaceCard);
  mgr.doc.setDrawColor(...C.divider);
  mgr.doc.setLineWidth(0.2);
  mgr.doc.roundedRect(MARGIN, dcgY, CONTENT_W, dcgH, 1, 1, 'FD');
  mgr.doc.setFont('helvetica', 'bold');
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text('REVIEWED & APPROVED BY \u2014 DCG OFFICER', MARGIN + 4, dcgY + 5);
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setFontSize(8.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text('Name (print):', MARGIN + 4, dcgY + 14);
  mgr.doc.setDrawColor(...C.textBody);
  mgr.doc.setLineWidth(0.3);
  mgr.doc.line(MARGIN + 28, dcgY + 14, MARGIN + 115, dcgY + 14);
  mgr.doc.setFont('helvetica', 'italic');
  mgr.doc.setFontSize(6.5);
  mgr.doc.setTextColor(...C.textTertiary);
  mgr.doc.text('sign above the line', MARGIN + 4, dcgY + 30);
  mgr.doc.setDrawColor(...C.textBody);
  mgr.doc.line(MARGIN + 4, dcgY + 33, MARGIN + 115, dcgY + 33);
  mgr.doc.setFont('helvetica', 'normal');
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text('Signature, DCG Officer', MARGIN + 4, dcgY + 37.5);
  mgr.doc.setFontSize(8.5);
  mgr.doc.text('Date:', MARGIN + 128, dcgY + 32);
  mgr.doc.line(MARGIN + 140, dcgY + 33, MARGIN + CONTENT_W - 4, dcgY + 33);
  mgr.y = dcgY + dcgH;
}

// ─── PUBLIC API ─────────────────────────────────────────────────────────────

export async function generateProposalPdf({
  state, model, contact, agent, generatedDate, validUntil,
  brand, adminParams, disclaimers, proposalContent,
  snapshots,
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const ctx = {
    state, model, contact, agent, brand,
    generatedDate, validUntil,
    quoteRef: makeQuoteRef(generatedDate, contact),
    adminParams,
    proposalContent,
    disclaimers: disclaimers || adminParams,  // accept disclaimers explicitly OR fallback to adminParams
    deviceLibrary: model.deviceLibrary || [],
    snapshots: snapshots || {},
  };

  const mgr = makePageManager(doc, ctx);

  // Page 1: cover/overview
  drawCoverPage1(mgr);

  // Page 2: Step 1
  newPage(mgr);
  drawStep1Page(mgr);

  // Page 3: Visualizing your system snapshot
  newPage(mgr);
  drawSnapshotPage(mgr, snapshots?.visualizing);

  // Page 4: Quote Summary snapshot
  newPage(mgr);
  drawSnapshotPage(mgr, snapshots?.summary);

  // Page 5+: Schedule of Payments
  newPage(mgr);
  drawSchedulePage(mgr);

  // Page N: T&C + Warranties
  drawTermsAndConditions(mgr);

  // Final page: Acceptance, signatures & DCG approval (v3-61)
  drawAcceptancePage(mgr);

  // Re-stamp totals
  finalizeFooters(mgr);

  // Save
  const safeName = (contact?.name || 'customer').replace(/[^a-zA-Z0-9]+/g, '_');
  const fname = `Solviva-Proposal-${ctx.quoteRef}-${safeName}.pdf`;
  doc.save(fname);
}
