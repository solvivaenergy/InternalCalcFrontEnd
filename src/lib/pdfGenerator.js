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
//   4  Quote Summary          — PNG snapshot (Step 2 line items + Step 3 cascade)
//   5+ Schedule of Payments    — vector autotable, paginates as needed
//   N  Terms & Conditions + Warranties — vector text, on its own page(s)
//
// Charts and Summary are PNG snapshots (captured before generation by App.jsx
// via html2canvas) so the PDF renders pixel-identical to what the rep sees on
// screen — no SVG re-implementation, no glyph fallback issues. The Schedule
// stays as a vector autotable so the 60 monthly rows are selectable and
// searchable in PDF readers.
//
// Currency note: vector pages use the peso sign to match proposal copy.
// If a PDF viewer/font fallback cannot render U+20B1, snapshots still preserve
// exact UI symbols because they are pixel images.
// =============================================================================

import jspdfModule from "jspdf";
import autoTableModule from "jspdf-autotable";

const jsPDF = jspdfModule.jsPDF || jspdfModule.default || jspdfModule;
const autoTable =
  typeof autoTableModule === "function"
    ? autoTableModule
    : autoTableModule.default && typeof autoTableModule.default === "function"
      ? autoTableModule.default
      : (autoTableModule.default && autoTableModule.default.default) ||
        autoTableModule;

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const C = {
  brandGreen: [31, 82, 43],
  heroDark: [24, 62, 45],
  cream: [234, 241, 233],
  divider: [229, 225, 214],
  cardBorder: [218, 213, 201],
  textBody: [31, 41, 55],
  textMuted: [73, 73, 73],
  textTertiary: [156, 163, 175],
  brandOrange: [232, 119, 34],
  white: [255, 255, 255],
  surfaceCard: [250, 250, 247],
};

const NEG = "-";

// ─── Figma-exact geometry helpers ───────────────────────────────────────────
// The Figma proposal frames are 2480×3508px = A4 (210×297mm) at 300 DPI.
// These convert Figma pixel coordinates directly into mm (for positions) and
// pt (for font sizes) so vector pages can match the design 1:1.
const FX_K = 210 / 2480; // px → mm  (matches 297/3508 to 4 decimals)
const fxmm = (px) => px * FX_K;
const fxpt = (px) => (px * FX_K) / 0.352778; // px → pt for setFontSize

// ─── Currency / number formatters ───────────────────────────────────────────

