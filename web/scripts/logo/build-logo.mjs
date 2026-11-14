/**
 * build-logo.mjs
 *
 * Regenerates the brand SVG masters (converting wordmark text to vector path outlines)
 * and rasterises all PNG deliverables and the multi-resolution ICO file.
 *
 * Requirements / External tools:
 * 1. Inter font woff files (@fontsource/inter)
 * 2. opentype.js
 * 3. @resvg/resvg-js (for fast, high-quality rasterisation)
 *
 * Setup outside repo (e.g. in %TEMP%\logo-tools):
 *   mkdir %TEMP%\logo-tools
 *   cd %TEMP%\logo-tools
 *   npm init -y
 *   npm install @fontsource/inter opentype.js @resvg/resvg-js
 *
 * Environment variables:
 *   FONT_DIR      Path to directory containing Inter .woff files
 *   OPENTYPE_DIR  Path to opentype.js package
 *   RENDERER_DIR  Path to @resvg/resvg-js package directory
 *
 * How to run:
 *   $env:FONT_DIR = "$env:TEMP/logo-tools/node_modules/@fontsource/inter/files"
 *   $env:OPENTYPE_DIR = "$env:TEMP/logo-tools/node_modules/opentype.js"
 *   $env:RENDERER_DIR = "$env:TEMP/logo-tools/node_modules/@resvg/resvg-js"
 *   node web/scripts/logo/build-logo.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { textToPathData } from './outline-text.mjs';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAND_DIR = path.resolve(__dirname, '../../public/brand');

/**
 * Resolve Resvg renderer from RENDERER_DIR or fallback locations.
 */
function getResvg() {
  const tempTools = path.join(os.tmpdir(), 'logo-tools', 'node_modules');
  const candidates = [
    process.env.RENDERER_DIR,
    process.env.RENDERER_DIR && path.join(process.env.RENDERER_DIR, 'index.js'),
    process.env.RENDERER_DIR && path.join(process.env.RENDERER_DIR, 'node_modules', '@resvg', 'resvg-js'),
    path.join(tempTools, '@resvg', 'resvg-js'),
    path.join(os.tmpdir(), 'node_modules', '@resvg', 'resvg-js'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const mod = require(path.resolve(candidate));
        return mod.Resvg;
      } catch {
        // continue
      }
    }
  }

  throw new Error(
    'Could not load @resvg/resvg-js. Set RENDERER_DIR or install @resvg/resvg-js in %TEMP%/logo-tools.'
  );
}

// -------------------------------------------------------------
// SVG Templates with Vector Wordmark Outlines
// -------------------------------------------------------------

