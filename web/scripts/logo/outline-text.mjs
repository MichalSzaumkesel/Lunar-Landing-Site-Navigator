/**
 * outline-text.mjs
 *
 * Converts text strings into SVG path data (`<path d="...">`) using Inter font outlines
 * via opentype.js so brand assets contain no `<text>` elements and do not rely on system fonts.
 *
 * Requirements / External tools:
 * 1. Open font: Inter (SIL Open Font License 1.1)
 * 2. opentype.js
 *
 * Setup outside repo (e.g. in %TEMP%\logo-tools):
 *   mkdir %TEMP%\logo-tools
 *   cd %TEMP%\logo-tools
 *   npm init -y
 *   npm install @fontsource/inter opentype.js
 *
 * Environment variables:
 *   FONT_DIR      Path to directory containing Inter .woff files (e.g. .../node_modules/@fontsource/inter/files)
 *   OPENTYPE_DIR  Path to opentype.js package (e.g. .../node_modules/opentype.js)
 *
 * Execution example:
 *   $env:FONT_DIR = "$env:TEMP/logo-tools/node_modules/@fontsource/inter/files"
 *   $env:OPENTYPE_DIR = "$env:TEMP/logo-tools/node_modules/opentype.js"
 *   node web/scripts/logo/outline-text.mjs "Lunar Landing" --weight 600 --size 28
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Resolve opentype.js and font directory from environment or fallback locations.
 */
export function resolveDirs() {
  const tempLogoTools = path.join(os.tmpdir(), 'logo-tools', 'node_modules');

  // Candidate locations for opentype.js
  const opentypeCandidates = [
    process.env.OPENTYPE_DIR,
    process.env.OPENTYPE_DIR && path.join(process.env.OPENTYPE_DIR, 'dist', 'opentype.js'),
    process.env.OPENTYPE_DIR && path.join(process.env.OPENTYPE_DIR, 'index.js'),
    path.join(tempLogoTools, 'opentype.js'),
    path.join(tempLogoTools, 'opentype.js', 'dist', 'opentype.js'),
    path.join(os.tmpdir(), 'node_modules', 'opentype.js'),
  ].filter(Boolean);

  let opentypePath = null;
  for (const candidate of opentypeCandidates) {
    if (fs.existsSync(candidate)) {
      opentypePath = candidate;
      break;
    }
  }

  // Candidate locations for Inter woff fonts
  const fontDirCandidates = [
    process.env.FONT_DIR,
    path.join(tempLogoTools, '@fontsource', 'inter', 'files'),
    path.join(os.tmpdir(), 'node_modules', '@fontsource', 'inter', 'files'),
  ].filter(Boolean);

  let fontDir = null;
  for (const candidate of fontDirCandidates) {
    if (fs.existsSync(candidate)) {
      fontDir = candidate;
      break;
    }
  }

  return { opentypePath, fontDir };
}

let cachedOpentype = null;
function getOpentype() {
  if (cachedOpentype) return cachedOpentype;
  const { opentypePath } = resolveDirs();
  if (!opentypePath) {
    throw new Error(
      'Could not locate opentype.js. Please set OPENTYPE_DIR or install in %TEMP%/logo-tools/node_modules/opentype.js'
    );
  }
  cachedOpentype = require(path.resolve(opentypePath));
  return cachedOpentype;
}

const fontCache = new Map();

/**
 * Load and parse Inter font (.woff) for the specified weight (e.g. 400 or 600).
 */