function peso(v) {
  if (v == null || isNaN(v)) return "\u2014";
  return (
    "\u20B1" +
    Number(v).toLocaleString("en-PH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

function pct(v, decimals = 1) {
  if (v == null || isNaN(v)) return "\u2014";
  return (v * 100).toFixed(decimals) + "%";
}

function fmtDate(d) {
  if (!(d instanceof Date)) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function makeQuoteRef(generatedDate, contact) {
  const name = (contact?.name || "X").toLowerCase();
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  const dayOfYear = Math.floor(
    (generatedDate - new Date(generatedDate.getFullYear(), 0, 0)) / 86400000,
  );
  const suffix = String(Math.abs(h ^ dayOfYear) % 10000).padStart(4, "0");
  return `SV-${generatedDate.getFullYear()}-${suffix}`;
}

function formatTimeOfDay(h) {
  if (h == null || isNaN(h)) return "\u2014";
  const hour = Math.floor(h);
  const min = Math.round((h - hour) * 60);
  const period = hour >= 12 ? "PM" : "AM";
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  return `${displayHour}:${String(min).padStart(2, "0")} ${period}`;
}

async function fetchPublicImageDataUrl(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () =>
        resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function fetchPublicFontBase64(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Unable to load PDF font: ${path}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

async function registerPdfFonts(doc) {
  const fontFiles = [
    ["NotoSans-Regular.ttf", "/fonts/NotoSans-Regular.ttf", "normal"],
    ["NotoSans-Bold.ttf", "/fonts/NotoSans-Bold.ttf", "bold"],
  ];
  const fontData = await Promise.all(
    fontFiles.map(([, path]) => fetchPublicFontBase64(path)),
  );

  fontFiles.forEach(([fileName, , style], index) => {
    doc.addFileToVFS(fileName, fontData[index]);
    doc.addFont(fileName, "NotoSans", style);
  });

  // Keep Helvetica's established layout metrics, switching to Noto Sans only
  // for currency runs that need the U+20B1 glyph. This also covers autotables.
  const text = doc.text.bind(doc);
  doc.text = (value, ...args) => {
    const needsPesoFont = Array.isArray(value)
      ? value.some((line) => String(line).includes("\u20B1"))
      : String(value).includes("\u20B1");
    if (!needsPesoFont) return text(value, ...args);

    const currentFont = doc.internal.getFont();
    const pesoStyle = currentFont.fontStyle.includes("bold")
      ? "bold"
      : "normal";
    doc.setFont("NotoSans", pesoStyle);
    const result = text(value, ...args);
    doc.setFont(currentFont.fontName, currentFont.fontStyle);
    return result;
  };
}

async function cropBannerToRatio(dataUrl) {
  if (!dataUrl) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Lock the canvas to the exact 2306x436 Figma aspect ratio
      canvas.width = img.width;
      canvas.height = img.width * (436 / 2306);

      const ctx = canvas.getContext("2d");
      // Draw the image starting from the top. The canvas will naturally crop the excess height!
      ctx.drawImage(img, 0, 0, img.width, img.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl); // Fallback to raw data if it fails
    img.src = dataUrl;
  });
}

// ─── Page manager ───────────────────────────────────────────────────────────

function makePageManager(doc, ctx) {
  const mgr = {
    doc,
    ctx,
    y: MARGIN,
    pageNumber: 1,
    footerStamps: [],
  };
  drawPageBackground(mgr);
  drawFooter(mgr);
  return mgr;
}

function newPage(mgr, opts = {}) {
  mgr.doc.addPage();
  mgr.pageNumber++;
  mgr.y = MARGIN;
  drawPageBackground(mgr);
  drawFooter(mgr, opts);
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

function drawPageBackground(mgr) {
  const background = mgr.ctx.assets?.proposalBackground;
  if (background) {
    mgr.doc.addImage(background, "JPEG", 0, 0, PAGE_W, PAGE_H);
  }
}

function drawFooter(mgr, opts = {}) {
  const { doc, pageNumber } = mgr;
  const footerY = PAGE_H - 12;

  if (opts.figmaExact) {
    mgr.footerStamps.push({ pageNumber, y: footerY, figmaExact: true });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(73, 73, 73);
    doc.text("www.solvivaenergy.com", 7.2, 286.2);
    doc.text(String(pageNumber), 202.5, 286.2, { align: "right" });
    return;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.textTertiary);
  const leftText = "www.solvivaenergy.com";
  doc.text(leftText, MARGIN, footerY);
  mgr.footerStamps.push({ pageNumber, y: footerY });
  doc.text(`${pageNumber}`, PAGE_W - MARGIN, footerY, { align: "right" });
}

function drawTopHeaderFigma(mgr) {
  const topY = MARGIN - 2;
  const logoData = mgr.ctx.assets?.logo;
  if (logoData) {
    // Dynamically calculate width based on a fixed height of 10 to prevent stretching
    const props = mgr.doc.getImageProperties(logoData);
    const targetHeight = 10;
    const targetWidth = targetHeight * (props.width / props.height);

    mgr.doc.addImage(logoData, "PNG", MARGIN, topY, targetWidth, targetHeight);
  } else {
    mgr.doc.setFont("helvetica", "bold");
    mgr.doc.setFontSize(12);
    mgr.doc.setTextColor(...C.brandGreen);
    mgr.doc.text("SOLVIVA", MARGIN, topY + 7.5);
  }
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(6.8);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(
    `Reference ID ${mgr.ctx.quoteRef}`,
    PAGE_W - MARGIN,
    topY + 4.8,
    {
      align: "right",
    },
  );
  mgr.doc.text(
    `Quotation valid until ${fmtDate(mgr.ctx.validUntil)}`,
    PAGE_W - MARGIN,
    topY + 9,
    { align: "right" },
  );
  mgr.y = topY + 14;
}

function finalizeFooters(mgr) {
  const total = mgr.pageNumber;
  for (const stamp of mgr.footerStamps) {
    mgr.doc.setPage(stamp.pageNumber);
    if (stamp.figmaExact) {
      mgr.doc.setFont("helvetica", "normal");
      mgr.doc.setFontSize(7.5);
      mgr.doc.setTextColor(73, 73, 73);
      mgr.doc.text(String(stamp.pageNumber), 202.5, 286.2, {
        align: "right",
      });
      continue;
    }
    mgr.doc.setFont("helvetica", "normal");
    mgr.doc.setFontSize(7.5);
    mgr.doc.setTextColor(...C.textTertiary);
    mgr.doc.text(`${stamp.pageNumber}`, PAGE_W - MARGIN, stamp.y, {
      align: "right",
    });
  }
  mgr.doc.setPage(total);
}

// ─── Layout primitives ──────────────────────────────────────────────────────

function drawSectionHeader(mgr, eyebrow, title) {
  pageBreakIfNeeded(mgr, 14);
  const startY = mgr.y;
  mgr.doc.setDrawColor(...C.cardBorder);
  mgr.doc.setLineWidth(0.2);
  mgr.doc.line(MARGIN, startY - 1, PAGE_W - MARGIN, startY - 1);
  mgr.doc.setFillColor(...C.brandGreen);
  mgr.doc.rect(MARGIN, startY, 1.6, 9.5, "F");
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(8);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text(eyebrow, MARGIN + 4, startY + 3.5);
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(13);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text(title, MARGIN + 4, startY + 8.5);
  mgr.y = startY + 12;
}

function drawSubHeading(mgr, text) {
  pageBreakIfNeeded(mgr, 6);
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text(text.toUpperCase(), MARGIN, mgr.y + 3);
  mgr.y += 4.5;
}

function drawParagraph(mgr, text, opts = {}) {
  const {
    fontSize = 9,
    color = C.textBody,
    italic = false,
    bold = false,
  } = opts;
  mgr.doc.setFont("helvetica", italic ? "italic" : bold ? "bold" : "normal");
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
  const { fontSize = 9, indent = 4, bulletChar = "\u2022" } = opts;
  const lineHeight = fontSize * 0.42;
  const textIndent = indent + 3;
  const maxWidth = CONTENT_W - textIndent;

  for (const item of items) {
    let term = "",
      rest = "",
      italic = false;
    if (typeof item === "string") {
      rest = item;
    } else {
      term = item.term || "";
      rest = item.rest || "";
      italic = !!item.italic;
    }
    const isNumbered = /^\d+\.$/.test(term);

    const tokens = [];
    if (term) tokens.push({ text: term + " ", bold: true, italic });
    const words = rest.trim().match(/\S+\s*/g) || [];
    for (const w of words) tokens.push({ text: w, bold: false, italic });

    const lines = [];
    let curLine = [];
    let curWidth = 0;
    for (const tok of tokens) {
      mgr.doc.setFont(
        "helvetica",
        tok.bold
          ? tok.italic
            ? "bolditalic"
            : "bold"
          : tok.italic
            ? "italic"
            : "normal",
      );
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
      mgr.doc.setFont("helvetica", "normal");
      mgr.doc.setFontSize(fontSize);
      mgr.doc.setTextColor(...C.textBody);
      mgr.doc.text(bulletChar, MARGIN + indent, mgr.y + lineHeight * 0.7);
    }

    let curY = mgr.y + lineHeight * 0.7;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let curX = MARGIN + textIndent;
      for (const tok of line) {
        mgr.doc.setFont(
          "helvetica",
          tok.bold
            ? tok.italic
              ? "bolditalic"
              : "bold"
            : tok.italic
              ? "italic"
              : "normal",
        );
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

// ─── Page 1: Cover / Overview (Figma 1:3, pixel-exact) ──────────────────────
// Every coordinate below is a Figma pixel value (2480×3508 frame) piped through
// fxmm()/fxpt() so the vector output matches the design 1:1.
function drawCoverPage1(mgr) {
  const { ctx } = mgr;
  const { contact, agent, validUntil } = ctx;
  const d = mgr.doc;
  const { state, model } = ctx;

  // Palette (exact Figma hex)
  const BLUE = [0, 106, 198];
  const DGREEN = [31, 82, 43];
  const LIME = [210, 255, 30];
  const GRAY = [73, 73, 73];
  const NEUTRAL = [71, 84, 103];
  const TILEG = [234, 241, 233];
  const BLACK = [0, 0, 0];
  const WHITE = [255, 255, 255];

  // Absolutely-positioned text helper (Figma px in, baseline: top).
  const T = (txt, xpx, ypx, sizePx, opt = {}) => {
    const {
      c = BLACK,
      style = "normal",
      align = "left",
      baseline = "top",
    } = opt;
    d.setFont("helvetica", style);
    d.setFontSize(fxpt(sizePx));
    d.setTextColor(...c);
    d.text(txt, fxmm(xpx), fxmm(ypx), { baseline, align });
  };

  // ── Header: logo + reference / validity ──
  const logoData = ctx.assets?.logo;
  if (logoData) {
    const props = d.getImageProperties(logoData);
    const targetHeight = fxmm(136);
    const targetWidth = targetHeight * (props.width / props.height);

    d.addImage(logoData, "PNG", fxmm(88), fxmm(89), targetWidth, targetHeight);
  } else {
    T("SOLVIVA", 88, 100, 90, { c: DGREEN, style: "bold" });
  }
  T(`Reference ID ${ctx.quoteRef}`, 2389, 107, 32, { c: GRAY, align: "right" });
  T(`Quotation valid until ${fmtDate(validUntil)}`, 2389, 164, 32, {
    c: GRAY,
    align: "right",
  });

  // ── Hero banner (1:38) ──
  const heroX = 87,
    heroY = 329,
    heroW = 2306,
    heroH = 436;
  const bannerData = ctx.assets?.banner;
  if (bannerData) {
    d.addImage(
      bannerData,
      "PNG",
      fxmm(heroX),
      fxmm(heroY),
      fxmm(heroW),
      fxmm(heroH),
    );
  } else {
    d.setFillColor(29, 155, 186);
    d.rect(fxmm(heroX), fxmm(heroY), fxmm(heroW), fxmm(heroH), "F");
    d.setFillColor(15, 112, 139);
    d.rect(fxmm(heroX), fxmm(heroY), fxmm(heroW * 0.52), fxmm(heroH), "F");
  }
  T("Solar Power System Proposal", heroX + heroW / 2, heroY + heroH / 2, 80, {
    c: WHITE,
    align: "center",
    baseline: "middle",
  });

  // ── Info column helper (Presented-to / payment blocks) ──
  const drawInfoColumn = (title, rows, colXpx, topPx, opt) => {
    const {
      labelW = 387,
      textSize = 38,
      pitch = 110,
      colW = 986,
      wrapValues = false,
    } = opt || {};
    if (title) T(title, colXpx, topPx, 46, { style: "bold" });
    const contentTop = title ? topPx + 100 : topPx;
    const valueXpx = colXpx + labelW + 56;
    const valueW = colW - labelW - 56;
    rows.forEach((r, i) => {
      const y = contentTop + i * pitch;

      // UPDATED: Changed style to "normal" and color to GRAY to match Figma
      T(r[0], colXpx, y, textSize, { style: "normal", c: GRAY });

      if (wrapValues) {
        const valLines = d.splitTextToSize(String(r[1] ?? "-"), fxmm(valueW));
        valLines
          .slice(0, 2)
          .forEach((ln, li) =>
            T(ln, valueXpx, y + li * (textSize + 8), textSize),
          );
      } else {
        T(String(r[1] ?? "-"), valueXpx, y, textSize);
      }
      if (i < rows.length - 1) {
        const lineY = y + textSize + (pitch - textSize) / 2;
        d.setDrawColor(210, 210, 210);
        d.setLineWidth(0.3);
        d.line(fxmm(colXpx), fxmm(lineY), fxmm(colXpx + colW), fxmm(lineY));
      }
    });
  };

  // ── Presented to / Presented by (1:294) ──
  drawInfoColumn(
    "Presented to:",
    [
      ["Client/Company:", contact?.name || "-"],
      ["Contact number:", contact?.mobile || "-"],
      ["Email address:", contact?.email || "-"],
      ["Installation site:", contact?.installAddress || "-"],
    ],
    88,
    845,
    { wrapValues: true },
  );
  drawInfoColumn(
    "Presented by:",
    [
      ["Name:", agent?.name || "Solviva Customer Support"],
      ["Contact number:", agent?.phone || "0917-802-8948"],
      ["Email address:", agent?.email || "hello@solvivaenergy.com"],
    ],
    1246,
    845,
  );

  // ── Tile-row helper ──
  const drawTilesRow = (titleText, titleXpx, titleTopPx, tiles, opt) => {
    const { leftPx = 88, widthPx = 2304, bg = TILEG } = opt || {};
    T(titleText, titleXpx, titleTopPx, 64, { c: BLUE, style: "bold" });
    const gap = 80;
    const tileW = (widthPx - 3 * gap) / 4;
    const tileH = 407;
    const tilesY = titleTopPx + 122;
    tiles.forEach((lines, i) => {
      const tx = leftPx + i * (tileW + gap);
      d.setFillColor(...bg);
      d.roundedRect(
        fxmm(tx),
        fxmm(tilesY),
        fxmm(tileW),
        fxmm(tileH),
        fxmm(32),
        fxmm(32),
        "F",
      );
      const totalH =
        lines.reduce((a, l) => a + l.size, 0) + 8 * (lines.length - 1);
      let ly = tilesY + (tileH - totalH) / 2;
      const cx = tx + tileW / 2;
      lines.forEach((l) => {
        T(l.txt, cx, ly, l.size, {
          c: l.c,
          style: l.style || "normal",
          align: "center",
        });
        ly += l.size + 8;
      });
    });
  };

  // ── System package tiles (1:225) ──
  const recPanelCount = model.recommended?.recommendedPanelCount ?? 0;
  const panelCount = state.panelCount ?? recPanelCount;
  const panelWatts = model.recommended?.panelWatts ?? 630;
  const systemKwp = model.systemKwp ?? (panelCount * panelWatts) / 1000;
  const batteryKwh = model.batteryKwh ?? 0;
  const inverters = (model.effectiveInverters || []).filter(
    (inv) => inv && inv.ratedKw,
  );
  const inverterTotalKw = inverters.reduce((a, b) => a + Number(b.ratedKw), 0);
  const batteryUnitKwh =
    model.activeBatteryPackage?.batteryUnitKwh || state.batteryUnitKwh || 5;
  const batteryUnitCount =
    batteryKwh > 0 ? Math.ceil(batteryKwh / batteryUnitKwh) : 0;

  drawTilesRow(
    "System package",
    88,
    1502,
    [
      [
        { txt: `${Math.round(systemKwp)}kWp`, size: 100, c: DGREEN },
        { txt: "Peak system", size: 38, c: BLACK },
        { txt: "capacity", size: 38, c: BLACK },
      ],
      [
        { txt: `${panelCount}`, size: 100, c: DGREEN },
        { txt: "No. of panels", size: 38, c: BLACK },
        { txt: `${panelWatts}W panels`, size: 38, c: NEUTRAL },
      ],
      [
        { txt: `${inverterTotalKw}kW`, size: 100, c: DGREEN },
        { txt: "Inverter", size: 38, c: BLACK },
        { txt: "Hybrid", size: 38, c: NEUTRAL },
      ],
      [
        { txt: `${batteryKwh.toFixed(0)} kWh`, size: 100, c: DGREEN },
        { txt: "Battery/s", size: 38, c: BLACK },
        {
          txt:
            batteryUnitCount > 0
              ? `${batteryUnitCount} unit(s) of ${batteryUnitKwh}kWh`
              : "-",
          size: 38,
          c: NEUTRAL,
        },
      ],
    ],
    { leftPx: 88, widthPx: 2304, bg: TILEG },
  );

  // ── System package payment details (1:272) ──
  const terms = model.terms || {};
  const tenor = state.tenor ?? 60;
  // Payment title is blue like the other section headings.
  T("System package", 94, 2165, 64, { c: BLUE, style: "bold" });
  drawInfoColumn(
    "",
    [
      ["Total amount due:", peso(terms.totalAmountDue ?? 0)],
      ["Pre-installation down payment:", peso(terms.dpTotalCharge ?? 0)],
      ["Post-installation balance:", peso(terms.finalPostInstallBalance ?? 0)],
    ],
    94,
    2287,
    { labelW: 728, textSize: 40, pitch: 88 },
  );
  drawInfoColumn(
    "",
    [
      ["Rent-to-Own tenor:", `${tenor} months`],
      ["Monthly payment", `${peso(terms.customerMonthlyPmt ?? 0)}/mo`],
    ],
    1383,
    2287,
    { labelW: 699, textSize: 40, pitch: 88 },
  );

  // ── Savings and investment returns (1:273) ──
  const cf = model.cashFlows || {};
  const irrYears = state.irrYears ?? 25;
  const utilityRate = Number(state.utilityRate || 0);
  const paybackBig =
    cf.paybackMonths != null && isFinite(cf.paybackMonths)
      ? `${(cf.paybackMonths / 12).toFixed(1)} yrs`
      : "\u2014";
  const irrBig = cf.irr != null ? pct(cf.irr, 1) : "\u2014";
  const lcoeBig = cf.lcoe != null ? `\u20B1${cf.lcoe.toFixed(1)}` : "\u2014";
  const duSavings = cf.totalDuSavings ?? 0;
  const duBig =
    duSavings >= 1e6
      ? `\u20B1${(duSavings / 1e6).toFixed(1)}M`
      : peso(duSavings);

  drawTilesRow(
    "Savings and investment returns",
    94,
    2727,
    [
      [
        { txt: paybackBig, size: 100, c: LIME },
        { txt: "Payback period", size: 38, c: WHITE },
      ],
      [
        { txt: irrBig, size: 100, c: LIME },
        { txt: `IRR (${irrYears} years)`, size: 38, c: WHITE },
        { txt: "Annualized", size: 38, c: WHITE },
      ],
      [
        { txt: lcoeBig, size: 100, c: LIME },
        { txt: "LCOE", size: 38, c: WHITE },
        { txt: "vs. current rate of", size: 38, c: WHITE },
        { txt: `\u20B1${utilityRate.toFixed(2)}/kWh`, size: 38, c: WHITE },
      ],
      [
        { txt: duBig, size: 100, c: LIME },
        { txt: `${irrYears}-year savings`, size: 38, c: WHITE },
        { txt: "Cumulative", size: 38, c: WHITE },
      ],
    ],
    { leftPx: 94, widthPx: 2298, bg: DGREEN },
  );

  mgr.y = fxmm(3256);
}

function drawSystemRow(mgr, showHeading = true) {
  const { ctx } = mgr;
  const { state, model } = ctx;

  const recPanelCount = model.recommended?.recommendedPanelCount ?? 0;
  const panelCount = state.panelCount ?? recPanelCount;
  const panelWatts = model.recommended?.panelWatts ?? 630;
  const systemKwp = model.systemKwp ?? (panelCount * panelWatts) / 1000;
  const batteryKwh = model.batteryKwh ?? 0;

  const inverters = (model.effectiveInverters || []).filter(
    (inv) => inv && inv.ratedKw,
  );
  const inverterKws = inverters.map((inv) => Number(inv.ratedKw));
  const inverterTotalKw = inverterKws.reduce((a, b) => a + b, 0);

  const batteryUnitKwh =
    model.activeBatteryPackage?.batteryUnitKwh || state.batteryUnitKwh || 5;
  const batteryUnitCount =
    batteryKwh > 0 ? Math.ceil(batteryKwh / batteryUnitKwh) : 0;
  const batterySub =
    batteryUnitCount > 0
      ? `${batteryUnitCount} unit(s) of ${batteryUnitKwh} kWh`
      : "\u2014";

  if (showHeading) {
    mgr.doc.setFont("helvetica", "bold");
    mgr.doc.setFontSize(12);
    mgr.doc.setTextColor(27, 119, 188);
    mgr.doc.text("System package", MARGIN, mgr.y + 3);
    mgr.y += 7;
  }

  const tileW = (CONTENT_W - 9) / 4;
  const tileH = 28;
  const tiles = [
    {
      bigNum: `${Math.round(systemKwp)}kWp`,
      line1: "Peak system",
      line2: "capacity",
    },
    {
      bigNum: `${panelCount}`,
      line1: "No. of panels",
      line2: `${panelWatts}W panels`,
    },
    {
      bigNum: `${inverterTotalKw}kW`,
      line1: "Inverter",
      line2: "Hybrid",
    },
    {
      bigNum: `${batteryKwh.toFixed(0)} kWh`,
      line1: "Battery/s",
      line2: batterySub,
    },
  ];

  tiles.forEach((t, i) => {
    const tx = MARGIN + i * (tileW + 3);
    mgr.doc.setFillColor(234, 241, 233);
    mgr.doc.setDrawColor(222, 233, 225);
    mgr.doc.setLineWidth(0.2);
    mgr.doc.roundedRect(tx, mgr.y, tileW, tileH, 3, 3, "FD");

    mgr.doc.setFont("helvetica", "normal");
    mgr.doc.setFontSize(19);
    mgr.doc.setTextColor(...C.brandGreen);
    mgr.doc.text(t.bigNum, tx + tileW / 2, mgr.y + 12, { align: "center" });

    mgr.doc.setFont("helvetica", "bold");
    mgr.doc.setFontSize(8.5);
    mgr.doc.setTextColor(...C.textBody);
    mgr.doc.text(t.line1, tx + tileW / 2, mgr.y + 19, { align: "center" });

    // CHANGED: If it's the first tile, mimic the exact styling of line 1.
    // Otherwise, use the smaller, muted style for the subtext.
    const isFirstTile = i === 0;
    mgr.doc.setFont("helvetica", isFirstTile ? "bold" : "normal");
    mgr.doc.setFontSize(isFirstTile ? 8.5 : 7.2);
    mgr.doc.setTextColor(...(isFirstTile ? C.textBody : C.textMuted));

    mgr.doc.text(t.line2, tx + tileW / 2, mgr.y + 23.5, { align: "center" });
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

  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(12);
  mgr.doc.setTextColor(27, 119, 188);
  mgr.doc.text("System package", MARGIN, mgr.y + 3);
  mgr.y += 8;

  const splitX = MARGIN + CONTENT_W * 0.56;
  const rowH = 10;
  const rows = [
    {
      leftLabel: "Total amount due:",
      leftValue: peso(totalDue),
      rightLabel: "Rent-to-Own tenor:",
      rightValue: `${tenor} months`,
    },
    {
      leftLabel: "Pre-installation down payment:",
      leftValue: peso(dpAmount),
      rightLabel: "Monthly payment:",
      rightValue: `${peso(monthlyPmt)}/mo`,
    },
    {
      leftLabel: "Post-installation balance:",
      leftValue: peso(postBalance),
      rightLabel: "",
      rightValue: "",
    },
  ];

  rows.forEach((r, idx) => {
    const yBase = mgr.y + idx * rowH;
    mgr.doc.setFont("helvetica", "bold");
    mgr.doc.setFontSize(8.7);
    mgr.doc.setTextColor(...C.textBody);
    mgr.doc.text(r.leftLabel, MARGIN, yBase + 3);
    if (r.rightLabel) mgr.doc.text(r.rightLabel, splitX, yBase + 3);

    mgr.doc.setFont("helvetica", "normal");
    mgr.doc.setFontSize(9);
    mgr.doc.text(r.leftValue, MARGIN + 58, yBase + 3);
    if (r.rightValue) mgr.doc.text(r.rightValue, splitX + 36, yBase + 3);

    mgr.doc.setDrawColor(...C.divider);
    mgr.doc.setLineWidth(0.2);
    mgr.doc.line(MARGIN, yBase + 6.2, PAGE_W - MARGIN, yBase + 6.2);
  });
  mgr.y += rows.length * rowH;
}

function drawSavingsRow(mgr) {
  const { ctx } = mgr;
  const { state, model } = ctx;
  const cf = model.cashFlows || {};
  const irrYears = state.irrYears ?? 25;
  const utilityRate = Number(state.utilityRate || 0);

  const paybackBig =
    cf.paybackMonths != null && isFinite(cf.paybackMonths)
      ? `${(cf.paybackMonths / 12).toFixed(1)} yrs`
      : "\u2014";
  const irrBig = cf.irr != null ? pct(cf.irr, 1) : "\u2014";
  const lcoeBig = cf.lcoe != null ? `\u20B1${cf.lcoe.toFixed(1)}` : "\u2014";
  const duSavings = cf.totalDuSavings ?? 0;
  const duBig =
    duSavings >= 1e6
      ? `\u20B1${(duSavings / 1e6).toFixed(1)}M`
      : peso(duSavings);

  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(12);
  mgr.doc.setTextColor(27, 119, 188);
  mgr.doc.text("Savings and investment returns", MARGIN, mgr.y + 3);
  mgr.y += 7;

  const tileW = (CONTENT_W - 9) / 4;
  const tileH = 24;
  const tileY = mgr.y;

  const tiles = [
    { big: paybackBig, sub: ["Payback period"] },
    { big: irrBig, sub: [`IRR (${irrYears} years)`, "Annualized"] },
    {
      big: lcoeBig,
      sub: [
        "LCOE",
        "vs. current rate of",
        `\u20B1${utilityRate.toFixed(2)}/kWh`,
      ],
    },
    { big: duBig, sub: [`${irrYears}-year savings`, "Cumulative"] },
  ];

  tiles.forEach((t, i) => {
    const tx = MARGIN + i * (tileW + 3);
    const cx = tx + tileW / 2;
    mgr.doc.setFillColor(...C.brandGreen);
    mgr.doc.setDrawColor(...C.brandGreen);
    mgr.doc.setLineWidth(0.2);
    mgr.doc.roundedRect(tx, tileY, tileW, tileH, 2, 2, "FD");

    mgr.doc.setFont("helvetica", "bold");
    mgr.doc.setFontSize(15);
    mgr.doc.setTextColor(208, 245, 90);
    mgr.doc.text(t.big, cx, tileY + 9, { align: "center" });

    mgr.doc.setFont("helvetica", "normal");
    mgr.doc.setFontSize(6.3);
    mgr.doc.setTextColor(...C.white);
    t.sub.forEach((line, li) => {
      mgr.doc.text(line, cx, tileY + 13.5 + li * 3, { align: "center" });
    });
  });

  mgr.y = tileY + tileH;
}

// Colored definitions row beneath the savings tiles (Figma page 4).
function drawSavingsDefinitions(mgr) {
  const tileW = (CONTENT_W - 9) / 4;
  const defs = [
    {
      term: "Payback Period",
      rest: "is the number of years it takes for your solar savings to equal your initial investment. Shorter payback means faster returns. Most homes recover costs in 4 to 7 years.",
    },
    {
      term: "Internal Rate of Return (IRR)",
      rest: "shows the profitability of a solar investment compared to alternative investments, useful for benchmarking against instruments such as Time Deposits or equities.",
    },
    {
      term: "Levelized Cost of Energy (LCOE)",
      rest: "is your new cost per kWh. Lower than grid rates means long-term savings. LCOE is the average cost of generating one kilowatt-hour (kWh) of electricity over the lifetime of your Solar System.",
    },
    {
      term: "25-Year Electricity Savings",
      rest: "reflect cumulative savings against grid electricity costs, adjusted for annual yield reduction. All figures assume distribution utility tariff rates remain flat.",
    },
  ];
  const fontSize = 6;
  const lineH = 2.4;
  const startY = mgr.y + 4;
  let maxBottom = startY;

  defs.forEach((d, i) => {
    const tx = MARGIN + i * (tileW + 3);
    const tokens = [{ text: d.term + " ", bold: true }];
    (d.rest.match(/\S+\s*/g) || []).forEach((w) =>
      tokens.push({ text: w, bold: false }),
    );
    const maxW = tileW - 1;
    const lines = [];
    let cur = [];
    let curW = 0;
    for (const tok of tokens) {
      mgr.doc.setFont("helvetica", tok.bold ? "bold" : "normal");
      mgr.doc.setFontSize(fontSize);
      const w = mgr.doc.getTextWidth(tok.text);
      if (curW + w > maxW && cur.length) {
        lines.push(cur);
        cur = [tok];
        curW = w;
      } else {
        cur.push(tok);
        curW += w;
      }
    }
    if (cur.length) lines.push(cur);

    let y = startY;
    for (const line of lines) {
      let x = tx;
      for (const tok of line) {
        mgr.doc.setFont("helvetica", tok.bold ? "bold" : "normal");
        mgr.doc.setFontSize(fontSize);
        mgr.doc.setTextColor(...(tok.bold ? C.brandGreen : C.textMuted));
        mgr.doc.text(tok.text, x, y);
        x += mgr.doc.getTextWidth(tok.text);
      }
      y += lineH;
    }
    if (y > maxBottom) maxBottom = y;
  });

  mgr.y = maxBottom + 1;
}

// Dark gray section title bar with a small checkbox glyph (Figma page 4 tables).
function drawTableTitleBar(mgr, label) {
  const h = 7;
  mgr.doc.setFillColor(110, 110, 110);
  mgr.doc.rect(MARGIN, mgr.y, CONTENT_W, h, "F");
  mgr.doc.setDrawColor(255, 255, 255);
  mgr.doc.setLineWidth(0.3);
  mgr.doc.roundedRect(MARGIN + 3, mgr.y + 2, 3, 3, 0.4, 0.4, "S");
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(9);
  mgr.doc.setTextColor(255, 255, 255);
  mgr.doc.text(label, MARGIN + 8.5, mgr.y + 4.8);
  mgr.y += h;
}

function drawDisclaimerCallout(mgr) {
  const { ctx } = mgr;
  const disclaimers = ctx.disclaimers || ctx.adminParams || {};
  const disBefore = disclaimers.irrDisclaimerBefore || "";
  const disHigh = disclaimers.irrDisclaimerHighlight || "";
  const disAfter = disclaimers.irrDisclaimerAfter || "";

  const tokens = [
    // Note: irrDisclaimerBefore already begins with "DISCLAIMER:" — split the
    // first word to render it bold while the rest of the sentence stays normal.
    ...(disBefore.match(/\S+\s*/g) || []).map((w, i) => ({
      text: w,
      bold: i === 0,
    })),
    ...(disHigh.match(/\S+\s*/g) || []).map((w) => ({ text: w, bold: true })),
    ...(disAfter.match(/\S+\s*/g) || []).map((w) => ({ text: w, bold: false })),
  ];
  const fontSize = 7;
  const lineHeight = fontSize * 0.42;
  const padX = 4;
  const maxW = CONTENT_W - 2 * padX;
  const lines = [];
  let curLine = [];
  let curWidth = 0;
  for (const tok of tokens) {
    mgr.doc.setFont("helvetica", tok.bold ? "bold" : "normal");
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
  mgr.doc.rect(MARGIN, startY, CONTENT_W, blockH, "F");
  mgr.doc.setFillColor(...C.brandGreen);
  mgr.doc.rect(MARGIN, startY, 0.7, blockH, "F");
  let curY = startY + 2 + lineHeight * 0.7;
  for (const line of lines) {
    let curX = MARGIN + padX;
    for (const tok of line) {
      mgr.doc.setFont("helvetica", tok.bold ? "bold" : "normal");
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
  const { state, model } = ctx;
  const recommended = model.recommended || {};

  drawTopHeaderFigma(mgr);
  mgr.y += 2;

  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(14);
  mgr.doc.setTextColor(0, 106, 198);
  mgr.doc.text("Current energy consumption", MARGIN, mgr.y + 4);
  mgr.y += 9;

  // We define the column split widths here to use for BOTH top and bottom sections
  const leftW = CONTENT_W * 0.55;
  const rightX = MARGIN + leftW + 6;
  const rightW = CONTENT_W - leftW - 6;
  const splitStartY = mgr.y;

  // ─── LEFT: utility rate, monthly bill, appliances ───
  let leftY = splitStartY;
  const drawRateRow = (label, value) => {
    mgr.doc.setFont("helvetica", "normal");
    mgr.doc.setFontSize(9);
    mgr.doc.setTextColor(...C.textBody);
    mgr.doc.text(label, MARGIN, leftY + 3);
    mgr.doc.setFont("helvetica", "bold");
    mgr.doc.text(value, MARGIN + leftW, leftY + 3, { align: "right" });
    leftY += 6;
    mgr.doc.setDrawColor(...C.divider);
    mgr.doc.setLineWidth(0.2);
    mgr.doc.line(MARGIN, leftY, MARGIN + leftW, leftY);
    leftY += 3;
  };
  drawRateRow(
    "Current utility rate (per kwh):",
    `\u20B1${Number(state.utilityRate || 0).toFixed(2)}`,
  );
  drawRateRow("Current monthly electric bill:", peso(state.monthlyBill));

  leftY += 2;
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(9);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text("Major appliances/devices:", MARGIN, leftY + 3);
  leftY += 6;

  const hrsPerDay = (r) => {
    if (r.onTime == null || r.offTime == null) return "\u2014";
    let dur;
    if (r.onTime === r.offTime) dur = 24;
    else if (r.offTime > r.onTime) dur = (r.offTime - r.onTime) * 24;
    else dur = (r.offTime + 1 - r.onTime) * 24;
    return String(Math.round(dur));
  };
  const devRows = (state.deviceRows || [])
    .filter((r) => r && r.deviceName)
    .map((r) => [r.deviceName, String(r.count || 0), hrsPerDay(r)]);

  if (devRows.length > 0) {
    autoTable(mgr.doc, {
      startY: leftY,
      head: [["Appliance", "QTY", "hrs/day"]],
      body: devRows,
      tableWidth: leftW,
      margin: { left: MARGIN },
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: 1.8,
        textColor: C.textBody,
        lineWidth: 0,
      },
      headStyles: {
        fillColor: [130, 130, 130],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { fillColor: [248, 248, 248] },
      alternateRowStyles: { fillColor: [236, 236, 236] },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { halign: "center", cellWidth: 18 },
        2: { halign: "center", cellWidth: 20 },
      },
    });
    leftY = mgr.doc.lastAutoTable.finalY;
  } else {
    mgr.doc.setFont("helvetica", "italic");
    mgr.doc.setFontSize(8);
    mgr.doc.setTextColor(...C.textTertiary);
    mgr.doc.text("No devices listed", MARGIN, leftY + 3);
    leftY += 5;
  }

  // ─── RIGHT: Usage pattern card ───
  const dayKwh = recommended.dayTimeKwh ?? 0;
  const nightKwh = recommended.nightTimeKwh ?? 0;
  const totalKwh = recommended.estMonthlyKwh ?? dayKwh + nightKwh;
  const total = Math.max(0.0001, dayKwh + nightKwh);
  const dayPct = dayKwh / total;
  const isDaytime = dayPct >= 0.5;
  const DAY_COLOR = [255, 212, 58];
  const NIGHT_COLOR = [0, 106, 198];

  const cardX = rightX;
  const cardY = splitStartY;
  const cardW = rightW;
  const cardH = 92;
  const pad = 5;
  mgr.doc.setFillColor(...C.cream);
  mgr.doc.roundedRect(cardX, cardY, cardW, cardH, 2, 2, "F");

  let cardCy = cardY + 7;
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(9);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text("Usage pattern", cardX + pad, cardCy);
  cardCy += 8;

  // Icon (Dynamically swaps Sun or Moon)
  const iconX = cardX + pad + 4.5; // Increased from 2.5 to 4.5 to shift the center right
  const iconY = cardCy + 0.5;
  if (isDaytime) {
    // Sun
    mgr.doc.setFillColor(245, 166, 35);
    mgr.doc.circle(iconX, iconY, 2.2, "F");
    mgr.doc.setDrawColor(245, 166, 35);
    mgr.doc.setLineWidth(0.5);
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * 2 * Math.PI;
      mgr.doc.line(
        iconX + Math.cos(ang) * 3.2,
        iconY + Math.sin(ang) * 3.2,
        iconX + Math.cos(ang) * 4.2,
        iconY + Math.sin(ang) * 4.2,
      );
    }
  } else {
    // Crescent Moon
    mgr.doc.setFillColor(0, 106, 198); // Blue
    mgr.doc.circle(iconX, iconY, 2.6, "F");
    mgr.doc.setFillColor(...C.cream); // Cutout to make crescent shape
    mgr.doc.circle(iconX + 1.2, iconY - 0.8, 2.2, "F");
  }
  cardCy += 9;

  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(9);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text(
    isDaytime ? "Daytime user" : "Nighttime user",
    cardX + pad,
    cardCy,
  );
  cardCy += 4.5;
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textMuted);
  const usageDesc = isDaytime
    ? "You consume most electricity during daylight hours when solar produces maximum power."
    : "You consume most electricity during evening hours when solar production is lower.";
  const descLines = mgr.doc.splitTextToSize(usageDesc, cardW - 2 * pad);
  descLines.forEach((ln, i) => mgr.doc.text(ln, cardX + pad, cardCy + i * 3.4));
  cardCy += descLines.length * 3.4 + 5;

  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(8.5);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text("Estimated monthly consumption", cardX + pad, cardCy);
  cardCy += 7;

  // Donut
  const cx = cardX + pad + 13;
  const cyD = cardCy + 12;
  const rOuter = 12;
  const rInner = 8;
  const drawArc = (startFrac, endFrac, color) => {
    const segments = 64;
    const startAngle = -Math.PI / 2 + startFrac * 2 * Math.PI;
    const endAngle = -Math.PI / 2 + endFrac * 2 * Math.PI;
    mgr.doc.setFillColor(...color);
    for (let i = 0; i < segments; i++) {
      const t1 = startAngle + (endAngle - startAngle) * (i / segments);
      const t2 = startAngle + (endAngle - startAngle) * ((i + 1) / segments);
      const x1o = cx + rOuter * Math.cos(t1);
      const y1o = cyD + rOuter * Math.sin(t1);
      const x2o = cx + rOuter * Math.cos(t2);
      const y2o = cyD + rOuter * Math.sin(t2);
      const x1i = cx + rInner * Math.cos(t1);
      const y1i = cyD + rInner * Math.sin(t1);
      const x2i = cx + rInner * Math.cos(t2);
      const y2i = cyD + rInner * Math.sin(t2);
      mgr.doc.triangle(x1o, y1o, x2o, y2o, x2i, y2i, "F");
      mgr.doc.triangle(x1o, y1o, x2i, y2i, x1i, y1i, "F");
    }
  };
  if (dayPct > 0) drawArc(0, dayPct, DAY_COLOR);
  if (dayPct < 1) drawArc(dayPct, 1, NIGHT_COLOR);

  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(9);
  mgr.doc.setTextColor(...C.brandGreen);
  const centerNum =
    totalKwh > 0
      ? Number(totalKwh).toLocaleString("en-PH", { maximumFractionDigits: 0 })
      : "\u2014";
  mgr.doc.text(centerNum, cx, cyD, { align: "center" });
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text("kw/mo", cx, cyD + 3, { align: "center" });

  // Legend to the right of the donut
  const legX = cx + rOuter + 6;
  let legY = cyD - 5;
  const dayPctNum = Math.round(dayPct * 100);
  const nightPctNum = 100 - dayPctNum;
  mgr.doc.setFillColor(...DAY_COLOR);
  mgr.doc.rect(legX, legY - 2.4, 2.6, 2.6, "F");
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text("Day time", legX + 4, legY);
  mgr.doc.setFontSize(6.8);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(
    `${Math.round(dayKwh).toLocaleString("en-PH")} kWh (${dayPctNum}%)`,
    legX + 4,
    legY + 3.4,
  );
  legY += 9;
  mgr.doc.setFillColor(...NIGHT_COLOR);
  mgr.doc.rect(legX, legY - 2.4, 2.6, 2.6, "F");
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text("Night time", legX + 4, legY);
  mgr.doc.setFontSize(6.8);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(
    `${Math.round(nightKwh).toLocaleString("en-PH")} kWh (${nightPctNum}%)`,
    legX + 4,
    legY + 3.4,
  );

  const sectionBottomY = Math.max(leftY, cardY + cardH) + 5;
  mgr.y = sectionBottomY;

  // ─── Savings goal section ───
  const desiredPct = Math.round((state.desiredSavingsPct || 0.5) * 100);
  const currentBill = Number(state.monthlyBill || 0);
  const newBill = Math.max(
    0,
    currentBill * (1 - (state.desiredSavingsPct || 0.5)),
  );

  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(13);
  mgr.doc.setTextColor(0, 106, 198);
  mgr.doc.text("Savings goal", MARGIN, mgr.y + 5);

  const goalY = mgr.y + 8;

  const leftColW = leftW;
  const rightColX = rightX;
  const rightColW = rightW;

  // 1. Green Target Box
  mgr.doc.setFillColor(31, 82, 43);
  mgr.doc.roundedRect(MARGIN, goalY, leftColW, 16, 2, 2, "F");
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(24); // Increased from 22
  mgr.doc.setTextColor(210, 255, 30);
  mgr.doc.text(`${desiredPct}%`, MARGIN + 6, goalY + 11.5);
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(9.5); // Increased from 7.5
  mgr.doc.setTextColor(...C.white);
  mgr.doc.text("Projected savings", MARGIN + 36, goalY + 7.5);
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(8); // Increased from 7
  mgr.doc.text("from your monthly electric bill", MARGIN + 36, goalY + 12.5);

  // 2. White Savings Box
  mgr.doc.setFillColor(250, 250, 250);
  mgr.doc.setDrawColor(230, 230, 230);
  mgr.doc.setLineWidth(0.2);
  mgr.doc.roundedRect(MARGIN, goalY + 19, leftColW, 16, 2, 2, "FD");
  const monthlySavings = Math.max(0, currentBill - newBill);
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(22); // Increased from 20
  mgr.doc.setTextColor(31, 82, 43);
  mgr.doc.text(peso(monthlySavings), MARGIN + 6, goalY + 30.5);
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(9.5); // Increased from 7.5
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text("Monthly savings", MARGIN + 36, goalY + 26.5);
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(8); // Increased from 7
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text("estimated at current utility rate", MARGIN + 36, goalY + 31.5);

  // Disclaimer beneath the savings boxes
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7.5); // Adjusted to 7.5
  mgr.doc.setTextColor(...C.textMuted);
  const savingsDisc = mgr.doc.splitTextToSize(
    "*Savings estimates are based on your stated monthly bill and utility rate. Actual savings may vary based on usage patterns, weather, and utility rate changes.",
    leftColW,
  );
  savingsDisc.forEach(
    (ln, i) => mgr.doc.text(ln, MARGIN, goalY + 40 + i * 3.2), // Adjusted line spacing to 3.2
  );

  // 3. Simple bar visual (Aligned squarely to the right column)
  const barBaseY = goalY + 38;
  const axisTop = goalY + 4;
  const maxVal = Math.max(currentBill, newBill, 1);
  const h1 = (currentBill / maxVal) * 28;
  const h2 = (newBill / maxVal) * 28;

  // Clean faint grid lines
  mgr.doc.setDrawColor(240, 240, 240);
  mgr.doc.setLineWidth(0.2);
  for (let i = 0; i < 5; i++) {
    const gy = axisTop + i * 7;
    mgr.doc.line(rightColX, gy, rightColX + rightColW, gy);
  }

  // Bars
  const barW = 14;
  const b1X = rightColX + rightColW * 0.3 - barW / 2;
  const b2X = rightColX + rightColW * 0.7 - barW / 2;

  mgr.doc.setFillColor(245, 121, 28);
  mgr.doc.roundedRect(b1X, barBaseY - h1, barW, h1, 1, 1, "F");
  mgr.doc.setFillColor(128, 230, 0);
  mgr.doc.roundedRect(b2X, barBaseY - h2, barW, h2, 1, 1, "F");

  // Text Labels
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(8.5);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text(peso(currentBill), b1X + barW / 2, barBaseY - h1 - 2, {
    align: "center",
  });
  mgr.doc.text(peso(newBill), b2X + barW / 2, barBaseY - h2 - 2, {
    align: "center",
  });

  mgr.doc.setFontSize(7.5);
  mgr.doc.text("Current electric bill", b1X + barW / 2, barBaseY + 5, {
    align: "center",
  });
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(6.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text("Pre-solar", b1X + barW / 2, barBaseY + 9, { align: "center" });

  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text("New electric bill", b2X + barW / 2, barBaseY + 5, {
    align: "center",
  });
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(6.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text("With solar", b2X + barW / 2, barBaseY + 9, { align: "center" });

  // Recommended package repeat row at bottom
  mgr.y = goalY + 68; // Increased from 52 to add more padding
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(13);
  mgr.doc.setTextColor(0, 106, 198);
  mgr.doc.text("Recommended solar system package", MARGIN, mgr.y + 4);

  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(8);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(
    "To meet your savings goal, here's what we recommend",
    MARGIN,
    mgr.y + 9,
  );

  mgr.y += 15; // Also slightly increased this gap from 12 to 15 to give the text breathing room before the tiles start
  drawSystemRow(mgr, false);
}
function drawPackageDetailPage(mgr) {
  // Extract state alongside model and proposalContent
  const { model, proposalContent, state } = mgr.ctx;
  const items = model.pkg?.items || [];
  const terms = model.terms || {};

  drawTopHeaderFigma(mgr);
  mgr.y += 2;
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(14);
  mgr.doc.setTextColor(0, 106, 198);
  mgr.doc.text("System package in detail", MARGIN, mgr.y + 4);
  mgr.y += 8;

  // Filter out items with no description, "None", or a price of 0
  const body = items
    .filter(
      (i) =>
        i && i.description && i.description !== "None" && i.directPrice > 0,
    )
    .map((i) => [i.description, peso(i.directPrice || 0)]);

  // Only render the Discounts row if there is an actual discount amount
  const discountVal = Math.abs(
    terms.promoDiscountAmount || terms.discountAmount || 0,
  );
  if (discountVal > 0) {
    body.push(["Less: Discounts", peso(discountVal)]);
  }

  // Add DST if the tenor is NOT direct purchase (0) and DST is greater than 0
  if (state.tenor !== 0 && terms.dst > 0) {
    body.push(["DST (Documentary Stamp Tax)", peso(terms.dst)]);
  }

  // UPDATED: Use summaryTotalDue which is DST-inclusive
  body.push([
    "Total",
    peso(terms.summaryTotalDue ?? terms.totalAmountDue ?? 0),
  ]);

  autoTable(mgr.doc, {
    startY: mgr.y,
    head: [["Equipment, Materials, and Labor", "Amount"]],
    // ... rest of the table config
    body,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.5,
      lineColor: [210, 210, 210],
      lineWidth: 0.15,
      textColor: C.textBody,
    },
    headStyles: {
      fillColor: [236, 243, 236],
      textColor: C.textBody,
      fontStyle: "normal",
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index === 1) {
        data.cell.styles.halign = "center";
      }
    },
    columnStyles: {
      0: { cellWidth: CONTENT_W - 55 },
      1: { cellWidth: 55, halign: "right" },
    },
  });
  mgr.y = mgr.doc.lastAutoTable.finalY + 6;

  const leftX = MARGIN;
  const rightX = MARGIN + CONTENT_W * 0.52;
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(11);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text("Inclusions", leftX, mgr.y + 4);
  mgr.doc.text("Warranty coverage", rightX, mgr.y + 4);

  const inclusions = [
    "Free site assessment",
    "Complete installation by certified team",
    "System testing and energization",
    "Free delivery (within 30km of KM 0)",
    "Customer onboarding and training",
    "Monitoring app access",
    "Dedicated 24/7 technical support team",
  ];

  // Updated warranty data to match Figma
  const warranties = [
    { label: "Solar Panels Performance", duration: "30 years" },
    { label: "Solar Panels Product Warranty", duration: "12 years" },
    { label: "Inverter", duration: "5 years" },
    { label: "Battery", duration: "5 years" },
    { label: "Workmanship", duration: "1 year" },
  ];

  // Anchoring both lists to the exact same starting height
  let currentY = mgr.y + 14;
  let warrantyY = mgr.y + 14;

  const checkX = MARGIN;

  // 1. Draw Inclusions (Left Column)
  inclusions.forEach((item) => {
    mgr.doc.setDrawColor(...C.brandGreen);
    mgr.doc.setLineWidth(0.8);
    mgr.doc.line(checkX, currentY - 1, checkX + 1.5, currentY + 0.5);
    mgr.doc.line(checkX + 1.5, currentY + 0.5, checkX + 4.5, currentY - 3);

    mgr.doc.setFont("helvetica", "normal");
    mgr.doc.setFontSize(7.5);
    mgr.doc.setTextColor(...C.textBody);
    mgr.doc.text(item, checkX + 8, currentY);

    currentY += 7.5;
  });

  // 2. Draw Warranties (Right Column)
  warranties.forEach((w) => {
    mgr.doc.setFont("helvetica", "normal");
    mgr.doc.setFontSize(7.5);
    mgr.doc.setTextColor(...C.textBody);

    mgr.doc.text(w.label, rightX, warrantyY);
    mgr.doc.text(w.duration, PAGE_W - MARGIN, warrantyY, { align: "right" });

    warrantyY += 7.5;
  });

  // Push the yellow disclaimer box up a bit (reduced from + 8 to + 4)
  mgr.y = Math.max(currentY, warrantyY) + 4;

  const noteY = mgr.y;

  mgr.doc.setFillColor(255, 244, 217);
  mgr.doc.setDrawColor(248, 214, 137);
  mgr.doc.roundedRect(MARGIN, noteY, CONTENT_W, 29, 2, 2, "FD");

  // Mixed formatting for the compliance text: splitting into tokens to bold specific words
  const complianceTokens = [
    { text: "*Compliance: ", bold: false },
    { text: "A ", bold: true },
    { text: "Rapid ", bold: true },
    { text: "Shutdown ", bold: true },
    { text: "Device ", bold: true },
    { text: "(RSD) ", bold: true },
    ..."is required by the Philippine Electrical Code (PEC) 2017 (Section 6.90.2.6) for all solar installations. This ensures your system protects your home during emergencies while meeting regulatory standards and avoiding potential LGU compliance issues. RSD and CFEI are also required by the PEC when net metering conversion is availed."
      .split(" ")
      .map((w) => ({ text: w + " ", bold: false })),
  ];

  const fontSize = 7;
  const maxW = CONTENT_W - 4;
  const lines = [];
  let cur = [];
  let curW = 0;

  // Measure and wrap words
  for (const tok of complianceTokens) {
    mgr.doc.setFont("helvetica", tok.bold ? "bold" : "normal");
    mgr.doc.setFontSize(fontSize);
    const w = mgr.doc.getTextWidth(tok.text);
    if (curW + w > maxW && cur.length) {
      lines.push(cur);
      cur = [tok];
      curW = w;
    } else {
      cur.push(tok);
      curW += w;
    }
  }
  if (cur.length) lines.push(cur);

  // Draw the compliance text line by line
  let ty = noteY + 6;
  for (const line of lines) {
    let tx = MARGIN + 2;
    for (const tok of line) {
      mgr.doc.setFont("helvetica", tok.bold ? "bold" : "normal");
      mgr.doc.setFontSize(fontSize);
      mgr.doc.setTextColor(136, 106, 42);
      mgr.doc.text(tok.text, tx, ty);
      tx += mgr.doc.getTextWidth(tok.text);
    }
    ty += 3; // line height
  }

  // Second disclaimer (Standard text)
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(136, 106, 42);
  mgr.doc.text(
    "**Other Costs: Final system layout and price subject to site assessment. Roof orientation, shading, structural load, and available area may affect panel placement, output, and price.",
    MARGIN + 2,
    noteY + 22,
    { maxWidth: CONTENT_W - 4 },
  );
}
function drawPaymentOptionsPage(mgr) {
  const { model, state } = mgr.ctx;
  const cf = model.cashFlows || {};
  const terms = model.terms || {};
  const popular = model.popularTenors || [];

  // The DP is a constant amount across all RTO tenors
  const dpConstant = terms.dpTotalCharge || 0;

  drawTopHeaderFigma(mgr);
  mgr.y += 2;

  drawSavingsRow(mgr);
  drawSavingsDefinitions(mgr);
  mgr.y += 5;

  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(14);
  mgr.doc.setTextColor(0, 106, 198);
  mgr.doc.text("Your payment options", MARGIN, mgr.y + 4);
  mgr.y += 8;

  const lightHead = {
    fillColor: [224, 224, 224],
    textColor: [40, 40, 40],
    fontStyle: "bold",
    fontSize: 8,
  };

  drawTableTitleBar(mgr, "Direct purchase");
  autoTable(mgr.doc, {
    startY: mgr.y,
    head: [["Milestone", "%", "Amount"]],
    body: [
      [
        "Down payment (upon contract signing)",
        `${Math.round((state.downPaymentPct || 0) * 100)}%`,
        peso(terms.dpTotalCharge || 0),
      ],
      [
        "Upon installation",
        `${Math.max(0, 100 - Math.round((state.downPaymentPct || 0) * 100))}%`,
        peso((terms.netDirectPrice || 0) - (terms.dpTotalCharge || 0)),
      ],
      ["Total", "100%", peso(terms.netDirectPrice || 0)],
    ],
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 1.4,
      lineColor: [220, 220, 220],
      lineWidth: 0.15,
    },
    headStyles: lightHead,
    alternateRowStyles: { fillColor: [246, 246, 246] },
    columnStyles: {
      1: { halign: "center", cellWidth: 22 },
      2: { halign: "right", cellWidth: 45 },
    },
  });
  mgr.y = mgr.doc.lastAutoTable.finalY + 5;

  const tenors = [60, 48, 36, 24, 12];
  const rowsByTenor = Object.fromEntries(popular.map((p) => [p.tenor, p]));

  drawTableTitleBar(mgr, "Rent-to-Own");
  autoTable(mgr.doc, {
    startY: mgr.y,
    head: [["Milestone", ...tenors.map((t) => `${t} months`)]],
    body: [
      ["Down payment", ...tenors.map((t) => peso(dpConstant))],
      [
        "Monthly payment",
        ...tenors.map((t) => peso(rowsByTenor[t]?.monthlyPmt || 0)),
      ],
      [
        "DST (Documentary Stamp Tax)",
        ...tenors.map((t) => {
          const row = rowsByTenor[t];
          if (!row) return peso(0);

          // Derived DST: Total Due - DP - (Monthly * Tenor)
          const dstAmt = Math.round(
            row.totalDue - dpConstant - row.monthlyPmt * t,
          );
          return peso(Math.max(0, dstAmt));
        }),
      ],
      [
        "Total payments",
        ...tenors.map((t) => {
          const row = rowsByTenor[t];
          if (!row) return peso(0);

          // totalDue already represents DP + (Monthly * Tenor) + DST
          return peso(row.totalDue);
        }),
      ],
    ],
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.2,
      lineColor: [220, 220, 220],
      lineWidth: 0.15,
    },
    headStyles: lightHead,
    alternateRowStyles: { fillColor: [246, 246, 246] },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });
  mgr.y = mgr.doc.lastAutoTable.finalY + 5;

  drawTableTitleBar(mgr, "Selected Rent-to-Own Plan");
  autoTable(mgr.doc, {
    startY: mgr.y,
    head: [["Tenor", "Down payment", "DST", "Total", "Monthly charge"]],
    body: [
      [
        `${state.tenor || 60} months`,
        peso(terms.dpTotalCharge || 0),
        peso(terms.dst || 0),
        peso(terms.summaryTotalDue ?? terms.totalAmountDue ?? 0),
        peso(terms.customerMonthlyPmt || 0),
      ],
    ],
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 1.2,
      lineColor: [220, 220, 220],
      lineWidth: 0.15,
    },
    headStyles: lightHead,
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });
  mgr.y = mgr.doc.lastAutoTable.finalY + 3;

  mgr.doc.setFont("helvetica", "italic");
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(
    "0% installment also available via EastWest Bank, UnionBank, Bank of Commerce, and Metrobank. Terms depend on your card issuer.",
    MARGIN,
    mgr.y + 3,
  );
  mgr.y += 6;

  const noteText =
    "Note: Estimated savings assume consumption patterns remain the same after solar installation. Actual results may vary due to changes in electricity rates, system performance, weather, maintenance costs, and government policies. This estimate is for illustrative purposes only and does not constitute a guarantee of future financial performance.";
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7);
  const noteLines = mgr.doc.splitTextToSize(noteText, CONTENT_W - 4);
  const noteBoxH = noteLines.length * 2.9 + 4;
  const noteY = mgr.y;
  mgr.doc.setFillColor(255, 244, 217);
  mgr.doc.setDrawColor(248, 214, 137);
  mgr.doc.roundedRect(MARGIN, noteY, CONTENT_W, noteBoxH, 2, 2, "FD");
  mgr.doc.setTextColor(136, 106, 42);
  noteLines.forEach((ln, i) =>
    mgr.doc.text(ln, MARGIN + 2, noteY + 4 + i * 2.9),
  );
}
// ─── Snapshot page ──────────────────────────────────────────────────────────

// ─── Page 5: Understanding your system's potential — vector Figma layout ─────
// Rebuilds the "visualizing" page (previously a live PNG snapshot) as a
// pixel-faithful vector page matching Figma frame 1:1496. Everything is drawn
// from the same model.schedule data the live RadianceCurve / CoverageBars use,
// so the numbers always match the on-screen calculator.
function drawVisualizingPage(mgr) {
  const { doc, ctx } = mgr;
  const model = ctx.model || {};
  const schedule = model.schedule || {};
  const rows = Array.isArray(schedule.rows) ? schedule.rows : [];
  const totals = schedule.totals || {};
  const coverageBars = Array.isArray(schedule.coverageBars)
    ? schedule.coverageBars
    : [];

  // Figma palette for this page
  const BLUE = [0, 106, 198]; // #006ac6 section titles
  const HL_GREEN = [31, 82, 43]; // #1f522b highlight sentence
  const FOOT = [29, 41, 57]; // #1d2939
  const STRIP_BG = [234, 241, 233]; // #eaf1e9
  const STAT_NUM = [31, 82, 43]; // #1f522b
  const STAT_LBL = [71, 84, 103]; // #475467
  const TIP_GREEN = [80, 137, 10]; // #50890a
  // chart / legend swatch colors (Figma)
  const CL_BASE = [173, 210, 237]; // #add2ed
  const CL_BASE_TX = [55, 111, 144]; // #376f90
  const CL_DEV = [255, 179, 104]; // #ffb368
  const CL_DEV_TX = [255, 113, 1]; // #ff7101
  const CL_SOLAR = [80, 137, 10]; // #50890a
  const CL_EXCESS = [223, 255, 110]; // #dfff6e
  const CL_EXCESS_BD = [80, 137, 10]; // border
  const CL_EXCESS_TX = [140, 171, 15]; // #8cab0f

  drawTopHeaderFigma(mgr);

  // ── Title + subtitle ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BLUE);
  doc.text("Understanding your system\u2019s potential", MARGIN, mgr.y + 5);
  mgr.y += 8.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.textBody);
  const subLines = doc.splitTextToSize(
    "Based on your consumption and the package you\u2019ve configured above, here\u2019s how your home\u2019s energy story plays out across a typical day.",
    CONTENT_W,
  );
  subLines.forEach((ln, i) => doc.text(ln, MARGIN, mgr.y + 3.4 + i * 3.9));
  mgr.y += subLines.length * 3.9 + 3;

  // ── Radiance area chart + legend ──
  const chartX = MARGIN;
  const chartW = 116;
  const plotTop = mgr.y + 2;
  const plotH = 42;
  const plotBottom = plotTop + plotH;

  // per-index (0..24) stacked values; index 24 duplicates hour 0 to close loop
  const base = [];
  const tot = [];
  const topSolar = [];
  const cover = [];
  let peak = 0;
  for (let i = 0; i <= 24; i++) {
    const r = rows[i === 24 ? 0 : i] || {};
    const b = r.baseLoad || 0;
    const d = r.devicesLoad || 0;
    const tl = r.totalLoad != null ? r.totalLoad : b + d;
    const sol = r.solar || 0;
    const su = r.solarUsed || 0;
    base.push(b);
    tot.push(tl);
    topSolar.push(Math.max(tl, sol));
    cover.push(su);
    peak = Math.max(peak, tl, sol, su);
  }
  const niceMax = (raw) => {
    if (raw <= 0) return 1;
    const padded = raw * 1.1;
    let step = 1;
    if (padded < 1) step = 0.2;
    else if (padded < 5) step = 0.5;
    else if (padded < 20) step = 2;
    else if (padded < 50) step = 5;
    else step = 10;
    return Math.ceil(padded / step) * step;
  };
  const yMax = niceMax(peak);
  const xAt = (i) => chartX + (i / 24) * chartW;
  const yAt = (v) => plotBottom - (Math.max(0, v) / yMax) * plotH;

  const fillBand = (topVals, botVals, rgb, borderRgb) => {
    if (rows.length === 0) return;
    const pts = [];
    for (let i = 0; i <= 24; i++) pts.push([xAt(i), yAt(topVals[i])]);
    for (let i = 24; i >= 0; i--) pts.push([xAt(i), yAt(botVals[i])]);
    doc.setFillColor(...rgb);
    if (borderRgb) {
      doc.setDrawColor(...borderRgb);
      doc.setLineWidth(0.2);
    }
    const segs = [];
    for (let i = 1; i < pts.length; i++) {
      segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
    }
    doc.lines(segs, pts[0][0], pts[0][1], [1, 1], borderRgb ? "FD" : "F", true);
  };

  const zeros = new Array(25).fill(0);

  // faint horizontal gridlines (behind the fills)
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.2);
  ticks.forEach((t) => {
    const yy = yAt(yMax * t);
    doc.line(chartX, yy, chartX + chartW, yy);
  });

  // stacked areas: baseload → major devices → excess solar
  fillBand(base, zeros, CL_BASE);
  fillBand(tot, base, CL_DEV);
  fillBand(topSolar, tot, CL_EXCESS);

  // solar coverage line (tracks solar used directly each hour)
  if (rows.length > 0) {
    doc.setDrawColor(...CL_SOLAR);
    doc.setLineWidth(0.9);
    const csegs = [];
    for (let i = 1; i <= 24; i++) {
      csegs.push([xAt(i) - xAt(i - 1), yAt(cover[i]) - yAt(cover[i - 1])]);
    }
    doc.lines(csegs, xAt(0), yAt(cover[0]), [1, 1], "S", false);
  }

  // y-axis labels + "kW" caption
  const trimNum = (v) => String(Math.round(v * 100) / 100);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.textMuted);
  ticks.forEach((t) => {
    doc.text(trimNum(yMax * t), chartX - 1.5, yAt(yMax * t) + 1, {
      align: "right",
    });
  });
  doc.text("kW", chartX - 1.5, plotTop - 1.5, { align: "right" });

  // x-axis labels every 3 hours
  const xLabels = [
    "12MN",
    "3AM",
    "6AM",
    "9AM",
    "12NN",
    "3PM",
    "6PM",
    "9PM",
    "12MN",
  ];
  xLabels.forEach((lb, k) => {
    doc.text(lb, xAt(k * 3), plotBottom + 3.5, { align: "center" });
  });

  // legend column (right of chart)
  const legX = chartX + chartW + 6;
  const legW = PAGE_W - MARGIN - legX;
  let legY = plotTop;
  const legendItems = [
    {
      fill: CL_BASE,
      tc: CL_BASE_TX,
      title: "Baseload",
      desc: "Power you use all day and night",
    },
    {
      fill: CL_DEV,
      tc: CL_DEV_TX,
      title: "Major devices",
      desc: "Power spikes from your listed major devices",
    },
    {
      fill: CL_SOLAR,
      tc: CL_SOLAR,
      title: "Solar coverage",
      desc: "Usage powered directly by your solar panels.",
    },
    {
      fill: CL_EXCESS,
      tc: CL_EXCESS_TX,
      title: "Excess solar",
      desc: "Extra energy you can store in batteries (~90-98% efficiency)",
    },
  ];
  legendItems.forEach((it) => {
    const sw = 3.2;
    doc.setFillColor(...it.fill);
    if (it.border) {
      doc.setDrawColor(...it.border);
      doc.setLineWidth(0.3);
      doc.rect(legX, legY, sw, sw, "FD");
    } else {
      doc.rect(legX, legY, sw, sw, "F");
    }
    const tx = legX + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...it.tc);
    doc.text(it.title, tx, legY + 2.7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.textBody);
    const dl = doc.splitTextToSize(it.desc, legW - 5);
    dl.forEach((ln, i) => doc.text(ln, tx, legY + 6.2 + i * 3));
    legY += Math.max(6.2 + dl.length * 3, sw) + 2.6;
  });

  mgr.y = Math.max(plotBottom + 7, legY);

  // ── Green highlight sentence ──
  const pctProd = totals.solar > 0 ? totals.solarUsed / totals.solar : 0;
  const pctUse = totals.totalLoad > 0 ? totals.solarUsed / totals.totalLoad : 0;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...HL_GREEN);
  doc.text(
    `${Math.round(pctProd * 100)}% of solar energy capture covers ${Math.round(
      pctUse * 100,
    )}% of energy consumption*`,
    PAGE_W / 2,
    mgr.y + 4,
    { align: "center" },
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...FOOT);
  doc.text("*Before batteries", PAGE_W / 2, mgr.y + 9, {
    align: "center",
  });
  mgr.y += 13;

  // ── Stat strip (4 tiles) ──
  const stripH = 20;
  doc.setFillColor(...STRIP_BG);
  doc.roundedRect(MARGIN, mgr.y, CONTENT_W, stripH, 3, 3, "F");
  const kwh = (v) => `${Number(v || 0).toFixed(1)} kWh`;
  const statTiles = [
    { v: kwh(totals.totalLoad), l: "Daily total consumption" },
    { v: kwh(totals.solar), l: "Daily solar production" },
    { v: kwh(totals.solarUsed), l: "Solar used directly*" },
    { v: kwh(totals.excessSolar), l: "Daily excess solar*" },
  ];
  const statColW = CONTENT_W / 4;
  statTiles.forEach((t, i) => {
    const cx = MARGIN + statColW * i + statColW / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...STAT_NUM);
    doc.text(t.v, cx, mgr.y + 9, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...STAT_LBL);
    doc.text(t.l, cx, mgr.y + 14.5, { align: "center" });
  });
  mgr.y += stripH + 6;

  // ── "How much of your bill can solar cover" ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BLUE);
  doc.text("How much of your bill can solar cover", MARGIN, mgr.y + 5);
  mgr.y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.textBody);
  doc.text(
    "Each bar represents 100% of your monthly electricity bill.",
    MARGIN,
    mgr.y + 3.4,
  );
  mgr.y += 8;

  // ── Coverage bars (3) + legend ──
  const barsX = MARGIN + 28;
  const barsW = 118;
  const barLegendX = barsX + barsW + 8;
  const barH = 5;
  const barGap = 4;
  const barDefs = [
    {
      label: "No Solar",
      grid: coverageBars[0]?.grid ?? 1,
      solar: coverageBars[0]?.solar ?? 0,
      battery: coverageBars[0]?.battery ?? 0,
    },
    {
      label: "Solar Only",
      grid: coverageBars[1]?.grid ?? 0,
      solar: coverageBars[1]?.solar ?? 0,
      battery: coverageBars[1]?.battery ?? 0,
    },
    {
      label: "Solar w/Batteries",
      grid: coverageBars[2]?.grid ?? 0,
      solar: coverageBars[2]?.solar ?? 0,
      battery: coverageBars[2]?.battery ?? 0,
    },
  ];
  let by = mgr.y;
  barDefs.forEach((b) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...FOOT);
    doc.text(b.label, barsX - 2, by + barH / 2 + 1, { align: "right" });
    let sx = barsX;
    const seg = (frac, fill, border) => {
      const w = Math.max(0, frac) * barsW;
      if (w <= 0) return;
      doc.setFillColor(...fill);
      if (border) {
        doc.setDrawColor(...border);
        doc.setLineWidth(0.2);
        doc.rect(sx, by, w, barH, "FD");
      } else {
        doc.rect(sx, by, w, barH, "F");
      }
      sx += w;
    };
    seg(b.grid, CL_DEV, null);
    seg(b.solar, CL_EXCESS, null);
    seg(b.battery, CL_BASE, null);
    by += barH + barGap;
  });
  // axis 0-100%
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...FOOT);
  [0, 25, 50, 75, 100].forEach((p) => {
    doc.text(`${p}%`, barsX + (p / 100) * barsW, by + 2, { align: "center" });
  });
  // bar legend (Grid / Solar / Battery)
  const barLegend = [
    { fill: CL_DEV, tc: CL_DEV_TX, title: "Grid" },
    { fill: CL_EXCESS, tc: CL_EXCESS_TX, title: "Solar" },
    { fill: CL_BASE, tc: CL_BASE_TX, title: "Battery" },
  ];
  let bly = mgr.y + 1;
  barLegend.forEach((it) => {
    doc.setFillColor(...it.fill);
    if (it.border) {
      doc.setDrawColor(...it.border);
      doc.setLineWidth(0.3);
      doc.rect(barLegendX, bly, 3.2, 3.2, "FD");
    } else {
      doc.rect(barLegendX, bly, 3.2, 3.2, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...it.tc);
    doc.text(it.title, barLegendX + 5, bly + 2.7);
    bly += 8;
  });
  mgr.y = by + 6;

  // ── "How to maximize your solar savings" ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BLUE);
  doc.text("How to maximize your solar savings", MARGIN, mgr.y + 5);
  mgr.y += 9;

  // ── Tips (two columns, 3 each) ──
  const tips = [
    [
      "Understand Daytime vs. Nighttime Usage",
      "Your solar panels generate power during daylight hours. Use high-consumption appliances during the day to maximize direct solar usage and savings.",
    ],
    [
      "Optimize Your Appliance Scheduling",
      "Run high-power appliances like washing machines, irons, and ovens during daylight hours. This ensures you\u2019re using solar power instead of grid electricity.",
    ],
    [
      "Know How Solar Production Works",
      "Panels produce power based on sunlight, not demand. Unused energy is wasted without batteries or net metering. Schedule high-consumption activities during peak sun hours to maximize your savings.",
    ],
    [
      "Expect Seasonal Variations",
      "Expect higher production during summer months (March-May) and lower output during rainy season (June-October). Your annual production averages out over the year.",
    ],
    [
      "Keep Your Panels Clean",
      "Clean panels quarterly (monthly if near busy streets). Use water only, no chemicals. For hassle-free maintenance, book Solviva\u2019s annual PMS for professional inspection and cleaning.",
    ],
    [
      "Monitor Your System Regularly",
      "Use your mobile app to track load consumption, generation, and weather. Use insights to schedule high-power activities during peak hours.",
    ],
  ];
  const colGap = 10;
  const tipColW = (CONTENT_W - colGap) / 2;
  const leftX = MARGIN;
  const rightColX = MARGIN + tipColW + colGap;
  const drawTip = (x, y, title, body) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...TIP_GREEN);
    doc.text(title, x, y + 3);
    let ty = y + 6.6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.splitTextToSize(body, tipColW).forEach((ln) => {
      doc.text(ln, x, ty);
      ty += 3.3;
    });
    return ty + 2.6;
  };
  const tipStartY = mgr.y;
  let leftY = tipStartY;
  let rightY = tipStartY;
  for (let i = 0; i < 3; i++) {
    leftY = drawTip(leftX, leftY, tips[i][0], tips[i][1]);
  }
  for (let i = 3; i < 6; i++) {
    rightY = drawTip(rightColX, rightY, tips[i][0], tips[i][1]);
  }
  mgr.y = Math.max(leftY, rightY);
}