function generateHorizontalMaster(variant, wordmarkPathData) {
  let markContent = '';
  let textFill = '#f2f5fb';

  if (variant === 'on-dark') {
    textFill = '#f2f5fb';
    markContent = `  <!-- Mark (left, diameter 90px) -->
  <g transform="translate(15, 15) scale(0.17578125)">
    <g clip-path="url(#h-mark-circle)">
      <circle cx="256" cy="256" r="236" fill="#07090f"/>
      <circle cx="175" cy="145" r="26" fill="#4aa8ff"/>
      <circle cx="300" cy="295" r="82" fill="#ffc233"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358 L 512 512 L 0 512 Z" fill="#161d2e"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358" fill="none" stroke="#2a3550" stroke-width="4"/>
      <path d="M 0 420 L 75 410 L 145 385 L 230 405 L 340 375 L 430 410 L 512 395 L 512 512 L 0 512 Z" fill="#0f1420"/>
    </g>
    <circle cx="256" cy="256" r="236" fill="none" stroke="#2a3550" stroke-width="8"/>
  </g>`;
  } else if (variant === 'on-light') {
    textFill = '#07090f';
    markContent = `  <!-- Mark (left, diameter 90px) -->
  <g transform="translate(15, 15) scale(0.17578125)">
    <g clip-path="url(#h-mark-circle)">
      <circle cx="256" cy="256" r="236" fill="#07090f"/>
      <circle cx="175" cy="145" r="26" fill="#4aa8ff"/>
      <circle cx="300" cy="295" r="82" fill="#ffc233"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358 L 512 512 L 0 512 Z" fill="#161d2e"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358" fill="none" stroke="#2a3550" stroke-width="4"/>
      <path d="M 0 420 L 75 410 L 145 385 L 230 405 L 340 375 L 430 410 L 512 395 L 512 512 L 0 512 Z" fill="#0f1420"/>
    </g>
    <circle cx="256" cy="256" r="236" fill="none" stroke="#2a3550" stroke-width="8"/>
  </g>`;
  } else if (variant === 'mono-black') {
    textFill = '#000000';
    markContent = `  <!-- Mark (left, diameter 90px mono-black) -->
  <g transform="translate(15, 15) scale(0.17578125)">
    <g clip-path="url(#h-mark-circle)">
      <circle cx="175" cy="145" r="26" fill="#000000"/>
      <circle cx="300" cy="295" r="82" fill="#000000" mask="url(#h-mark-mask)"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358 L 512 512 L 0 512 Z" fill="#000000"/>
    </g>
    <circle cx="256" cy="256" r="236" fill="none" stroke="#000000" stroke-width="16"/>
  </g>`;
  } else if (variant === 'mono-white') {
    textFill = '#ffffff';
    markContent = `  <!-- Mark (left, diameter 90px mono-white) -->
  <g transform="translate(15, 15) scale(0.17578125)">
    <g clip-path="url(#h-mark-circle)">
      <circle cx="175" cy="145" r="26" fill="#ffffff"/>
      <circle cx="300" cy="295" r="82" fill="#ffffff" mask="url(#h-mark-mask)"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358 L 512 512 L 0 512 Z" fill="#ffffff"/>
    </g>
    <circle cx="256" cy="256" r="236" fill="none" stroke="#ffffff" stroke-width="16"/>
  </g>`;
  }

  const maskDef = variant.startsWith('mono')
    ? `\n    <mask id="h-mark-mask">
      <rect width="512" height="512" fill="#ffffff"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358 L 512 512 L 0 512 Z" fill="#000000" stroke="#000000" stroke-width="16" stroke-linejoin="round"/>
    </mask>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 120" width="680" height="120">
  <defs>
    <clipPath id="h-mark-circle">
      <circle cx="256" cy="256" r="236"/>
    </clipPath>${maskDef}
  </defs>
${markContent}
  <!-- Wordmark Vector Outline (Inter SemiBold 600) -->
  <path d="${wordmarkPathData}" fill="${textFill}"/>
</svg>
`;
}