export function loadFont(weight = 600) {
  const key = Number(weight);
  if (fontCache.has(key)) {
    return fontCache.get(key);
  }

  const { fontDir } = resolveDirs();
  if (!fontDir) {
    throw new Error(
      'Could not locate Inter font files. Please set FONT_DIR or install @fontsource/inter in %TEMP%/logo-tools'
    );
  }

  // Prefer latin normal woff file, then general normal woff
  const candidates = [
    path.join(fontDir, `inter-latin-${key}-normal.woff`),
    path.join(fontDir, `inter-latin-ext-${key}-normal.woff`),
    path.join(fontDir, `inter-all-${key}-normal.woff`),
  ];

  let fontFilePath = candidates.find((p) => fs.existsSync(p));
  if (!fontFilePath) {
    // Search directory for any matching weight woff
    const files = fs.readdirSync(fontDir);
    const match = files.find((f) => f.includes(`${key}`) && f.endsWith('.woff') && !f.endsWith('.woff2'));
    if (match) {
      fontFilePath = path.join(fontDir, match);
    }
  }

  if (!fontFilePath || !fs.existsSync(fontFilePath)) {
    throw new Error(`Could not find Inter .woff font file for weight ${key} in ${fontDir}`);
  }

  const opentype = getOpentype();
  const fileBuffer = fs.readFileSync(fontFilePath);
  const ab = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
  const font = opentype.parse(ab);

  // Ensure robust Latin glyph mapping without complex bidi failure on certain font lookups
  font.stringToGlyphs = function (s) {
    const glyphs = [];
    for (const ch of s) {
      glyphs.push(this.charToGlyph(ch));
    }
    return glyphs;
  };

  fontCache.set(key, font);
  return font;
}

/**
 * Measure advance width and bounding box for a string.
 */
export function measureText(text, options = {}) {
  const { weight = 600, size = 34, letterSpacing = 0, kerning = true } = options;
  const font = loadFont(weight);

  const renderOptions = {
    kerning,
    letterSpacing,
  };

  const advanceWidth = font.forEachGlyph(text, 0, 0, size, renderOptions, () => {});
  const pathObj = font.getPath(text, 0, 0, size, renderOptions);
  const bbox = pathObj.getBoundingBox();

  return {
    advanceWidth,
    bbox: {
      x1: bbox.x1,
      y1: bbox.y1,
      x2: bbox.x2,
      y2: bbox.y2,
      width: bbox.x2 - bbox.x1,
      height: bbox.y2 - bbox.y1,
    },
  };
}

/**
 * Convert text into SVG path data string (`d`).
 */
export function textToPathData(text, options = {}) {
  const {
    x = 0,
    y = 0,
    weight = 600,
    size = 34,
    letterSpacing = 0,
    kerning = true,
    precision = 2,
    align = 'left', // 'left', 'center', 'right'
  } = options;

  const font = loadFont(weight);
  const renderOptions = {
    kerning,
    letterSpacing,
  };

  const advanceWidth = font.forEachGlyph(text, 0, 0, size, renderOptions, () => {});

  let startX = x;
  if (align === 'center') {
    startX = x - advanceWidth / 2;
  } else if (align === 'right') {
    startX = x - advanceWidth;
  }

  const pathObj = font.getPath(text, startX, y, size, renderOptions);
  const d = pathObj.toPathData(precision);
  const bbox = pathObj.getBoundingBox();

  return {
    d,
    advanceWidth,
    startX,
    bbox: {
      x1: bbox.x1,
      y1: bbox.y1,
      x2: bbox.x2,
      y2: bbox.y2,
      width: bbox.x2 - bbox.x1,
      height: bbox.y2 - bbox.y1,
    },
  };
}

// Standalone CLI support
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const text = args[0] || 'Lunar Landing Site Navigator';
  let weight = 600;
  let size = 34;
  let x = 0;
  let y = 0;
  let align = 'left';

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--weight' && args[i + 1]) weight = Number(args[++i]);
    if (args[i] === '--size' && args[i + 1]) size = Number(args[++i]);
    if (args[i] === '--x' && args[i + 1]) x = Number(args[++i]);
    if (args[i] === '--y' && args[i + 1]) y = Number(args[++i]);
    if (args[i] === '--align' && args[i + 1]) align = args[++i];
  }

  try {
    const result = textToPathData(text, { x, y, weight, size, align });
    console.log(JSON.stringify({
      text,
      weight,
      size,
      advanceWidth: Math.round(result.advanceWidth * 100) / 100,
      bbox: result.bbox,
      pathDataLength: result.d.length,
      pathSample: result.d.slice(0, 100) + '...',
    }, null, 2));
  } catch (err) {
    console.error('Error outline-text:', err.message);
    process.exit(1);
  }
}