function drawSnapshotPage(mgr, pngDataUrl, opts = {}) {
  const { topMargin = MARGIN } = opts;
  if (!pngDataUrl) {
    mgr.y = topMargin;
    mgr.doc.setFont("helvetica", "italic");
    mgr.doc.setFontSize(10);
    mgr.doc.setTextColor(...C.textMuted);
    mgr.doc.text("[Snapshot unavailable]", PAGE_W / 2, PAGE_H / 2, {
      align: "center",
    });
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
  mgr.doc.addImage(pngDataUrl, "PNG", x, y, drawW, drawH);
  mgr.y = y + drawH + 2;
}

// ─── Schedule of Payments — vector autotable ─────────────────────────────────

function drawSchedulePage(mgr) {
  const { ctx } = mgr;
  const { model } = ctx;
  const annex = model.annex || { rows: [] };

  drawTopHeaderFigma(mgr);
  mgr.y += 2;

  // Match the image's blue header
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(14);
  mgr.doc.setTextColor(0, 106, 198);
  mgr.doc.text("Schedule of payments", MARGIN, mgr.y + 4);

  // Space before the table starts
  mgr.y += 10;

  // Schedule rows table
  const rows = (annex.rows || []).filter(
    (r, idx) => idx === 0 || (r.minDue != null && r.minDue !== 0),
  );

  const fmtDueDate = (d) => {
    if (!d) return "-";
    if (typeof d === "string") return d;
    if (d instanceof Date) {
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    return String(d);
  };

  const body = rows.map((r) => [
    r.payment === "DP" ? "DP" : r.payment === "—" ? "-" : String(r.payment),
    fmtDueDate(r.dueDate),
    r.description || "Monthly Payment",
    r.minDue != null ? peso(r.minDue) : "-",
    r.earlyPayoff != null ? peso(r.earlyPayoff) : "-",
    r.savings != null && r.savings > 0 ? peso(r.savings) : "-",
  ]);

  // ---------------------------------------------------------------------------
  // FIX: Intercept addPage to draw the background and headers BEFORE AutoTable
  // draws the rows. This prevents the background from covering the table.
  // ---------------------------------------------------------------------------
  const originalAddPage = mgr.doc.addPage.bind(mgr.doc);
  mgr.doc.addPage = function () {
    originalAddPage(...arguments);
    mgr.pageNumber++; // Keep our global page tracker perfectly in sync

    // Draw base layers first
    if (typeof drawPageBackground === "function") drawPageBackground(mgr);
    if (typeof drawFooter === "function") drawFooter(mgr);

    // Draw top header and title
    mgr.y = MARGIN;
    if (typeof drawTopHeaderFigma === "function") drawTopHeaderFigma(mgr);

    mgr.doc.setFont("helvetica", "bold");
    mgr.doc.setFontSize(14);
    mgr.doc.setTextColor(0, 106, 198);
    mgr.doc.text("Schedule of payments", MARGIN, mgr.y + 4);
  };

  autoTable(mgr.doc, {
    startY: mgr.y,
    head: [
      [
        "#",
        "Due date",
        "Description",
        "Min. Amount Due",
        "Early Payoff Amount",
        "Savings",
      ],
    ],
    body,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN + 22, bottom: 25 },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.6, // Keeps 60 months fitting perfectly on 2 pages
      textColor: C.textBody,
      lineColor: [210, 210, 210],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [31, 82, 43], // Dark Green matching the image
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "left" },
      1: { cellWidth: 28, halign: "left" },
      2: { cellWidth: "auto", halign: "left" },
      3: { cellWidth: 30, halign: "left" },
      4: { cellWidth: 32, halign: "left" },
      5: { cellWidth: 28, halign: "left" },
    },
    didParseCell: function (data) {
      // Style the DP row exactly like the image
      if (data.section === "body" && data.row.index === 0) {
        data.cell.styles.fillColor = [100, 100, 100];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      }
    },
    // We completely removed didDrawPage since our addPage override handles it securely.
  });

  // CRITICAL: Restore the normal addPage function immediately after the table finishes
  mgr.doc.addPage = originalAddPage;

  mgr.y = mgr.doc.lastAutoTable.finalY + 6;

  // Yellow disclaimer note at the end of the table
  const noteText =
    "Note: Early Payoff Amount is the present value of all remaining payments, discounted at 8% per annum. Savings from Early Payoff = total of remaining payments minus Early Payoff Amount.";
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7);
  const noteLines = mgr.doc.splitTextToSize(noteText, CONTENT_W - 4);
  const noteBoxH = noteLines.length * 3.5 + 4;

  pageBreakIfNeeded(mgr, noteBoxH);

  const noteY = mgr.y;
  mgr.doc.setFillColor(255, 244, 217);
  mgr.doc.setDrawColor(248, 214, 137);
  mgr.doc.roundedRect(MARGIN, noteY, CONTENT_W, noteBoxH, 2, 2, "FD");
  mgr.doc.setTextColor(136, 106, 42);
  noteLines.forEach((ln, i) =>
    mgr.doc.text(ln, MARGIN + 2, noteY + 4.5 + i * 3.5),
  );

  mgr.y += noteBoxH + 4;
  reconcilePageNumber(mgr);
}