function generateVerticalMaster(variant, line1PathData, line2PathData) {
  let markContent = '';
  let textFill = '#f2f5fb';

  if (variant === 'on-dark') {
    textFill = '#f2f5fb';
    markContent = `  <!-- Mark (centered, diameter 130px) -->
  <g transform="translate(115, 20) scale(0.25390625)">
    <g clip-path="url(#v-mark-circle)">
      <circle cx="256" cy="256" r="236" fill="#07090f"/>
      <circle cx="175" cy="145" r="26" fill="#4aa8ff"/>
      <circle cx="300" cy="295" r="82" fill="#ffc233"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358 L 512 512 L 0 512 Z" fill="#161d2e"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358" fill="none" stroke="#2a3550" stroke-width="4"/>
      <path d="M 0 420 L 75 410 L 145 385 L 230 405 L 340 375 L 430 410 L 512 395 L 512 512 L 0 512 Z" fill="#0f1420"/>
    </g>
    <circle cx="256" cy="256" r="236" fill="none" stroke="#2a3550" stroke-width="8"/>
  </g>`;
  } else if (variant === 'on-light') {
    textFill = '#07090f';
    markContent = `  <!-- Mark (centered, diameter 130px) -->
  <g transform="translate(115, 20) scale(0.25390625)">
    <g clip-path="url(#v-mark-circle)">
      <circle cx="256" cy="256" r="236" fill="#07090f"/>
      <circle cx="175" cy="145" r="26" fill="#4aa8ff"/>
      <circle cx="300" cy="295" r="82" fill="#ffc233"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358 L 512 512 L 0 512 Z" fill="#161d2e"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358" fill="none" stroke="#2a3550" stroke-width="4"/>
      <path d="M 0 420 L 75 410 L 145 385 L 230 405 L 340 375 L 430 410 L 512 395 L 512 512 L 0 512 Z" fill="#0f1420"/>
    </g>
    <circle cx="256" cy="256" r="236" fill="none" stroke="#2a3550" stroke-width="8"/>
  </g>`;
  } else if (variant === 'mono-black') {
    textFill = '#000000';
    markContent = `  <!-- Mark (centered, diameter 130px mono-black) -->
  <g transform="translate(115, 20) scale(0.25390625)">
    <g clip-path="url(#v-mark-circle)">
      <circle cx="175" cy="145" r="26" fill="#000000"/>
      <circle cx="300" cy="295" r="82" fill="#000000" mask="url(#v-mark-mask)"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358 L 512 512 L 0 512 Z" fill="#000000"/>
    </g>
    <circle cx="256" cy="256" r="236" fill="none" stroke="#000000" stroke-width="16"/>
  </g>`;
  } else if (variant === 'mono-white') {
    textFill = '#ffffff';
    markContent = `  <!-- Mark (centered, diameter 130px mono-white) -->
  <g transform="translate(115, 20) scale(0.25390625)">
    <g clip-path="url(#v-mark-circle)">
      <circle cx="175" cy="145" r="26" fill="#ffffff"/>
      <circle cx="300" cy="295" r="82" fill="#ffffff" mask="url(#v-mark-mask)"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358 L 512 512 L 0 512 Z" fill="#ffffff"/>
    </g>
    <circle cx="256" cy="256" r="236" fill="none" stroke="#ffffff" stroke-width="16"/>
  </g>`;
  }

  const maskDef = variant.startsWith('mono')
    ? `\n    <mask id="v-mark-mask">
      <rect width="512" height="512" fill="#ffffff"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358 L 512 512 L 0 512 Z" fill="#000000" stroke="#000000" stroke-width="16" stroke-linejoin="round"/>
    </mask>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 300" width="360" height="300">
  <defs>
    <clipPath id="v-mark-circle">
      <circle cx="256" cy="256" r="236"/>
    </clipPath>${maskDef}
  </defs>
${markContent}
  <!-- Wordmark Vector Outlines (Two centered lines, Inter SemiBold 600) -->
  <path d="${line1PathData}" fill="${textFill}"/>
  <path d="${line2PathData}" fill="${textFill}"/>
</svg>
`;
}

function generateSocialMaster(wordmarkPathData, taglinePathData) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <clipPath id="social-mark-circle">
      <circle cx="256" cy="256" r="236"/>
    </clipPath>
  </defs>
  <!-- Dark Background -->
  <rect width="1200" height="630" fill="#07090f"/>
  <!-- Mark (diameter 140px) -->
  <g transform="translate(146, 180) scale(0.2734375)">
    <g clip-path="url(#social-mark-circle)">
      <circle cx="256" cy="256" r="236" fill="#07090f"/>
      <circle cx="175" cy="145" r="26" fill="#4aa8ff"/>
      <circle cx="300" cy="295" r="82" fill="#ffc233"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358 L 512 512 L 0 512 Z" fill="#161d2e"/>
      <path d="M 0 360 L 65 338 L 115 365 L 175 325 L 225 345 L 275 282 L 320 312 L 365 290 L 415 346 L 465 332 L 512 358" fill="none" stroke="#2a3550" stroke-width="4"/>
      <path d="M 0 420 L 75 410 L 145 385 L 230 405 L 340 375 L 430 410 L 512 395 L 512 512 L 0 512 Z" fill="#0f1420"/>
    </g>
    <circle cx="256" cy="256" r="236" fill="none" stroke="#2a3550" stroke-width="8"/>
  </g>
  <!-- Wordmark Vector Outline (Inter SemiBold 600) -->
  <path d="${wordmarkPathData}" fill="#f2f5fb"/>
  <!-- Tagline Vector Outline (Inter Regular 400) -->
  <path d="${taglinePathData}" fill="#94a3b8"/>
