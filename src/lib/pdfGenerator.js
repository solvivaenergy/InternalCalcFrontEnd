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
import { LUZON_REGIONS, fmtKwp } from "../config.js";

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

// Builds the proposal's one-line installation site: the street address the rep
// typed, then city / province / region from the 2E location cascade, so the PDF
// carries a complete address instead of just "12 Sample St".
//
// The region is printed ONLY for NCR, and the two rules are the same rule: a
// Philippine address ends at the province, and NCR has no province (its entries
// carry province: null, because Metro Manila is not one), so the region name
// fills that slot instead. Everywhere else the province is already there, and
// appending "Region IV-A" after it just adds noise.
//   NCR      → "12 Sample St, Brgy. 5, Manila, NCR"
//   Rizal    → "12 Sample St, Brgy. 5, Taytay, Rizal"
//   Pampanga → "12 Sample St, Brgy. 5, Guagua, Pampanga"
//
// Checked against the region CODE rather than "does this entry lack a
// province", so that adding another province-less region later is an explicit
// decision by whoever adds it rather than a silent behaviour change here.
//
// A non-Luzon order (Cebu / Siargao / Other) has no cascade at all, so it keeps
// just the typed address — appending a region there would be fiction.
//
// No de-duplication is attempted on purpose. A rep who still types "Taytay,
// Rizal" into the street field will see it twice, which is untidy but harmless;
// suppressing a segment because the street appears to contain it would drop a
// real province from addresses like "12 Rizal Avenue" and make them WRONG.
// The address placeholder now asks only for unit/street/barangay to steer this.
function formatInstallSite(contact, state) {
  const parts = [];
  const street = (contact?.installAddress || "").trim();
  if (street) parts.push(street);
  if (state?.location === "luzon") {
    if (state.locationCity) parts.push(state.locationCity);
    if (state.locationProvince) parts.push(state.locationProvince); // absent for NCR
    if (state.locationRegion === "NCR") {
      const region = LUZON_REGIONS.find((r) => r.code === "NCR");
      // "NCR — Metro Manila" → "NCR".
      if (region) parts.push(region.label.split("—")[0].trim());
    }
  }
  return parts.length ? parts.join(", ") : "-";
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
  // Byte-by-byte (no spread/apply) — spreading large chunks into
  // String.fromCharCode blows the call stack once the engine's argument-list
  // limit is hit, which varies with current stack depth and browser.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function registerPdfFonts(doc) {
  // Embed Inter (18pt optical cut) to match the Figma proposal design. Inter
  // includes the ₱ (U+20B1) glyph, so no currency-only font fallback is needed.
  const fontFiles = [
    ["Inter-Regular.ttf", "/fonts/Inter-Regular.ttf", "normal"],
    ["Inter-Medium.ttf", "/fonts/Inter-Medium.ttf", "medium"],
    ["Inter-SemiBold.ttf", "/fonts/Inter-SemiBold.ttf", "semibold"],
    ["Inter-Bold.ttf", "/fonts/Inter-Bold.ttf", "bold"],
    ["Inter-Italic.ttf", "/fonts/Inter-Italic.ttf", "italic"],
    ["Inter-BoldItalic.ttf", "/fonts/Inter-BoldItalic.ttf", "bolditalic"],
  ];
  const fontData = await Promise.all(
    fontFiles.map(([, path]) => fetchPublicFontBase64(path)),
  );

  fontFiles.forEach(([fileName, , style], index) => {
    doc.addFileToVFS(fileName, fontData[index]);
    doc.addFont(fileName, "Inter", style);
  });

  // Remap every "helvetica" font request to the embedded Inter family so all
  // existing setFont("helvetica", …) call sites — plus autotable's internal
  // font selection and width measurement — render in Inter with no call-site
  // changes and consistent text metrics.
  const setFont = doc.setFont.bind(doc);
  doc.setFont = (fontName, ...rest) => {
    if (fontName === "helvetica") return setFont("Inter", ...rest);
    return setFont(fontName, ...rest);
  };

  doc.setFont("Inter", "normal");
}

async function cropBannerToRatio(dataUrl) {
  if (!dataUrl) return null;
  const OUT_W = 2306;
  const OUT_H = 436;
  const TARGET_RATIO = OUT_W / OUT_H;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext("2d");

      // Cover-fit: scale the source to fill the hero strip, center-cropping the
      // overflow so any aspect ratio frames cleanly (a pre-cut wide strip is a
      // no-op; a 3:2 photo keeps its middle band instead of being squashed).
      const srcRatio = img.width / img.height;
      let sx, sy, sw, sh;
      if (srcRatio > TARGET_RATIO) {
        sh = img.height;
        sw = sh * TARGET_RATIO;
        sx = (img.width - sw) / 2;
        sy = 0;
      } else {
        sw = img.width;
        sh = sw / TARGET_RATIO;
        sx = 0;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);

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
    // Opts of the page currently being drawn. pageBreakIfNeeded reuses them so
    // an overflow page keeps its parent page's chrome (header drawer + footer
    // style) instead of silently falling back to the defaults.
    pageOpts: {},
  };
  drawPageBackground(mgr);
  drawFooter(mgr);
  return mgr;
}

function newPage(mgr, opts = {}) {
  mgr.doc.addPage();
  mgr.pageNumber++;
  mgr.y = MARGIN;
  mgr.pageOpts = opts;
  drawPageBackground(mgr);
  drawFooter(mgr, opts);
  // NB: opts.header is deliberately NOT invoked here. Every page's own draw
  // function stamps its header as its first act, so calling it here too would
  // double-stamp the text. It exists only for pageBreakIfNeeded below.
}