// ─── Terms and Conditions ───────────────────────────────────────────────────

function drawTermsAndConditions(mgr) {
  const { ctx } = mgr;
  const validityDate = ctx.model.quoteValidUntil || "August 27, 2026";
  // Grab the client's name from the context, fallback to "Client Name" if missing
  const clientName = ctx.contact?.name || "Client Name";

  drawTopHeaderFigma(mgr);
  mgr.y += 2;

  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(14);
  mgr.doc.setTextColor(0, 106, 198);
  mgr.doc.text("Terms and conditions", MARGIN, mgr.y + 4);
  mgr.y += 12;

  const colW = (CONTENT_W - 8) / 2; // Two columns with an 8pt gutter
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 8;

  const leftCol = [
    {
      title: "Permitting Requirements Provided by the Client",
      text: [
        "• Electricity bill (should be under the name of the client)",
        "• Valid ID of the person in the electricity bill",
        "• Tax Declaration",
        "• OCT/TCT (Land/Property Title)",
        "• Official Receipt of latest Real Property Tax (Land & Building)",
        "• Building Permit",
        "• Certificate of Occupancy",
      ],
    },
    {
      title: "Some LGUs may also require:",
      text: [
        "• Electrical Plan / Load Schedule (signed and sealed by a Professional Electrical Engineer) (Can be provided by Solviva if client avails)",
        "• Electrical Design Analysis (Can be provided by Solviva if client avails)",
        "• Structural Roof Plan (Can be provided by Solviva if client avails)",
        "• Structural Analysis (Can be provided by Solviva if client avails)",
        "• Barangay Clearance for Solar Installation",
        "• Homeowners Association Clearance",
      ],
    },
    {
      title:
        "The following shall apply to the pricing and scope of the installation project:",
      text: "Any additional length beyond the initial 30 meters (m) of Direct Current (DC) cable and the initial 10 meters (m) of Alternating Current (AC) cable will be charged per meter at a specified rate.",
    },
    {
      title: "Logistics Add-On Cost",
      text: "Any excess distance beyond the first 30 kilometers (km) from Kilometer 0 (Rizal Park) will be charged per kilometer at a specified rate.",
    },
    {
      title: "Price validity",
      text: "The prices provided in this proposal are valid for a period of thirty (30) days from the date of issuance. After this period, the prices are subject to change without prior notice.",
    },
    {
      title: "Exclusions",
      text: "Any items or service not explicitly mentioned or detailed in this proposal such as but not limited to Service entrance remodeling, building permit, occupancy certificate, house plans, and any other fees not related to the Solar Photovoltaic System itself shall be considered excluded from the scope of work and will not be provided unless otherwise agreed upon through a variation order or a revision in the proposal.",
    },
    {
      title: "Site assessment",
      text: [
        "• Technical Assessment: We first conduct a thorough technical site assessment, including roof evaluation and sunlight analysis, to assess suitability for a rooftop solar system.",
        "• Suitability Refund: If you have paid a reservation fee and if our assessment shows that your property is not suitable, we will refund your reservation fee within thirty (30) days from such determination.",
      ],
    },
  ];

  const rightCol = [
    {
      title: "Installation",
      text: "You shall provide reasonable assistance to Solviva and its designated representatives in the latter's preparation of the system design, and shall provide documents and information relating to the Premises, such as, but not limited to blueprints and/or building plans, as may be requested by the Supplier. You shall be responsible for the correctness and accuracy of any data and information provided.",
    },
    {
      title: "Validity",
      text: [
        "• Quotation Validity: The special quotation we've provided is valid for thirty (30) days from the date it was issued. We are committed to being transparent about pricing and will inform you of any necessary adjustments as soon as possible.",
        "• Price Adjustments: Please be aware that prices may change due to factors beyond our control, like fluctuations in material costs. We will always keep you informed and discuss any necessary adjustments.",
        "• Inclusions: Labor costs are included in our quotation unless pre-existing wiring or systems are found that require additional work. We will assess the site during the visit and inform you of any potential extra costs.",
        "• Additional Costs: If additional costs arise, we will notify you right away and proceed only with your written consent. We believe in full transparency, so there will be no surprises.",
      ],
    },
    {
      title: "Payment obligation",
      text: "Your satisfaction is our priority, and we will manage the entire process diligently from start to finish.",
    },
    {
      title: "Definitive Agreement",
      text: "These Terms and Conditions shall be subject to the execution of a separate Solar Photovoltaic System Contract which shall be executed between you and the Company. Failure to execute the Solar Photovoltaic System within seven (7) days from the date of these Terms and Conditions (or such longer period as may be allowed by Solviva) shall entitle Solviva to terminate the terms and conditions without any liability to you and without any obligation to reimburse or return any payments already made. Should Solviva not be able to proceed with the completion of the installation, and consequent turnover of the Solar facility due to an action or decision of the client such as, but not limited to, the unsuitability of the structure on which the Solar facility will be installed then Solviva shall turn over any and installed portions of the facility, and the client shall be liable for the payments commensurate to the portions that have been turned over. Any additional materials required to install the solar facility shall be subject to another order form.\n\nWe appreciate your understanding that the net metering status does not impact the payment terms outlined in this proposal. Thank you for choosing Solviva. We look forward to helping you make the switch to clean, renewable energy.",
    },
  ];

  const renderCol = (blocks, startX, startY) => {
    let currentY = startY;
    blocks.forEach((b) => {
      mgr.doc.setFont("helvetica", "bold");
      mgr.doc.setFontSize(7.5);
      mgr.doc.setTextColor(...(C.textBody || [40, 40, 40]));

      const titleLines = mgr.doc.splitTextToSize(b.title, colW);
      mgr.doc.text(titleLines, startX, currentY);
      currentY += titleLines.length * 3 + 1.5;

      mgr.doc.setFont("helvetica", "normal");
      mgr.doc.setFontSize(7);

      const renderText = (textStr) => {
        const isBullet = textStr.startsWith("• ");
        const textToSplit = isBullet ? textStr.substring(2) : textStr;
        const indentX = isBullet ? startX + 3.5 : startX;

        const lines = mgr.doc.splitTextToSize(
          textToSplit,
          colW - (isBullet ? 3.5 : 0),
        );

        if (isBullet) {
          mgr.doc.text("•", startX, currentY);
        }
        mgr.doc.text(lines, indentX, currentY);
        currentY += lines.length * 3.1 + 1;
      };

      if (Array.isArray(b.text)) {
        b.text.forEach((item) => renderText(item));
      } else {
        // Handle paragraphs separated by line breaks
        const paragraphs = b.text.split("\n\n");
        paragraphs.forEach((p) => {
          renderText(p);
          currentY += 1.5; // Space between paragraphs
        });
      }
      currentY += 3; // Space between sections
    });
    return currentY;
  };

  // Render both columns and find the lowest Y coordinate
  const leftEndY = renderCol(leftCol, leftX, mgr.y);
  const rightEndY = renderCol(rightCol, rightX, mgr.y);

  mgr.y = Math.max(leftEndY, rightEndY) + 8;

  // Render bottom acceptance section
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(8.5);
  mgr.doc.setTextColor(0, 106, 198); // Solviva Blue
  mgr.doc.text("Proposal acceptance and signature", MARGIN, mgr.y);
  mgr.y += 4.5;

  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(...(C.textBody || [40, 40, 40]));

  const acceptText = `By signing below, the Customer and Solviva Energy acknowledge and accept the terms of this proposal, valid until ${validityDate}. Subject to internal review and approval before installation.`;
  const acceptLines = mgr.doc.splitTextToSize(acceptText, CONTENT_W);
  mgr.doc.text(acceptLines, MARGIN, mgr.y);

  mgr.y += acceptLines.length * 3.5 + 14;

  // Dynamically populated signature block
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(7.5);
  // mgr.doc.text("[Client Signature]", MARGIN, mgr.y);

  mgr.y += 4;
  mgr.doc.text(clientName, MARGIN, mgr.y);

  mgr.y += 4;
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.text("Date:", MARGIN, mgr.y);
}

