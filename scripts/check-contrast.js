/* eslint-disable no-console */
/**
 * WCAG contrast verification for the design tokens.
 *
 * Colour choices are easy to argue about and hard to verify by eye — especially
 * on a dark theme, where a colour that looks fine on a bright monitor can be
 * unreadable on a phone outdoors. This measures every foreground/background
 * pair the app actually renders, in both themes, against the WCAG 2.1 targets.
 *
 * Targets (WCAG 2.1):
 *   4.5:1  normal body text                        (AA)
 *   3.0:1  large text (>=18.66px bold / >=24px)     (AA)
 *   3.0:1  non-text UI: borders, icons, dividers    (AA, 1.4.11)
 *
 * Soft backgrounds in the palette are semi-transparent (e.g. `accentSoft` is
 * `rgba(...)` over a surface), so those pairs are alpha-composited against the
 * surface they sit on before measuring. Measuring the raw rgba string would
 * report a contrast the user never actually sees.
 *
 * Run with:  npm run check:contrast
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const ts = require('typescript');

/** tokens.ts imports nothing, so transpiling and evaluating it is safe. */
function loadTokens() {
  const file = path.join(ROOT, 'src/design/tokens.ts');
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const mod = new Module('tokens');
  mod._compile(js, 'tokens.js');
  return mod.exports;
}

/* ------------------------------------------------------------------ */
/* Colour maths                                                        */
/* ------------------------------------------------------------------ */

function parseColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }

  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => Number.parseFloat(p.trim()));
    return {
      r: parts[0] ?? 0,
      g: parts[1] ?? 0,
      b: parts[2] ?? 0,
      a: parts[3] === undefined ? 1 : parts[3],
    };
  }

  throw new Error(`Unparseable colour: ${value}`);
}

/** Composite a possibly-transparent colour over an opaque backdrop. */
function composite(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

/** WCAG 2.1 relative luminance. */
function luminance({ r, g, b }) {
  const channel = (raw) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/* ------------------------------------------------------------------ */
/* The pairs the app actually renders                                  */
/* ------------------------------------------------------------------ */

/**
 * `min` is the WCAG target for that pair's role.
 * `over` names the opaque surface a translucent background composites onto.
 */
const PAIRS = [
  // --- body text -----------------------------------------------------
  { fg: 'text', bg: 'bg', min: 4.5, role: 'body text on background' },
  { fg: 'text', bg: 'surface', min: 4.5, role: 'body text on card' },
  { fg: 'text', bg: 'surfaceAlt', min: 4.5, role: 'body text on nested surface' },
  { fg: 'textMuted', bg: 'bg', min: 4.5, role: 'muted text on background' },
  { fg: 'textMuted', bg: 'surface', min: 4.5, role: 'muted text on card' },
  { fg: 'textMuted', bg: 'surfaceAlt', min: 4.5, role: 'muted text on nested surface' },

  // --- de-emphasised text: captions and metadata, large-text target ---
  { fg: 'textSubtle', bg: 'bg', min: 3.0, role: 'subtle text on background' },
  { fg: 'textSubtle', bg: 'surface', min: 3.0, role: 'subtle text on card' },

  // --- accent and semantic text --------------------------------------
  { fg: 'accent', bg: 'bg', min: 4.5, role: 'accent text on background' },
  { fg: 'accent', bg: 'surface', min: 4.5, role: 'accent text on card' },
  { fg: 'textOnAccent', bg: 'accent', min: 4.5, role: 'label on filled button' },
  { fg: 'positive', bg: 'surface', min: 4.5, role: 'income amount on card' },
  { fg: 'negative', bg: 'surface', min: 4.5, role: 'expense/error text on card' },
  { fg: 'warning', bg: 'surface', min: 3.0, role: 'warning icon on card' },

  // --- text on soft (translucent) chip backgrounds --------------------
  { fg: 'accent', bg: 'accentSoft', over: 'surface', min: 4.5, role: 'accent text on accent chip' },
  { fg: 'text', bg: 'accentSoft', over: 'surface', min: 4.5, role: 'body text on a selected row' },
  { fg: 'positive', bg: 'positiveSoft', over: 'surface', min: 4.5, role: 'positive text on chip' },
  { fg: 'negative', bg: 'negativeSoft', over: 'surface', min: 4.5, role: 'negative text on chip' },

  // --- non-text UI ----------------------------------------------------
  { fg: 'borderStrong', bg: 'surface', min: 3.0, role: 'focused input border' },
  { fg: 'accent', bg: 'surfaceAlt', min: 3.0, role: 'selected chip border' },
];

let failures = 0;

function evaluate(themeName, colors) {
  console.log(`\n  ${themeName.toUpperCase()}`);

  for (const pair of PAIRS) {
    const surface = pair.over ? parseColor(colors[pair.over]) : null;

    const rawBg = parseColor(colors[pair.bg]);
    const bg = surface ? composite(rawBg, surface) : rawBg;
    const fg = composite(parseColor(colors[pair.fg]), bg);

    const ratio = contrastRatio(fg, bg);
    const ok = ratio >= pair.min;
    if (!ok) failures += 1;

    console.log(
      `    ${ok ? '✓' : '✗'} ${ratio.toFixed(2).padStart(5)}:1 ` +
        `(need ${pair.min.toFixed(1)})  ${pair.role}`,
    );
  }
}

const { lightColors, darkColors } = loadTokens();

console.log('\nWCAG 2.1 contrast — design tokens');
evaluate('light', lightColors);
evaluate('dark', darkColors);

console.log(
  failures === 0
    ? `\n  All ${PAIRS.length * 2} pairs meet their target.\n`
    : `\n  ${failures} pair(s) below target.\n`,
);

process.exit(failures === 0 ? 0 : 1);