</svg>
`;
}

// -------------------------------------------------------------
// ICO Binary Assembly (PNG-in-ICO)
// -------------------------------------------------------------

function buildIcoBuffer(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(count, 4); // Number of images

  let offset = 6 + count * 16;
  const entries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0);
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1);
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8); // Size of image
    entry.writeUInt32LE(offset, 12); // Offset
    entries.push(entry);
    offset += item.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.buffer)]);
}

// -------------------------------------------------------------
// Main Build Pipeline
// -------------------------------------------------------------

export async function buildLogo() {
  console.log('=== Step 1: Converting wordmark & tagline text to vector outlines ===');

  // 1. Horizontal wordmark outline
  // String: "Lunar Landing Site Navigator", size 34, weight 600, x=137, baseline y=71
  const hTextResult = textToPathData('Lunar Landing Site Navigator', {
    weight: 600,
    size: 34,
    x: 137,
    y: 71,
    align: 'left',
  });
  console.log(`Horizontal wordmark path generated: length ${hTextResult.d.length}, width ${Math.round(hTextResult.advanceWidth * 10) / 10}px`);

  // 2. Vertical wordmark lines outlines
  // Line 1: "Lunar Landing", size 28, weight 600, centered at x=180, baseline y=215
  // Line 2: "Site Navigator", size 28, weight 600, centered at x=180, baseline y=255
  const vLine1Result = textToPathData('Lunar Landing', {
    weight: 600,
    size: 28,
    x: 180,
    y: 215,
    align: 'center',
  });
  const vLine2Result = textToPathData('Site Navigator', {
    weight: 600,
    size: 28,
    x: 180,
    y: 255,
    align: 'center',
  });
  console.log(`Vertical wordmark line 1 generated: length ${vLine1Result.d.length}, width ${Math.round(vLine1Result.advanceWidth * 10) / 10}px, startX ${Math.round(vLine1Result.startX * 10) / 10}`);
  console.log(`Vertical wordmark line 2 generated: length ${vLine2Result.d.length}, width ${Math.round(vLine2Result.advanceWidth * 10) / 10}px, startX ${Math.round(vLine2Result.startX * 10) / 10}`);

  // 3. Social image wordmark and tagline outlines
  // Wordmark: size 52, weight 600, x=326, baseline y=268
  // Tagline: "Compare lunar landing sites and dates", size 26, weight 400, x=326, baseline y=332
  const socialWordmarkResult = textToPathData('Lunar Landing Site Navigator', {
    weight: 600,
    size: 52,
    x: 326,
    y: 268,
    align: 'left',
  });
  const socialTaglineResult = textToPathData('Compare lunar landing sites and dates', {
    weight: 400,
    size: 26,
    x: 326,
    y: 332,
    align: 'left',
  });
  console.log(`Social wordmark path generated: length ${socialWordmarkResult.d.length}, width ${Math.round(socialWordmarkResult.advanceWidth * 10) / 10}px`);
  console.log(`Social tagline path generated: length ${socialTaglineResult.d.length}, width ${Math.round(socialTaglineResult.advanceWidth * 10) / 10}px`);

  // Write the lockup SVG masters
  const variants = ['on-dark', 'on-light', 'mono-black', 'mono-white'];
  for (const variant of variants) {
    const hSvg = generateHorizontalMaster(variant, hTextResult.d);
    const hPath = path.join(BRAND_DIR, `logo-horizontal-${variant}.svg`);
    fs.writeFileSync(hPath, hSvg, 'utf8');

    const vSvg = generateVerticalMaster(variant, vLine1Result.d, vLine2Result.d);
    const vPath = path.join(BRAND_DIR, `logo-vertical-${variant}.svg`);
    fs.writeFileSync(vPath, vSvg, 'utf8');
  }

  // Write the social SVG master
  const socialSvg = generateSocialMaster(socialWordmarkResult.d, socialTaglineResult.d);
  const socialSvgPath = path.join(BRAND_DIR, 'social-1200x630.svg');
  fs.writeFileSync(socialSvgPath, socialSvg, 'utf8');

  console.log('Successfully wrote 8 lockup SVG masters and social-1200x630.svg');

  console.log('\n=== Step 2: Rasterising PNGs and generating ICO ===');
  const Resvg = getResvg();

  const rasterise = (svgContent, width, height) => {
    const options = {};
    if (width && height) {
      options.fitTo = { mode: 'width', value: width };
    } else if (width) {
      options.fitTo = { mode: 'width', value: width };
    } else if (height) {
      options.fitTo = { mode: 'height', value: height };
    }
    const resvg = new Resvg(svgContent, options);
    const pngData = resvg.render();
    return pngData.asPng();
  };

  const writtenFiles = [];

  // 1. Horizontal lockup PNGs: on-dark and on-light at widths 480, 960, 1920
  for (const variant of ['on-dark', 'on-light']) {
    const svgPath = path.join(BRAND_DIR, `logo-horizontal-${variant}.svg`);
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    for (const w of [480, 960, 1920]) {
      const outName = `logo-horizontal-${variant}-${w}.png`;
      const outPath = path.join(BRAND_DIR, outName);
      const pngBuffer = rasterise(svgContent, w);
      fs.writeFileSync(outPath, pngBuffer);
      writtenFiles.push({ name: outName, bytes: pngBuffer.length });
    }
  }

  // 2. Vertical lockup PNGs: on-dark and on-light at widths 480, 960, 1920
  for (const variant of ['on-dark', 'on-light']) {
    const svgPath = path.join(BRAND_DIR, `logo-vertical-${variant}.svg`);
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    for (const w of [480, 960, 1920]) {
      const outName = `logo-vertical-${variant}-${w}.png`;
      const outPath = path.join(BRAND_DIR, outName);
      const pngBuffer = rasterise(svgContent, w);
      fs.writeFileSync(outPath, pngBuffer);
      writtenFiles.push({ name: outName, bytes: pngBuffer.length });
    }
  }

  // 3. Social image PNG: 1200x630
  {
    const svgContent = fs.readFileSync(socialSvgPath, 'utf8');
    const outName = 'social-1200x630.png';
    const outPath = path.join(BRAND_DIR, outName);
    const pngBuffer = rasterise(svgContent, 1200, 630);
    fs.writeFileSync(outPath, pngBuffer);
    writtenFiles.push({ name: outName, bytes: pngBuffer.length });
  }

  // 4. Mark PNGs (64, 128, 256, 512, 1024)
  {
    const markSvgPath = path.join(BRAND_DIR, 'mark.svg');
    const markSvg = fs.readFileSync(markSvgPath, 'utf8');
    for (const s of [64, 128, 256, 512, 1024]) {
      const outName = `mark-${s}.png`;
      const outPath = path.join(BRAND_DIR, outName);
      const pngBuffer = rasterise(markSvg, s, s);
      fs.writeFileSync(outPath, pngBuffer);
      writtenFiles.push({ name: outName, bytes: pngBuffer.length });
    }
  }

  // 5. Mono marks (512)
  {
    const blackSvg = fs.readFileSync(path.join(BRAND_DIR, 'mark-mono-black.svg'), 'utf8');
    const blackBuf = rasterise(blackSvg, 512, 512);
    fs.writeFileSync(path.join(BRAND_DIR, 'mark-mono-black-512.png'), blackBuf);
    writtenFiles.push({ name: 'mark-mono-black-512.png', bytes: blackBuf.length });

    const whiteSvg = fs.readFileSync(path.join(BRAND_DIR, 'mark-mono-white.svg'), 'utf8');
    const whiteBuf = rasterise(whiteSvg, 512, 512);
    fs.writeFileSync(path.join(BRAND_DIR, 'mark-mono-white-512.png'), whiteBuf);
    writtenFiles.push({ name: 'mark-mono-white-512.png', bytes: whiteBuf.length });
  }

  // 6. App icons: badge-512, badge-1024, maskable-512
  {
    const badgeSvg = fs.readFileSync(path.join(BRAND_DIR, 'mark-badge.svg'), 'utf8');
    for (const s of [512, 1024]) {
      const outName = `badge-${s}.png`;
      const buf = rasterise(badgeSvg, s, s);
      fs.writeFileSync(path.join(BRAND_DIR, outName), buf);
      writtenFiles.push({ name: outName, bytes: buf.length });
    }

    const maskableSvg = fs.readFileSync(path.join(BRAND_DIR, 'mark-maskable.svg'), 'utf8');
    const maskableBuf = rasterise(maskableSvg, 512, 512);
    fs.writeFileSync(path.join(BRAND_DIR, 'maskable-512.png'), maskableBuf);
    writtenFiles.push({ name: 'maskable-512.png', bytes: maskableBuf.length });
  }

  // 7. Favicon PNGs and ICO in public/brand/
  {
    const markSmallSvg = fs.readFileSync(path.join(BRAND_DIR, 'mark-small.svg'), 'utf8');
    const icoPngs = [];
    for (const s of [16, 32, 48]) {
      const outName = `favicon-${s}x${s}.png`;
      const buf = rasterise(markSmallSvg, s, s);
      fs.writeFileSync(path.join(BRAND_DIR, outName), buf);
      writtenFiles.push({ name: outName, bytes: buf.length });
      icoPngs.push({ width: s, height: s, buffer: buf });
    }

    const icoBuffer = buildIcoBuffer(icoPngs);
    const icoPath = path.join(BRAND_DIR, 'favicon.ico');
    fs.writeFileSync(icoPath, icoBuffer);
    writtenFiles.push({ name: 'favicon.ico', bytes: icoBuffer.length });

    // Touch & chrome icons from badge
    const badgeSvg = fs.readFileSync(path.join(BRAND_DIR, 'mark-badge.svg'), 'utf8');
    const appleBuf = rasterise(badgeSvg, 180, 180);
    fs.writeFileSync(path.join(BRAND_DIR, 'apple-touch-icon.png'), appleBuf);
    writtenFiles.push({ name: 'apple-touch-icon.png', bytes: appleBuf.length });

    const chrome192 = rasterise(badgeSvg, 192, 192);
    fs.writeFileSync(path.join(BRAND_DIR, 'android-chrome-192x192.png'), chrome192);
    writtenFiles.push({ name: 'android-chrome-192x192.png', bytes: chrome192.length });

    const chrome512 = rasterise(badgeSvg, 512, 512);
    fs.writeFileSync(path.join(BRAND_DIR, 'android-chrome-512x512.png'), chrome512);
    writtenFiles.push({ name: 'android-chrome-512x512.png', bytes: chrome512.length });

    const mstile = rasterise(badgeSvg, 150, 150);
    fs.writeFileSync(path.join(BRAND_DIR, 'mstile-150x150.png'), mstile);
    writtenFiles.push({ name: 'mstile-150x150.png', bytes: mstile.length });
  }

  console.log(`\nGenerated ${writtenFiles.length} rasterized files in web/public/brand/:`);
  for (const f of writtenFiles) {
    console.log(` - ${f.name} (${Math.round(f.bytes / 1024)} KB)`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  buildLogo().catch((err) => {
    console.error('Build logo failed:', err);
    process.exit(1);
  });
}