function drawWarrantyTable(mgr, warranties) {
  pageBreakIfNeeded(mgr, 30);
  const bandY = mgr.y;
  const bandH = 7;
  mgr.doc.setFillColor(...C.brandGreen);
  mgr.doc.rect(MARGIN, bandY, CONTENT_W, bandH, "F");
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(10);
  mgr.doc.setTextColor(...C.white);
  mgr.doc.text("Warranties and Coverage", PAGE_W / 2, bandY + 4.5, {
    align: "center",
  });
  mgr.y = bandY + bandH;

  autoTable(mgr.doc, {
    startY: mgr.y,
    head: [],
    body: warranties.map((w) => [w.component, w.term]),
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 22 },
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2,
      textColor: C.textBody,
      lineColor: C.divider,
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: CONTENT_W / 2, fontStyle: "bold" },
      1: { cellWidth: CONTENT_W / 2, halign: "left" },
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
  mgr.doc.roundedRect(x, y, w, h, 1, 1, "FD");
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(label, x + 4, y + 5);
  mgr.doc.setFont("helvetica", "italic");
  mgr.doc.setFontSize(6.5);
  mgr.doc.setTextColor(...C.textTertiary);
  mgr.doc.text("sign above the line", x + 4, y + 24);
  mgr.doc.setDrawColor(...C.textBody);
  mgr.doc.setLineWidth(0.3);
  mgr.doc.line(x + 4, y + 27, x + w - 4, y + 27);
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(10);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text(printedName || "", x + 4, y + 32);
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(role, x + 4, y + 36);
  mgr.doc.text("Date: ______________________", x + 4, y + 39.5);
}