function pageBreakIfNeeded(mgr, reservedHeight) {
  if (mgr.y + reservedHeight > PAGE_H - 22) {
    // Captured BEFORE newPage: the footer drawers set their own font/size too,
    // so sampling after the page exists would restore the footer's state, not
    // the caller's.
    const prevFont = mgr.doc.getFont();
    const prevSize = mgr.doc.getFontSize();
    const prevColor = mgr.doc.getTextColor();
    newPage(mgr, mgr.pageOpts);
    // Story 004 AC3 — "both dates appear on every page header". An overflow
    // page has no draw function of its own to stamp one, so without this it
    // carried no logo, no reference and no dates at all. Also carries the
    // parent page's footer style through via mgr.pageOpts, so an overflow off
    // the schedule keeps drawScheduleFooterFigma instead of the default.
    const drawHeader = mgr.pageOpts && mgr.pageOpts.header;
    if (typeof drawHeader === "function") drawHeader(mgr);
    // Restore the caller's graphics state. A page break is incidental to the
    // caller, and several callers MEASURE text (setFont + setFontSize +
    // splitTextToSize), then call this, then draw. Both the footer and header
    // drawers set their own font/size/colour, so without this the caller's next
    // doc.text renders in the wrong font at the wrong size — the schedule's
    // early-payoff note measured at 7pt but drew at 7.68pt and overflowed its
    // own box.
    mgr.doc.setFont(prevFont.fontName, prevFont.fontStyle);
    mgr.doc.setFontSize(prevSize);
    mgr.doc.setTextColor(prevColor);
  }
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

// Per-page signature line, bottom-left, kept subtle so it does not disturb the
// page design (backlog #4 AC4 — "every page carries a signature line").
function drawPageSignatureLine(doc) {
  // Caption baseline aligns with the page number (~286.2); line sits just above.
  const y = PAGE_H - 13.6;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, MARGIN + 58, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(120, 120, 120);
  doc.text("Client Signature", MARGIN, y + 2.6);
}

function drawFooter(mgr, opts = {}) {
  const { doc, pageNumber } = mgr;
  const footerY = PAGE_H - 12;

  if (opts.scheduleExact) {
    drawScheduleFooterFigma(mgr);
    return;
  }

  if (!opts.noSignatureLine) drawPageSignatureLine(doc);

  if (opts.figmaExact) {
    mgr.footerStamps.push({ pageNumber, y: footerY, figmaExact: true });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(73, 73, 73);
    doc.text(String(pageNumber), 202.5, 286.2, { align: "right" });
    return;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.textTertiary);
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
  // Three right-aligned meta lines per the Figma frame (story 004 AC1-AC3).
  // The third line is free vertically: at the 4.2mm pitch its ink bottom lands
  // at ~26.8mm against the tightest page title's ink top at ~28.4mm
  // (drawVisualizingPage), and the block is right-aligned at x=195 while every
  // page title ends well left of x=110 — so no collision is possible.
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(6.8);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text(
    `Reference No.: ${mgr.ctx.quoteRef}`,
    PAGE_W - MARGIN,
    topY + 4.8,
    {
      align: "right",
    },
  );
  mgr.doc.text(
    `Date Issued: ${fmtDate(mgr.ctx.generatedDate)}`,
    PAGE_W - MARGIN,
    topY + 9,
    { align: "right" },
  );
  mgr.doc.text(
    `Valid Until: ${fmtDate(mgr.ctx.validUntil)}`,
    PAGE_W - MARGIN,
    topY + 13.2,
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
  // Same three meta lines as drawTopHeaderFigma, in Figma-px coordinates.
  // 107 → 164 → 221 keeps the design's 57px pitch; the hero banner starts at
  // y=329px (27.9mm), so the third line clears it comfortably.
  T(`Reference No.: ${ctx.quoteRef}`, 2389, 107, 32, {
    c: GRAY,
    align: "right",
  });
  T(`Date Issued: ${fmtDate(ctx.generatedDate)}`, 2389, 164, 32, {
    c: GRAY,
    align: "right",
  });
  T(`Valid Until: ${fmtDate(validUntil)}`, 2389, 221, 32, {
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
    // Text-free hero background (Figma gradient + solar photo). The title is
    // drawn separately below so it stays live/vector text in the PDF.
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
    if (title) T(title, colXpx, topPx, 46, { style: "semibold" });
    const contentTop = title ? topPx + 100 : topPx;
    const valueXpx = colXpx + labelW + 56;
    const valueW = colW - labelW - 56;

    // Rows used to sit at a FIXED i * pitch with values hard-capped at
    // .slice(0, 2) lines, which produced two separate defects:
    //   • a two-line value overlapped the row separator. T() draws with
    //     baseline "top", so the second line spans y+46 .. y+84 while the
    //     separator is at y + textSize + (pitch - textSize)/2 = y+74. Every
    //     wrapped value crossed it — visible on any long email address.
    //   • anything past two lines was silently DISCARDED. A long free-typed
    //     installation address therefore swallowed the city / province /
    //     region appended after it: the text was built correctly and then
    //     thrown away by the cap.
    // Now: the value is shrunk until it fits maxLines, never truncated, and
    // rows advance by their MEASURED height so the separator always clears the
    // content. A single-line row is byte-identical to the old layout
    // (contentH 38 → rowHeight 110 → the original pitch), so the Figma grid is
    // unchanged for every quote that did not previously overflow.
    const maxLines = 2;
    const lead = 8; // gap between wrapped lines
    let y = contentTop;
    rows.forEach((r, i) => {
      // Figma: labels are Inter Medium, black; values Inter Regular, black.
      T(r[0], colXpx, y, textSize, { style: "medium", c: BLACK });

      let lines = [String(r[1] ?? "-")];
      let size = textSize;
      if (wrapValues) {
        lines = d.splitTextToSize(lines[0], fxmm(valueW));
        // Step the value down until it fits, rather than dropping content.
        // The floor keeps it legible; at 26px a 46mm column holds ~2x the text
        // of one line at 38px, which covers the longest address seen.
        while (lines.length > maxLines && size > 26) {
          size -= 2;
          d.setFontSize(fxpt(size));
          lines = d.splitTextToSize(String(r[1] ?? "-"), fxmm(valueW));
        }
      }
      lines.forEach((ln, li) =>
        T(ln, valueXpx, y + li * (size + lead), size),
      );

      const contentH = lines.length * (size + lead) - lead;
      const rowH = contentH + (pitch - textSize);
      if (i < rows.length - 1) {
        const lineY = y + contentH + (pitch - textSize) / 2;
        d.setDrawColor(210, 210, 210);
        d.setLineWidth(0.3);
        d.line(fxmm(colXpx), fxmm(lineY), fxmm(colXpx + colW), fxmm(lineY));
      }
      y += rowH;
    });
  };

  // ── Presented to / Presented by (1:294) ──
  drawInfoColumn(
    "Presented to:",
    [
      ["Client/Company:", contact?.name || "-"],
      ["Contact number:", contact?.mobile || "-"],
      ["Email address:", contact?.email || "-"],
      ["Installation site:", formatInstallSite(contact, state)],
    ],
    88,
    845,
    { wrapValues: true },
  );
  drawInfoColumn(
    "Presented by:",
    [
      ["Sales Representative", agent?.name || "Solviva Customer Support"],
      ["Contact number:", agent?.phone || "0917-802-8948"],
      ["Email address:", agent?.email || "hello@solvivaenergy.com"],
    ],
    1246,
    845,
  );

  // ── Tile-row helper ──
  const drawTilesRow = (titleText, titleXpx, titleTopPx, tiles, opt) => {
    const { leftPx = 88, widthPx = 2304, bg = TILEG } = opt || {};
    T(titleText, titleXpx, titleTopPx, 64, { c: BLUE, style: "semibold" });
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
          style: l.style || "medium",
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
  // v3-143 — storage-only orders (no solar array) show N/A on the solar
  // tiles, mirroring the inverter tile, so a battery-only quote never
  // implies a phantom 0kWp / 0-panel solar package.
  const hasSolar = panelCount > 0;

  drawTilesRow(
    "System package",
    88,
    1502,
    [
      [
        {
          txt: hasSolar ? `${fmtKwp(systemKwp)}kWp` : "N/A",
          size: 100,
          c: DGREEN,
        },
        { txt: "Peak system", size: 38, c: BLACK },
        { txt: hasSolar ? "capacity" : "Not included", size: 38, c: BLACK },
      ],
      [
        { txt: hasSolar ? `${panelCount}` : "N/A", size: 100, c: DGREEN },
        { txt: "No. of panels", size: 38, c: BLACK },
        {
          txt: hasSolar ? `${panelWatts}W panels` : "Not included",
          size: 38,
          c: NEUTRAL,
        },
      ],
      [
        {
          txt: inverters.length ? `${inverterTotalKw}kW` : "N/A",
          size: 100,
          c: DGREEN,
        },
        { txt: "Inverter", size: 38, c: BLACK },
        {
          txt: inverters.length ? "Hybrid" : "Not included",
          size: 38,
          c: NEUTRAL,
        },
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
  T("Quote at a glance", 94, 2165, 64, { c: BLUE, style: "semibold" });
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
      ["Monthly payment", `${peso(terms.customerMonthlyPmt ?? 0)}`],
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
  // v3-143 — storage-only orders (no solar array) show N/A on the solar tiles.
  const hasSolar = panelCount > 0;

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
      bigNum: hasSolar ? `${fmtKwp(systemKwp)}kWp` : "N/A",
      line1: "Peak system",
      line2: hasSolar ? "capacity" : "Not included",
    },
    {
      bigNum: hasSolar ? `${panelCount}` : "N/A",
      line1: "No. of panels",
      line2: hasSolar ? `${panelWatts}W panels` : "Not included",
    },
    {
      bigNum: inverters.length ? `${inverterTotalKw}kW` : "N/A",
      line1: "Inverter",
      line2: inverters.length ? "Hybrid" : "Not included",
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
  mgr.doc.text("Quote at a glance", MARGIN, mgr.y + 3);
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

  mgr.doc.setFont("helvetica", "semibold");
  mgr.doc.setFontSize(fxpt(64));
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
  const schedule = model.schedule || {};
  const hasBattery = (model.batteryKwh || 0) > 0;
  const hasNm = !!state.netMeteringEnabled;

  // Calculate actual savings based on battery and net metering state
  const actualMonthlySavings = hasNm
    ? schedule.monthlyPesoSavingsBattNm || 0
    : schedule.monthlyPesoSavingsBatt || 0;

  // Calculate actual coverage percentage matching the EnergyVisuals logic
  let coveragePct = 0;
  if (schedule.coverageBars && schedule.coverageBars.length > 1) {
    if (hasBattery && hasNm && schedule.coverageBars[3]) {
      coveragePct =
        schedule.coverageBars[3].solar +
        schedule.coverageBars[3].battery +
        schedule.coverageBars[3].netMetering;
    } else if (hasBattery && schedule.coverageBars[2]) {
      coveragePct =
        schedule.coverageBars[2].solar + schedule.coverageBars[2].battery;
    } else if (hasNm && schedule.coverageBars[3] && schedule.coverageBars[1]) {
      const nmOnly = Math.max(
        0,
        schedule.coverageBars[3].netMetering + schedule.coverageBars[3].battery,
      );
      coveragePct = schedule.coverageBars[1].solar + nmOnly;
    } else if (schedule.coverageBars[1]) {
      coveragePct = schedule.coverageBars[1].solar;
    }
  }

  const displayedPct = (coveragePct * 100).toFixed(1);
  const currentBill = Number(state.monthlyBill || 0);
  const newBill = Math.max(0, currentBill - actualMonthlySavings);

  mgr.doc.setFont("helvetica", "semibold");
  mgr.doc.setFontSize(fxpt(64));
  mgr.doc.setTextColor(0, 106, 198);
  mgr.doc.text("Savings goal", MARGIN, mgr.y + 5);

  const goalY = mgr.y + 8;

  const leftColW = leftW;
  const rightColX = rightX;
  const rightColW = rightW;

  // 1. Green Target Box
  mgr.doc.setFillColor(31, 82, 43);
  mgr.doc.roundedRect(MARGIN, goalY, leftColW, 22, 2, 2, "F");
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(24);
  mgr.doc.setTextColor(210, 255, 30);
  // Replaced desiredPct with displayedPct
  mgr.doc.text(`${displayedPct}%`, MARGIN + 6, goalY + 14.5);
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(9.5);
  mgr.doc.setTextColor(...C.white);
  mgr.doc.text("Projected savings", MARGIN + 36, goalY + 10.5);
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(8);
  mgr.doc.text("from your monthly electric bill", MARGIN + 36, goalY + 15.5);

  // 2. White Savings Box
  mgr.doc.setFillColor(250, 250, 250);
  mgr.doc.setDrawColor(230, 230, 230);
  mgr.doc.setLineWidth(0.2);
  mgr.doc.roundedRect(MARGIN, goalY + 25, leftColW, 22, 2, 2, "FD");

  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(22);
  mgr.doc.setTextColor(31, 82, 43);
  // Render the actual calculated savings
  const monthlySavingsStr = peso(actualMonthlySavings);
  mgr.doc.text(monthlySavingsStr, MARGIN + 6, goalY + 39.5);
  // Asterisk anchor linking the figure to the savings disclaimer (#4 AC1)
  const monthlySavingsW = mgr.doc.getTextWidth(monthlySavingsStr);
  mgr.doc.setFontSize(11);
  mgr.doc.text("*", MARGIN + 6 + monthlySavingsW + 0.6, goalY + 34);
  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(9.5);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text("Monthly savings", MARGIN + 36, goalY + 35.5);
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(8);
  mgr.doc.setTextColor(...C.textMuted);
  mgr.doc.text("estimated at current utility rate", MARGIN + 36, goalY + 40.5);

  // NOTE: the savings disclaimer now renders full-width at the page foot
  // (see drawSavingsDisclaimerFooter) so it can carry the full approved copy.

  // 3. Bar visual (mockup-matched: rounded bars with pill value labels).
  // Tallest bar top is aligned to the top of the savings-goal boxes (goalY).
  const maxVal = Math.max(currentBill, newBill, 1);
  const barMaxH = 30;
  const barMinH = 12;
  const barBaseY = goalY + barMaxH;
  // Compressed scale with a min-height floor so the shorter bar still reads
  // clearly (mockup renders the smaller bar taller than a strict ratio would).
  const scaleBar = (v) =>
    v <= 0 ? 0 : barMinH + (v / maxVal) * (barMaxH - barMinH);
  const h1 = scaleBar(currentBill);
  const h2 = scaleBar(newBill);

  const barW = 15;
  // Figma bar centers are 519.6px apart => 44.0mm; nudged slightly closer.
  const barGap = 38;
  const barColMid = rightColX + rightColW / 2;
  const b1X = barColMid - barGap / 2 - barW / 2;
  const b2X = barColMid + barGap / 2 - barW / 2;

  // Bars: top corners rounded, bottom edges square (overlay a plain rect over
  // the lower half to square off the rounded bottom corners).
  const barR = 2;
  const drawBar = (x, h, rgb) => {
    mgr.doc.setFillColor(...rgb);
    mgr.doc.roundedRect(x, barBaseY - h, barW, h, barR, barR, "F");
    mgr.doc.rect(x, barBaseY - h + barR, barW, h - barR, "F");
  };
  drawBar(b1X, h1, [255, 112, 0]);
  drawBar(b2X, h2, [140, 225, 20]);

  // Value pills floating above each bar
  const drawValuePill = (label, cx, pillTopY) => {
    mgr.doc.setFont("helvetica", "medium");
    mgr.doc.setFontSize(8);
    const pillH = 5.4;
    const pillW = mgr.doc.getTextWidth(label) + 4.4;
    mgr.doc.setFillColor(247, 247, 247);
    mgr.doc.setDrawColor(226, 226, 226);
    mgr.doc.setLineWidth(0.2);
    mgr.doc.roundedRect(
      cx - pillW / 2,
      pillTopY,
      pillW,
      pillH,
      pillH / 2,
      pillH / 2,
      "FD",
    );
    mgr.doc.setTextColor(0, 0, 0);
    mgr.doc.text(label, cx, pillTopY + pillH / 2 + 1.1, { align: "center" });
  };
  drawValuePill(peso(currentBill), b1X + barW / 2, barBaseY - h1 - 7.4);
  drawValuePill(peso(newBill), b2X + barW / 2, barBaseY - h2 - 7.4);

  // Text Labels (Figma: title black Medium, subtitle Neutral/600 gray Medium)
  mgr.doc.setFont("helvetica", "medium");
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(0, 0, 0);
  mgr.doc.text("Current electric bill", b1X + barW / 2, barBaseY + 5, {
    align: "center",
  });
  mgr.doc.setFont("helvetica", "medium");
  mgr.doc.setFontSize(6.5);
  mgr.doc.setTextColor(71, 84, 103);
  mgr.doc.text("Pre-solar", b1X + barW / 2, barBaseY + 9, { align: "center" });

  mgr.doc.setFont("helvetica", "medium");
  mgr.doc.setFontSize(7.5);
  mgr.doc.setTextColor(0, 0, 0);
  mgr.doc.text("New electric bill", b2X + barW / 2, barBaseY + 5, {
    align: "center",
  });
  mgr.doc.setFont("helvetica", "medium");
  mgr.doc.setFontSize(6.5);
  mgr.doc.setTextColor(71, 84, 103);
  mgr.doc.text("With solar", b2X + barW / 2, barBaseY + 9, { align: "center" });

  // Savings disclaimer in an emphasized amber box, placed between the savings
  // goal block and the recommended package (mockup-matched, #4 AC2).
  mgr.y = goalY + 52;
  drawSavingsDisclaimerBox(mgr);

  // Recommended package repeat row
  mgr.y += 4;
  mgr.doc.setFont("helvetica", "semibold");
  mgr.doc.setFontSize(fxpt(64));
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

  mgr.y += 15;
  drawSystemRow(mgr, false);
}

// Savings disclaimer in an emphasized amber box (approved Legal wording,
// backlog #4 AC2). Draws at mgr.y and advances it past the box.
function drawSavingsDisclaimerBox(mgr) {
  const text =
    "*The savings and investment returns are estimates only and are based on the monthly bill, current distribution utility rate, and major appliances/loads you provided, as listed in this proposal. Other external factors, including those which may be unique to your situation, have not been considered in calculating these estimates. Actual savings will vary depending on, among others, your actual usage patterns and load profile, weather and solar irradiance, system performance, and changes in distribution utility rates. These figures are illustrative projections only, may not be conclusively relied upon, and do not constitute a guarantee.";
  const pad = fxmm(23.896);
  const radius = fxmm(23.896);
  const lineH = fxmm(27.879 * 1.58); // Figma: 27.879px font x 1.58 line-height
  mgr.doc.setFont("helvetica", "medium");
  mgr.doc.setFontSize(fxpt(27.879));
  const lines = mgr.doc.splitTextToSize(text, CONTENT_W - pad * 2);
  const boxH = lines.length * lineH + pad * 2;
  const boxY = mgr.y;
  mgr.doc.setFillColor(255, 237, 192);
  mgr.doc.setDrawColor(248, 203, 83);
  mgr.doc.setLineWidth(fxmm(1.991));
  mgr.doc.roundedRect(MARGIN, boxY, CONTENT_W, boxH, radius, radius, "FD");
  mgr.doc.setTextColor(132, 99, 0);
  lines.forEach((ln, i) =>
    mgr.doc.text(ln, MARGIN + pad, boxY + pad + fxmm(27.879) * 0.8 + i * lineH),
  );
  mgr.y = boxY + boxH;
}
// ─── System-package table geometry (Figma "System package in detail") ───────
// NOTE: PKG_HEAD_FILL, PKG_SUB_COLOR and the 68/32 split are transcribed from a
// screenshot of the Figma frame, not read from Figma itself. Confirm them
// against the design file before release; they are isolated here so that is a
// one-place swap.
const PKG_HEAD_FILL = [232, 237, 232];
const PKG_SUB_COLOR = [93, 112, 133];
const PKG_LINE_COLOR = [210, 210, 210];

// Type scale for the itemised table, measured against the embedded Inter
// metrics rather than estimated. A worst-case quote (3 inverters, expansion
// cabling, declined RSD, 3 real 2F rows, financed so the DST row shows) builds
// 34 body rows at 142.6mm, finalY 179.6mm, on ONE page — which leaves room for
// both the prose block and the amber compliance box, ending at ~253mm of 297.
// Sub-lines must stay at 7pt: at 8pt the widest emitted sub-line wraps.
const PKG_SUB_FONT = 7;
const PKG_SUB_PAD = 0.7;
const PKG_TITLE_FONT = 8;
const PKG_TITLE_PAD = 1.6;
// 4mm, not 5: the widest real sub-line (expansion-mode cabling with a 5-digit
// kWp figure) measures 112.5mm at 7pt, and a 4mm indent leaves 114.4mm usable.
// At 5mm the headroom is only 0.9mm. `overflow: "linebreak"` means an
// over-long line wraps to a second row rather than overflowing, and the page
// has ~21mm of slack, so a wrap is survivable — this just makes it unlikely.
const PKG_SUB_INDENT = 4;
const PKG_RULE = 0.15;
const PKG_COL_AMOUNT = CONTENT_W * 0.32;
const PKG_COL_LABEL = CONTENT_W - PKG_COL_AMOUNT;

function drawPackageDetailPage(mgr) {
  const { model, state } = mgr.ctx;
  const items = model.pkg?.items || [];
  const terms = model.terms || {};

  // Calculate system sizes dynamically for the rolled-up package names
  const recPanelCount = model.recommended?.recommendedPanelCount ?? 0;
  // Prefer the RESOLVED count off the model. App.jsx forces panelCount to 0
  // when panels are out of stock (the v3-106 "availability never blocks the
  // flow" contract), and re-deriving `state.panelCount ?? recPanelCount` here
  // would ignore that — every solar price and systemKwp would be 0 while this
  // page still believed it had an array and printed the static sub-lines.
  const panelCount = model.panelCount ?? state.panelCount ?? recPanelCount;
  const panelWatts = model.recommended?.panelWatts ?? 630;
  const systemKwp = model.systemKwp ?? (panelCount * panelWatts) / 1000;
  const batteryKwh = model.batteryKwh ?? 0;

  drawTopHeaderFigma(mgr);
  mgr.y += 2;
  mgr.doc.setFont("helvetica", "semibold");
  mgr.doc.setFontSize(fxpt(64));
  mgr.doc.setTextColor(0, 106, 198);
  mgr.doc.text("System package in detail", MARGIN, mgr.y + 4);
  mgr.y += 8;

  // ── Grouping ──────────────────────────────────────────────────────────────
  // The engine stamps i.category ('solar' | 'battery' | 'misc') on every line
  // item (calculations.js:1962-1965) and those three ids ARE the frame's three
  // groups. This replaces the old description-substring classifier, which
  // misrouted money: d.includes("rsd") swallowed the rsdLabor line and nothing
  // re-printed it, so the Amount column did not foot to its own Total.
  //
  // `roof` is re-homed into Solar here rather than in the engine. The frame puts
  // Roof Type inside the Solar group, but editing LINE_ITEM_CATEGORY would also
  // move it on the Summary tab, and that map has no test gate.
  const groupOf = (i) => (i.key === "roof" ? "solar" : i.category || "misc");
  const byKey = (k) => items.find((i) => i && i.key === k);
  const printable = (i) =>
    !!(i && i.description && i.description !== "None" && i.directPrice !== 0);

  // Group amounts are summed over the UNFILTERED list so the column foots:
  //   sum(solar) + sum(battery) + sum(misc) === terms.totalDirect, and
  //   totalDirect + discountAmount === terms.netDirectPrice === the Total row.
  // Lines with no sub-line of their own in the frame (rsdLabor, invMob) still
  // land inside their group's amount. That is correct: the frame itemises what
  // is INCLUDED, not a per-item price breakdown (story 026 #3).
  const sumGroup = (id) =>
    items.reduce(
      (s, i) => (i && groupOf(i) === id ? s + (i.directPrice || 0) : s),
      0,
    );
  const solarTot = sumGroup("solar");
  const batteryTot = sumGroup("battery");
  const miscTot = sumGroup("misc");

  // ── RSD (backlog #4 & #18) ────────────────────────────────────────────────
  // RSD is a solar-array safety device, so on a battery-only order it is
  // irrelevant and the whole line (plus its compliance copy) is suppressed.
  const rsdRaw = byKey("rsd");
  const rsdDeclined = !!(
    rsdRaw &&
    (rsdRaw.declined || (rsdRaw.directPrice || 0) === 0)
  );
  const rsdAvailed = !!(
    rsdRaw &&
    !rsdDeclined &&
    (rsdRaw.directPrice || 0) > 0
  );
  const rsdRelevant = panelCount > 0 || rsdAvailed;

  // ── Group 1 · Solar sub-lines, in the frame's order ───────────────────────
  const solarSubs = [];
  const addSub = (item) => {
    if (printable(item)) solarSubs.push({ text: item.description });
  };
  addSub(byKey("panels"));
  addSub(byKey("mounting"));
  addSub(byKey("cabling"));
  addSub(byKey("labor"));
  // 0-3 inverter rows, not exactly one.
  ["inverter0", "inverter1", "inverter2"].forEach((k) => addSub(byKey(k)));
  if (panelCount > 0) {
    // Static inclusion lines. The breaker's "30AT to 125AT" range is NOT
    // derivable — the catalog ships nine discrete single-rating SKUs and there
    // is no ampacity/sizing logic anywhere in src/ — so per product decision it
    // stays generic boilerplate carrying no amount. "AC/DC Excess" is likewise a
    // category label covering dcExtra + acExtra, whose money is already inside
    // the Solar group amount.
    solarSubs.push({ text: "1 Unit/s AC Breaker, 30AT to 125AT, 2-pole" });
    solarSubs.push({ text: "AC/DC Excess" });
  }
  // Story 026 #1 — the SELECTED roof material must appear. The roof item is
  // always pushed by the engine but is P0 for the 'metal' default, so the
  // printable() filter would drop it on the majority of quotes. Take it off the
  // unfiltered list and render it label-only; its cost already reaches the total
  // via netDirectPrice (story 026 #5).
  // Gated on panelCount: the engine pushes the roof item unconditionally, so a
  // battery-only order would otherwise advertise roof preparation it has no
  // panels to mount.
  const roofItem = byKey("roof");
  if (panelCount > 0 && roofItem && roofItem.description) {
    solarSubs.push({ text: roofItem.description });
  }
  if (rsdRaw && rsdRelevant) {
    solarSubs.push(
      rsdDeclined
        ? {
            text: `${rsdRaw.description}* (excluded per client instruction)`,
            color: [136, 106, 42],
            italic: true,
          }
        : { text: `${rsdRaw.description}*` },
    );
  }
  // Standalone-RSD labor is priced separately and had no sub-line on any path,
  // so on a battery-only order with RSD availed its money sat inside the Solar
  // group amount with nothing on the page to point at.
  addSub(byKey("rsdLabor"));

  // ── Group 2 · Battery sub-lines, in the frame's order ─────────────────────
  // All five already exist verbatim on the item list. Each zeroes out when the
  // rep unchecks it in Step 2A, at which point printable() drops it.
  const batterySubs = [];
  ["battery", "rack", "ats", "critLoads", "batteryLabor"].forEach((k) => {
    const it = byKey(k);
    if (printable(it)) batterySubs.push({ text: it.description });
  });

  // A 2F catalog row carries its OWN category (Engineering sets it per item in
  // the admin editor, and calculations.js documents 'battery' as the intended
  // setting for a reversal row). sumGroup() therefore moves such a row's money
  // into Solar or Battery, but the fixed key lists above cannot name it — so
  // without this the group amount would shift with the row printed on no line
  // at all, and the footing check could not catch it because the column still
  // adds up. These rows must NOT also consume a Misc write-in slot.
  const categorized2F = (id) =>
    items
      .filter(
        (i) =>
          groupOf(i) === id && /^misc\d+$/.test(i.key || "") && printable(i),
      )
      .map((i) => ({ text: i.description }));
  solarSubs.push(...categorized2F("solar"));
  batterySubs.push(...categorized2F("battery"));

  // ── Group 3 · Misc ────────────────────────────────────────────────────────
  // Real 2F lines only. The Figma frame drew twelve "Line 1".."Line 12"
  // write-in slots, but padding to twelve was dropped in both directions:
  //   • no 2F lines at all → the whole group falls away (pushGroup drops a
  //     group with no rows and no amount), rather than printing twelve
  //     placeholders over a ₱0 total and reading as an unfinished document;
  //   • one or more 2F lines → just those lines, since eleven greyed-out
  //     placeholders trailing a single real item looked like a rendering fault.
  // So nothing is ever padded, and the group is exactly as long as its content.
  const miscSubs = items
    .filter((i) => groupOf(i) === "misc" && printable(i))
    .map((i) => ({ text: i.description }));

  // ── Table body ────────────────────────────────────────────────────────────
  const body = [];
  const pushGroup = (title, subs, amount) => {
    // Group presence is derived from the row predicate, not `amount > 0`. The
    // engine supports negative credit/reversal lines, so a group whose net is
    // zero or negative must still render rather than vanish while its money
    // stays inside the Total.
    if (!subs.length && !amount) return;
    // The title row carries BOTH cells; the amount cell spans the title plus
    // every sub-line. Covered rows supply only ONE cell — autotable reserves the
    // spanned column itself.
    body.push([
      {
        content: title,
        styles: {
          fontStyle: "bold",
          fontSize: PKG_TITLE_FONT,
          textColor: C.textBody,
          cellPadding: {
            top: PKG_TITLE_PAD,
            bottom: PKG_SUB_PAD,
            left: 2,
            right: 2,
          },
          lineWidth: { top: PKG_RULE, right: PKG_RULE },
        },
      },
      {
        // peso() puts the minus INSIDE the glyph ("₱-427,741"); the discount
        // row deliberately writes it before ("−₱17,170") to match the UI. A
        // reversal row can push a group negative, so format both the same way.
        content:
          amount < 0 ? `−${peso(Math.abs(amount))}` : peso(amount),
        rowSpan: subs.length + 1,
        styles: {
          halign: "right",
          // Top, not middle: centring it over a 10-row span floated the amount
          // away from the group title it belongs to, so the eye had to travel
          // to pair them. Aligned to the title row instead.
          valign: "top",
          fontStyle: "bold",
          fontSize: PKG_TITLE_FONT,
          textColor: C.textBody,
          // Match the group title's top padding, or the amount sits ~1mm above
          // it: the title row sets PKG_TITLE_PAD while this cell would
          // otherwise inherit the table's PKG_SUB_PAD.
          cellPadding: {
            top: PKG_TITLE_PAD,
            bottom: PKG_SUB_PAD,
            left: 2,
            right: 2,
          },
          lineWidth: { top: PKG_RULE },
        },
      },
    ]);
    subs.forEach((s) => {
      body.push([
        {
          content: s.text,
          styles: {
            fontSize: PKG_SUB_FONT,
            textColor: s.color || PKG_SUB_COLOR,
            fontStyle: s.italic ? "italic" : "normal",
            cellPadding: {
              top: 0.35,
              bottom: 0.35,
              left: 2 + PKG_SUB_INDENT,
              right: 2,
            },
            // Right rule only: the vertical divider runs continuously through
            // the group rows and stops before the summary rows below.
            lineWidth: { right: PKG_RULE },
          },
        },
      ]);
    });
  };

  const summaryRow = (label, amount, opts = {}) => {
    const base = {
      fontSize: opts.font || PKG_TITLE_FONT,
      fontStyle: opts.bold ? "bold" : "normal",
      textColor: opts.textColor || C.textBody,
      cellPadding: {
        top: PKG_TITLE_PAD,
        bottom: PKG_TITLE_PAD,
        left: 2,
        right: 2,
      },
      lineWidth: { top: PKG_RULE },
    };
    if (opts.fill) base.fillColor = opts.fill;
    body.push([
      { content: label, styles: { ...base } },
      { content: amount, styles: { ...base, halign: "right" } },
    ]);
  };

  // ── Make the PRINTED column foot, not just the real arithmetic ────────────
  // The partition is exact to ~1e-10, but peso() rounds every cell
  // independently and several inputs are genuinely fractional — cabling's own
  // comment at calculations.js:1536 already flags a ₱1 disagreement, and each
  // shipped promo is a percentage code. So the five printed cells could sum to
  // ±₱1 away from the printed Total on roughly a fifth of discounted quotes.
  //
  // Round every cell FIRST with peso()'s own rule (half away from zero — note
  // Math.round disagrees on negatives, which matters now that a reversal row
  // can push a group negative), then absorb the residual into the largest
  // group, where a ₱1 adjustment is proportionally least visible. The Total
  // stays terms.netDirectPrice: it is the number the schedule, page 4 and the
  // lead payload all quote, so it must not be derived from the rounded parts.
  const pesoRound = (v) => (v < 0 ? -Math.round(Math.abs(v)) : Math.round(v));
  const rTotal = pesoRound(terms.netDirectPrice || 0);
  const rDiscount = pesoRound(Math.abs(terms.discountAmount || 0));
  const groupAmounts = {
    solar: pesoRound(solarTot),
    battery: pesoRound(batteryTot),
    misc: pesoRound(miscTot),
  };
  const residual =
    rTotal -
    (groupAmounts.solar + groupAmounts.battery + groupAmounts.misc - rDiscount);
  if (residual !== 0) {
    const biggest = ["solar", "battery", "misc"].reduce((a, b) =>
      Math.abs(groupAmounts[b]) > Math.abs(groupAmounts[a]) ? b : a,
    );
    groupAmounts[biggest] += residual;
  }

  pushGroup(
    // A zero-panel order can still carry Solar money (standalone RSD), and
    // "0 kWp Solar Package" reads as a bug. The Battery branch below already
    // guarded this case.
    systemKwp > 0 ? `${fmtKwp(systemKwp)} kWp Solar Package` : "Solar Package",
    solarSubs,
    groupAmounts.solar,
  );
  pushGroup(
    batteryKwh > 0
      ? `${Math.round(batteryKwh)} kWh Battery Package`
      : "Battery Package",
    batterySubs,
    groupAmounts.battery,
  );
  // The engine's label has no Oxford comma; the frame does. Overridden here
  // rather than in adminParams because PACKAGE_CATEGORIES also feeds the
  // Summary tab and the admin editor.
  pushGroup(
    "Misc. Materials, Labor, Services, & Other Adjustments**",
    miscSubs,
    groupAmounts.misc,
  );
  // Mirrors pushGroup's own drop condition, so the ** legend in the amber box
  // below is only printed when there is a ** on the page for it to explain.
  const miscGroupShown = miscSubs.length > 0 || groupAmounts.misc !== 0;

  // Always shown, per the frame. discountAmount is <= 0 (calculations.js:2084);
  // the UI writes the minus sign BEFORE the peso glyph, so match it here.
  summaryRow(
    "Less: Discounts",
    rDiscount === 0 ? "—" : `−${peso(rDiscount)}`,
  );
  summaryRow("Total (VAT Inclusive)", peso(rTotal), {
    bold: true,
    font: 9,
    fill: [236, 243, 236],
    textColor: [31, 82, 43],
  });
  // DST sits BELOW the Total, not above it: it is a tax on the LOAN, is not
  // inside netDirectPrice (calculations.js:2085), and is already billed once as
  // its own schedule milestone (schedule.js:592-598). Putting it between the
  // groups and the Total would make the column stop footing. It is P0 for a
  // direct purchase (tenor < 1), so the row only appears on a financed quote.
  if ((terms.dst || 0) > 0) {
    summaryRow("Documentary Stamp Tax (financing)", peso(terms.dst), {
      font: PKG_SUB_FONT,
      textColor: C.textMuted,
    });
  }

  // Autotable continuation pages otherwise get no background, no header and no
  // footer. The table is within roughly one row of breaking at this scale, so
  // this is defensive rather than routine.
  const pkgPagesDrawn = new Set();
  autoTable(mgr.doc, {
    startY: mgr.y,
    head: [["Equipment, Materials, and Labor", "Amount"]],
    body,
    // 'plain' keeps body cells transparent so the page watermark shows through.
    // The default 'striped' theme sets table.fillColor 255 — opaque — on EVERY
    // body cell via the style merge, not just alternating ones.
    theme: "plain",
    margin: { left: MARGIN, right: MARGIN, top: MARGIN + 14, bottom: 18 },
    tableWidth: CONTENT_W,
    styles: {
      // Must be "Inter", not "helvetica": autotable validates styles.fontStyle
      // against getFontList()[styles.font] and silently substitutes
      // availableFontStyles[0] when it misses. registerPdfFonts patches
      // doc.setFont only — never jsPDF's fontmap — so getFontList().helvetica
      // still lacks semibold/medium and every bold-ish cell would draw Regular.
      font: "Inter",
      fontSize: PKG_SUB_FONT,
      cellPadding: PKG_SUB_PAD,
      lineWidth: 0,
      lineColor: PKG_LINE_COLOR,
      textColor: C.textBody,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: PKG_HEAD_FILL,
      textColor: C.textBody,
      fontStyle: "bold",
      fontSize: PKG_TITLE_FONT,
      lineWidth: { top: PKG_RULE, bottom: PKG_RULE },
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index === 1) {
        data.cell.styles.halign = "center";
      }
    },
    columnStyles: {
      0: { cellWidth: PKG_COL_LABEL },
      1: { cellWidth: PKG_COL_AMOUNT, halign: "right" },
    },
    willDrawPage: (data) => {
      if (data.pageNumber > 1 && !pkgPagesDrawn.has(data.pageNumber)) {
        pkgPagesDrawn.add(data.pageNumber);
        drawPageBackground(mgr);
        drawTopHeaderFigma(mgr);
      }
    },
  });
  reconcilePageNumber(mgr);
  mgr.y = mgr.doc.lastAutoTable.finalY + 6;

  // ── Inclusions / Warranty, as two prose paragraphs per the frame ──────────
  const inclusions = [
    "Free site assessment",
    "Complete installation by certified team",
    "System testing and energization",
    "Free delivery (within 30km of KM 0)",
    "Customer onboarding and training",
    "Monitoring app access",
    "Dedicated 24/7 technical support team",
  ];
  const warranties = [
    { label: "Solar Panels Performance", duration: "30 Years" },
    { label: "Solar Panels Product Warranty", duration: "12 Years" },
    { label: "Inverter", duration: "5 Years" },
    { label: "Battery", duration: "5 Years" },
    { label: "Workmanship", duration: "1 Year" },
  ];

  const colGap = 8;
  const colW = (CONTENT_W - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + colGap;

  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7);
  const inclLines = mgr.doc.splitTextToSize(inclusions.join(", "), colW);
  const warrLines = mgr.doc.splitTextToSize(
    warranties.map((w) => `${w.label} (${w.duration})`).join(", "),
    colW,
  );
  const proseLineH = 3.2;
  // Measured at this split and 7pt: Inclusions wraps to 4 lines and Warranty to
  // 2, so Inclusions drives the height — but take the max so the block stays
  // correct if either copy changes.
  const proseH = 5 + Math.max(inclLines.length, warrLines.length) * proseLineH;

  // This block previously had no page-break guard at all — the only one in the
  // function was for the amber box below. Once the table itemises, mgr.y lands
  // near the footer baseline and the block drew straight off the page edge and
  // vanished instead of reflowing.
  pageBreakIfNeeded(mgr, proseH + 4);
  const proseY = mgr.y + 4;

  mgr.doc.setFont("helvetica", "bold");
  mgr.doc.setFontSize(9);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text("Inclusions", leftX, proseY);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text("Warranty", rightX, proseY);

  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(...C.textBody);
  mgr.doc.text(inclLines, leftX, proseY + 5);
  mgr.doc.setTextColor(...C.brandGreen);
  mgr.doc.text(warrLines, rightX, proseY + 5);

  mgr.y = proseY + proseH + 3;

  // ── Compliance / RSD disclaimer (approved Legal copy, backlog #4 & #18) ──
  // The RSD compliance paragraph (and the declined "did not choose" copy) is
  // only shown when RSD is relevant to the order — i.e. there are solar panels
  // or an RSD is availed. Battery-only orders skip it (v3-143). The Other Costs
  // note always renders. The amber box grows to fit whatever is rendered.
  // ── Compliance / RSD disclaimer (approved Legal copy, backlog #4 & #18) ──
  const compParas = [];

  compParas.push([
    { t: "*Compliance. ", b: true },
    {
      t: "Rapid Shutdown Device (RSD): The Philippine Electrical Code (PEC) 2017, Section 6.90.2.6, requires an RSD for all solar PV installations. An RSD allows first responders to quickly de-energize your rooftop array during a fire or emergency, and helps you avoid findings or delays during LGU permitting and inspection. An RSD and Certificate of Final Electrical Inspection (CFEI) are likewise required when net metering conversion is availed.",
      b: false,
    },
  ]);

  compParas.push([
    {
      t: "Solviva strongly recommends the inclusion of an RSD in every system. ",
      b: true,
    },
    {
      t: "Should you elect to proceed without one, you do so at your own election and against our recommendation. By accepting this proposal with the RSD excluded, you confirm that (a) the requirement and its purpose were explained to you; (b) you assume full responsibility for all consequences of the exclusion, including denial or delay of LGU permits, delay in commissioning, adverse inspection findings, ineligibility for net metering, insurance implications, and any loss of life, injury, fire, or property damage arising from the inability to rapidly de-energize the system; and (c) you hold Solviva Energy, its affiliates, directors, officers, employees, representatives, and contractors free and harmless from any claim, loss, penalty, or liability arising from such exclusion. Installing an RSD at a later date will be quoted and charged separately.",
      b: false,
    },
  ]);

  // The site-assessment disclaimer applies to EVERY quote, so it always
  // renders. Only its heading changes: it names the ** row when that row is on
  // the page, and stands on its own when the Misc group fell away — otherwise
  // the page would carry a ** legend with no ** to explain.
  compParas.push([
    {
      // The period belongs to the bold heading: wrapCompPara appends a space to
      // every word, so leading it on the next span renders "Adjustments ." with
      // a gap before the stop.
      t: miscGroupShown
        ? "**Misc. Materials, Labor, Services, & Other Adjustments."
        : "Site assessment.",
      b: true,
    },
    {
      t: "Final system layout and price subject to site assessment. Roof orientation, shading, structural load, and available area may affect panel placement, output, and price.",
      b: false,
    },
  ]);
  const compFont = 6.8;
  const compLineH = 2.9;
  const compParaGap = 1.6;
  const compPadX = 4;
  const compMaxW = CONTENT_W - compPadX * 2;

  const wrapCompPara = (para) => {
    const words = [];
    for (const span of para) {
      span.t.split(" ").forEach((word) => {
        if (word.length) words.push({ t: word + " ", b: span.b });
      });
    }
    const out = [];
    let line = [];
    let lineW = 0;
    for (const wd of words) {
      mgr.doc.setFont("helvetica", wd.b ? "bold" : "normal");
      mgr.doc.setFontSize(compFont);
      const w = mgr.doc.getTextWidth(wd.t);
      if (lineW + w > compMaxW && line.length) {
        out.push(line);
        line = [];
        lineW = 0;
      }
      line.push(wd);
      lineW += w;
    }
    if (line.length) out.push(line);
    return out;
  };

  const compWrapped = compParas.map(wrapCompPara);
  const compLineCount = compWrapped.reduce((n, l) => n + l.length, 0);
  const compBoxH =
    compLineCount * compLineH + (compWrapped.length - 1) * compParaGap + 8;

  pageBreakIfNeeded(mgr, compBoxH + 4);
  const noteY = mgr.y;

  mgr.doc.setFillColor(255, 244, 217);
  mgr.doc.setDrawColor(248, 214, 137);
  mgr.doc.roundedRect(MARGIN, noteY, CONTENT_W, compBoxH, 2, 2, "FD");

  let cty = noteY + 6;
  compWrapped.forEach((linesForPara, pi) => {
    for (const line of linesForPara) {
      let cx = MARGIN + compPadX;
      for (const span of line) {
        mgr.doc.setFont("helvetica", span.b ? "bold" : "normal");
        mgr.doc.setFontSize(compFont);
        mgr.doc.setTextColor(136, 106, 42);
        mgr.doc.text(span.t, cx, cty);
        cx += mgr.doc.getTextWidth(span.t);
      }
      cty += compLineH;
    }
    if (pi < compWrapped.length - 1) cty += compParaGap;
  });
  mgr.y = noteY + compBoxH + 3;
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

  mgr.doc.setFont("helvetica", "semibold");
  mgr.doc.setFontSize(fxpt(64));
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

  // The "Selected" recap only describes a Rent-to-Own plan, so it is drawn
  // ONLY when the customer actually picked one. On a Direct Purchase (tenor 0)
  // it used to fall back to `state.tenor || 60`, printing a phantom "60 months"
  // row whose Total/Monthly charge were the Direct Purchase figures — the two
  // tables above already state the real terms, so the recap is simply omitted.
  if (!terms.isDirectPurchase && (state.tenor || 0) > 0) {
    drawTableTitleBar(mgr, "Selected Rent-to-Own Plan");
    autoTable(mgr.doc, {
      startY: mgr.y,
      head: [["Tenor", "Down payment", "DST", "Total", "Monthly charge"]],
      body: [
        [
          `${state.tenor} months`,
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
  }

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
    doc.setLineWidth(0.4);
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

function drawScheduleHeaderFigma(mgr) {
  const { doc, ctx } = mgr;
  const logoData = ctx.assets?.logo;
  if (logoData) {
    const props = doc.getImageProperties(logoData);
    const targetHeight = fxmm(136);
    const targetWidth = targetHeight * (props.width / props.height);
    doc.addImage(
      logoData,
      "PNG",
      fxmm(88),
      fxmm(89),
      targetWidth,
      targetHeight,
    );
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fxpt(32));
  doc.setTextColor(73, 73, 73);
  // Same three meta lines as drawTopHeaderFigma; the schedule title sits at
  // y=321px (27.2mm), clear of the third line at y=221px (18.7mm).
  doc.text(`Reference No.: ${ctx.quoteRef}`, fxmm(2389), fxmm(107), {
    align: "right",
  });
  doc.text(
    `Date Issued: ${fmtDate(ctx.generatedDate)}`,
    fxmm(2389),
    fxmm(164),
    {
      align: "right",
    },
  );
  doc.text(
    `Valid Until: ${fmtDate(ctx.validUntil)}`,
    fxmm(2389),
    fxmm(221),
    {
      align: "right",
    },
  );
  doc.setFont("helvetica", "semibold");
  doc.setFontSize(fxpt(48));
  doc.setTextColor(0, 106, 198);
  doc.text("Schedule of payments", fxmm(85), fxmm(321), { baseline: "top" });
  // Leave the cursor below the header, the way drawTopHeaderFigma does. Without
  // this, mgr.y stayed at MARGIN, so when pageBreakIfNeeded drew this header on
  // an overflow page the caller's next block (the opaque early-payoff note box)
  // painted straight over it. fxmm(404) is the schedule's own scheduleTop —
  // MARGIN + 14 would land inside the "Schedule of payments" title.
  mgr.y = fxmm(404);
}

function drawScheduleFooterFigma(mgr) {
  const { doc, ctx, pageNumber } = mgr;
  mgr.footerStamps.push({ pageNumber, y: fxmm(3380), figmaExact: true });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fxpt(32));
  doc.setTextColor(73, 73, 73);
  doc.text("www. solvivaenergy.com", fxmm(94), fxmm(3380), { baseline: "top" });
  doc.text(String(pageNumber), fxmm(2392), fxmm(3380), {
    align: "right",
    baseline: "top",
  });
}

function drawSchedulePage(mgr) {
  const { ctx } = mgr;
  const { model } = ctx;
  const annex = model.annex || { rows: [] };

  drawScheduleHeaderFigma(mgr);

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

  const scheduleLeft = fxmm(87);
  const scheduleRight = fxmm(87);
  const scheduleTop = fxmm(404);

  // AutoTable silently creates continuation pages, so each one needs the same
  // Figma background, header, and footer before its rows are drawn.
  const originalAddPage = mgr.doc.addPage.bind(mgr.doc);
  mgr.doc.addPage = function () {
    originalAddPage(...arguments);
    mgr.pageNumber++; // Keep our global page tracker perfectly in sync

    drawPageBackground(mgr);
    drawScheduleFooterFigma(mgr);
    drawScheduleHeaderFigma(mgr);
  };

  autoTable(mgr.doc, {
    startY: scheduleTop,
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
    margin: {
      left: scheduleLeft,
      right: scheduleRight,
      top: scheduleTop,
      // v3-178 fix — this must be the RESERVED HEIGHT from the page bottom
      // (autoTable's margin.bottom semantics), not the absolute Figma Y of
      // the footer band. Passing fxmm(3380) directly left ~286mm of "margin"
      // on a 297mm page — near-zero usable height — so any table needing to
      // paginate (long tenors, 60 rows) fed autoTable a row taller than the
      // page on every continuation page, spinning into its "row -1" infinite
      // pagination bug and blowing the call stack.
      bottom: PAGE_H - fxmm(3380),
    },
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: fxpt(32),
      cellPadding: { top: 0, right: 2, bottom: 0, left: 3 }, // Keeps your previous padding fix
      minCellHeight: fxmm(87),
      valign: "middle",
      fillColor: [255, 255, 255], // Changed to pure white to match the image
      textColor: [52, 64, 84],
      lineColor: [210, 210, 210], // Lighter gray for the dividers
      lineWidth: { bottom: 1.0 }, // This removes vertical lines and leaves only the bottom border
    },
    headStyles: {
      fillColor: [31, 82, 43],
      textColor: [210, 255, 30],
      fontStyle: "medium",
      fontSize: fxpt(32),
      minCellHeight: fxmm(87),
      lineWidth: 0, // Removes the divider line from the green header block
    },
    columnStyles: {
      0: { cellWidth: fxmm(125), halign: "center" },
      1: { cellWidth: fxmm(469), halign: "left" },
      2: { cellWidth: fxmm(532), halign: "left" },
      3: { cellWidth: fxmm(389), halign: "left" },
      4: { cellWidth: fxmm(448), halign: "left" },
      5: { cellWidth: fxmm(340), halign: "left" },
    },
    didParseCell: function (data) {
      // Style the DP row exactly like the image
      if (data.section === "body" && data.row.index === 0) {
        data.cell.styles.fillColor = [120, 120, 120]; // Adjusted to match the lighter gray in the new image
        data.cell.styles.textColor = [252, 252, 252];
        data.cell.styles.fontStyle = "medium";
        data.cell.styles.lineWidth = 0; // Removes the bottom line so the block looks seamless
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
  const validityDate = fmtDate(ctx.validUntil);
  const clientName = ctx.contact?.name || "Client Name";

  drawTopHeaderFigma(mgr);
  mgr.y += 2;

  mgr.doc.setFont("helvetica", "semibold");
  mgr.doc.setFontSize(fxpt(64));
  mgr.doc.setTextColor(0, 106, 198);
  mgr.doc.text("Proposal Terms", MARGIN, mgr.y + 4);
  mgr.y += 12;

  const colW = (CONTENT_W - 8) / 2; // Two columns with an 8pt gutter
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 8;

  // 1. Parse dynamic content from adminParams.js instead of hardcoding
  const rawBlocks = ctx.proposalContent?.termsAndConditions || [];
  const parsedBlocks = [];
  let currentBlock = null;

  rawBlocks.forEach((item) => {
    if (item.kind === "heading") {
      // Push previous block and start a new one
      if (currentBlock) parsedBlocks.push(currentBlock);
      currentBlock = { title: item.text, text: [], boldParagraphs: [] };
    } else if (item.kind === "paragraph") {
      if (!currentBlock) currentBlock = { text: [], boldParagraphs: [] };

      let text = item.text
        .replace(
          /{{QUOTE_VALIDITY_DAYS}}/g,
          ctx.adminParams?.quoteValidityDays || 30,
        )
        .replace(/{{VALID_UNTIL}}/g, validityDate)
        .replace(
          /{{LUZON_FREE_KM}}/g,
          ctx.adminParams?.luzonFreeTravelKm || 30, // Pulls the '30' from the admin params
        );

      // Track if this specific paragraph needs to be bold
      if (item.bold) {
        currentBlock.boldParagraphs.push(currentBlock.text.length);
      }
      currentBlock.text.push(text);
    } else if (item.kind === "bullets") {
      if (!currentBlock) currentBlock = { text: [], boldParagraphs: [] };
      item.items.forEach((bullet) => {
        if (typeof bullet === "string") {
          currentBlock.text.push(`• ${bullet}`);
        } else if (bullet.term && bullet.rest) {
          currentBlock.text.push(`• ${bullet.term}${bullet.rest}`);
        }
      });
    } else if (item.kind === "warrantyTable") {
      if (currentBlock) parsedBlocks.push(currentBlock);
      currentBlock = null;
    }
  });
  // Catch the final block
  if (currentBlock) parsedBlocks.push(currentBlock);

  // 2. Dynamically split parsed blocks at a specific heading to match Figma
  let splitIndex = parsedBlocks.findIndex((b) => b.title === "Installation");
  if (splitIndex === -1) splitIndex = Math.ceil(parsedBlocks.length / 2);

  const leftCol = parsedBlocks.slice(0, splitIndex);
  const rightCol = parsedBlocks.slice(splitIndex);

  const TITLE_PT = fxpt(32);
  const BODY_PT = fxpt(28);
  const TC_LINE_HEIGHT = 1.63;
  const bodyLineMm = BODY_PT * TC_LINE_HEIGHT * 0.352778;
  const titleTightMm = TITLE_PT * 1.15 * 0.352778;

  // 3. Updated renderCol
  const renderCol = (blocks, startX, startY) => {
    let currentY = startY;
    blocks.forEach((b) => {
      // Check for existence of a title before drawing
      if (b.title) {
        mgr.doc.setFont("helvetica", b.titleBold ? "bold" : "semibold");
        mgr.doc.setFontSize(TITLE_PT);
        mgr.doc.setTextColor(...(C.textBody || [40, 40, 40]));

        const titleLines = mgr.doc.splitTextToSize(b.title, colW);
        mgr.doc.setLineHeightFactor(1.15);
        mgr.doc.text(titleLines, startX, currentY);
        currentY += titleLines.length * titleTightMm + 1.5;
        mgr.doc.setLineHeightFactor(TC_LINE_HEIGHT);
      }

      mgr.doc.setFontSize(BODY_PT);

      const renderText = (textStr, bold = false) => {
        const isBullet = textStr.startsWith("• ");
        const textToSplit = isBullet ? textStr.substring(2) : textStr;
        const indentX = isBullet ? startX + 3.5 : startX;

        mgr.doc.setFont("helvetica", bold ? "bold" : "normal");
        const lines = mgr.doc.splitTextToSize(
          textToSplit,
          colW - (isBullet ? 3.5 : 0),
        );

        if (isBullet) mgr.doc.text("•", startX, currentY);
        mgr.doc.text(lines, indentX, currentY);
        currentY += lines.length * bodyLineMm + 1;
      };

      if (Array.isArray(b.text)) {
        b.text.forEach((item, idx) => {
          // Add extra vertical space before a paragraph if it follows bullets or another paragraph
          if (idx > 0 && !item.startsWith("• ")) {
            currentY += 3.5;
          }
          renderText(
            item,
            Array.isArray(b.boldParagraphs) && b.boldParagraphs.includes(idx),
          );
        });
      }
      currentY += 2;
    });
    return currentY;
  };

  mgr.doc.setLineHeightFactor(TC_LINE_HEIGHT);
  const leftEndY = renderCol(leftCol, leftX, mgr.y);
  const rightEndY = renderCol(rightCol, rightX, mgr.y);

  mgr.y = Math.max(leftEndY, rightEndY) + 5;

  // (The "4. Render dynamic closing paragraph" code block is now deleted entirely,
  // so the next line of code below this should be:
  // Render bottom acceptance section
  mgr.doc.setFont("helvetica", "semibold");
  mgr.doc.setFontSize(fxpt(34));
  mgr.doc.setTextColor(0, 106, 198); // Solviva Blue
  mgr.doc.text("Proposal Acceptance and Signature", MARGIN, mgr.y);
  mgr.y += 4.5;

  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.setFontSize(7);
  mgr.doc.setTextColor(...(C.textBody || [40, 40, 40]));

  const acceptText = `By signing below, the Customer and Solviva Energy acknowledge and accept the terms of this proposal, valid until ${validityDate}. This Proposal is subject to among others, the internal review and approval and execution of the Definitive Agreements, before installation.`;
  const acceptLines = mgr.doc.splitTextToSize(acceptText, CONTENT_W);
  mgr.doc.text(acceptLines, MARGIN, mgr.y);

  mgr.y += acceptLines.length * 3.5 + 10;

  mgr.y += 4;
  mgr.doc.setFont("helvetica", "normal");
  mgr.doc.text(clientName, MARGIN, mgr.y);

  mgr.y += 4;
  mgr.doc.text("Date:", MARGIN, mgr.y);

  mgr.doc.setLineHeightFactor(1.15); // restore jsPDF default for later pages
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
    `By signing below, the Customer and Solviva Energy acknowledge and accept the terms of this Proposal${validUntil ? `, valid until ${fmtDate(validUntil)}` : ""}. This Proposal is subject to among others, the internal review and approval and execution of the Definitive Agreements, before installation.`,
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

  const [
    logoData,
    logoSunData,
    proposalBackgroundData,
    bannerData,
    fallbackBannerData,
  ] = await Promise.all([
    fetchPublicImageDataUrl("/logo-full-v2.png"),
    fetchPublicImageDataUrl("/logo-sun-v2.png"),
    fetchPublicImageDataUrl("/proposal-background.jpg"),
    fetchPublicImageDataUrl("/proposal-banner.png"),
    fetchPublicImageDataUrl("/twinsun-v3.png"),
  ]);
  ctx.assets.logo = logoData;
  ctx.assets.logoSun = logoSunData;
  ctx.assets.proposalBackground = proposalBackgroundData;

  // Crop the banner to the hero strip before it hits jsPDF. The banner is now a
  // permanent local asset (/proposal-banner.png) exported from the Figma PDF
  // Proposal file. It was previously fetched from an ephemeral Figma MCP URL
  // that 404'd, which silently dropped the PDF back to the tiny pixelated
  // /twinsun-v3.png fallback.
  const rawBannerData = bannerData || fallbackBannerData;
  ctx.assets.banner = await cropBannerToRatio(rawBannerData);

  const mgr = makePageManager(doc, ctx);

  // Page 1: cover/overview
  drawCoverPage1(mgr);

  // Page 2: Step 1
  // Story 004 AC3 — pass the page's header drawer so an overflow page created
  // by pageBreakIfNeeded carries the logo, reference and both dates too.
  newPage(mgr, { header: drawTopHeaderFigma });
  drawStep1Page(mgr);

  // Page 3: System package in detail
  newPage(mgr, { header: drawTopHeaderFigma });
  drawPackageDetailPage(mgr);

  // Page 4: Savings & payment options
  newPage(mgr, { header: drawTopHeaderFigma });
  drawPaymentOptionsPage(mgr);

  // Page 5: Understanding your system's potential (vector, matches Figma 1:1496)
  newPage(mgr, { header: drawTopHeaderFigma });
  drawVisualizingPage(mgr);

  // Pages 6-7: Schedule of Payments (RTO terms)
  // We only draw the schedule table if they are financing (tenor > 0)
  if (state.tenor > 0) {
    newPage(mgr, { scheduleExact: true, header: drawScheduleHeaderFigma });
    drawSchedulePage(mgr);
  }

  // Page 8: Terms & conditions (own acceptance block carries the signature —
  // suppress the per-page footer signature line here to match the Figma design)
  newPage(mgr, {
    figmaExact: true,
    noSignatureLine: true,
    header: drawTopHeaderFigma,
  });
  drawTermsAndConditions(mgr);

  // Re-stamp totals
  finalizeFooters(mgr);

  // Save
  const safeName = (contact?.name || "customer").replace(/[^a-zA-Z0-9]+/g, "_");
  const fname = `Solviva-Proposal-${ctx.quoteRef}-${safeName}.pdf`;
  doc.save(fname);
}