function drawAcceptancePage(mgr) {
  const { contact, agent, validUntil } = mgr.ctx;
  newPage(mgr);
  drawSectionHeader(mgr, "PROPOSAL", "Acceptance & Signatures");

  drawParagraph(
    mgr,
    `By signing below, the Customer and Solviva Energy, Inc. acknowledge and accept the terms of this proposal${validUntil ? `, valid until ${fmtDate(validUntil)}` : ""}. This acceptance is subject to review and approval by the Documents and Collections Group (DCG) before any installation may proceed.`,
    { fontSize: 9, color: C.textMuted },
  );
  mgr.y += 3;

  const blockW = (CONTENT_W - 6) / 2;
  const topY = mgr.y;
  drawSignatureField(
    mgr,
    MARGIN,
    topY,
    blockW,
    "CUSTOMER",
    contact?.name || "",
    "Customer",
  );
  drawSignatureField(
    mgr,
    MARGIN + blockW + 6,
    topY,
    blockW,
    "SOLVIVA SALES AGENT",
    agent?.name || "",
    "Solviva Energy, Inc.",
  );
  mgr.y = topY + 42 + 10;

  // DCG approval — the officer's name is written by hand on the printout, so
  // it is NOT pre-filled (and not part of the pre-PDF requirement gate).
  drawSectionHeader(mgr, "INTERNAL", "DCG Approval");
  const stmtLines = mgr.doc.splitTextToSize(
    "All applications must be reviewed and approved by the Documents and Collections Group (DCG) before any installation may be allowed to proceed.",
    CONTENT_W - 8,
  );
  const stmtH = stmtLines.length * 4 + 6;
  mgr.doc.setFillColor(...C.cream);
  mgr.doc.roundedRect(MARGIN, mgr.y, CONTENT_W, stmtH, 1, 1, "F");
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(8.5);
  mgr.doc.setTextColor(74, 72, 66);
  stmtLines.forEach((ln, i) =>
    mgr.doc.text(ln, MARGIN + 4, mgr.y + 5.5 + i * 4),
  );
  mgr.y += stmtH + 5;

  const dcgY = mgr.y;
  const dcgH = 42;
  mgr.doc.setFillColor(...C.surfaceCard);
  mgr.doc.setDrawColor(...C.divider);
  mgr.doc.setLineWidth(0.2);
  mgr.doc.roundedRect(MARGIN, dcgY, CONTENT_W, dcgH, 1, 1, "FD");
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(
    "REVIEWED & APPROVED BY \u2014 DCG OFFICER",
    MARGIN + 4,
    dcgY + 5,
  );
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(8.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text("Name (print):", MARGIN + 4, dcgY + 14);
  mgr.doc.setDrawColor(...C.textBody);
  mgr.doc.setLineWidth(0.3);
  mgr.doc.line(MARGIN + 28, dcgY + 14, MARGIN + 115, dcgY + 14);
  mgr.doc.setFont("helvetica", "italic");
  mgr.doc.setFontSize(6.5);
  mgr.doc.setTextColor(...C.textTertiary);
  mgr.doc.text("sign above the line", MARGIN + 4, dcgY + 30);
  mgr.doc.setDrawColor(...C.textBody);
  mgr.doc.line(MARGIN + 4, dcgY + 33, MARGIN + 115, dcgY + 33);
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text("Signature, DCG Officer", MARGIN + 4, dcgY + 37.5);
  mgr.doc.setFontSize(8.5);
  mgr.doc.text("Date:", MARGIN + 128, dcgY + 32);
  mgr.doc.line(MARGIN + 140, dcgY + 33, MARGIN + CONTENT_W - 4, dcgY + 33);
  mgr.y = dcgY + dcgH;
}

// ─── PUBLIC API ─────────────────────────────────────────────────────────────

export async function generateProposalPdf({
  state,
  model,
  contact,
  agent,
  generatedDate,
  validUntil,
  brand,
  adminParams,
  disclaimers,
  proposalContent,
  snapshots,
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  await registerPdfFonts(doc);

  const ctx = {
    state,
    model,
    contact,
    agent,
    brand,
    generatedDate,
    validUntil,
    quoteRef: makeQuoteRef(generatedDate, contact),
    adminParams,
    proposalContent,
    disclaimers: disclaimers || adminParams, // accept disclaimers explicitly OR fallback to adminParams
    deviceLibrary: model.deviceLibrary || [],
    snapshots: snapshots || {},
    assets: {},
  };

  const figmaBannerUrl =
    "https://www.figma.com/api/mcp/asset/aa062535-6394-4f84-a929-ab19fd9f9eb5";
  const [
    logoData,
    logoSunData,
    proposalBackgroundData,
    figmaBannerData,
    fallbackBannerData,
  ] = await Promise.all([
    fetchPublicImageDataUrl("/logo-full-v2.png"),
    fetchPublicImageDataUrl("/logo-sun-v2.png"),
    fetchPublicImageDataUrl("/proposal-background.jpg"),
    fetchPublicImageDataUrl(figmaBannerUrl),
    fetchPublicImageDataUrl("/twinsun-v3.png"),
  ]);
  ctx.assets.logo = logoData;
  ctx.assets.logoSun = logoSunData;
  ctx.assets.proposalBackground = proposalBackgroundData;

  // Crop the banner before it hits jsPDF
  const rawBannerData = figmaBannerData || fallbackBannerData;
  ctx.assets.banner = await cropBannerToRatio(rawBannerData);

  const mgr = makePageManager(doc, ctx);

  // Page 1: cover/overview
  drawCoverPage1(mgr);

  // Page 2: Step 1
  newPage(mgr);
  drawStep1Page(mgr);

  // Page 3: System package in detail
  newPage(mgr);
  drawPackageDetailPage(mgr);

  // Page 4: Savings & payment options
  newPage(mgr);
  drawPaymentOptionsPage(mgr);

  // Page 5: Understanding your system's potential (vector, matches Figma 1:1496)
  newPage(mgr);
  drawVisualizingPage(mgr);

  // Pages 6-7: Schedule of Payments (RTO terms)
  // We only draw the schedule table if they are financing (tenor > 0)
  if (state.tenor > 0) {
    newPage(mgr);
    drawSchedulePage(mgr);
  }

  // Page 8: Terms & conditions
  newPage(mgr, { figmaExact: true });
  drawTermsAndConditions(mgr);

  // Re-stamp totals
  finalizeFooters(mgr);

  // Save
  const safeName = (contact?.name || "customer").replace(/[^a-zA-Z0-9]+/g, "_");
  const fname = `Solviva-Proposal-${ctx.quoteRef}-${safeName}.pdf`;
  doc.save(fname);
}
