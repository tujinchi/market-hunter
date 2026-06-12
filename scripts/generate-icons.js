// =============================================
// 市场猎手 — PNG 图标生成器 (pure Node.js, 0依赖)
// 用法: node scripts/generate-icons.js
// =============================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICONS_DIR = path.resolve(__dirname, '..', 'public', 'icons');
const SIZES = [72, 96, 128, 144, 152, 180, 192, 384, 512];
const MASKABLE_SIZES = [192, 512];

// 颜色
const BG = { r: 8, g: 12, b: 20 };       // #080c14
const ACCENT1 = { r: 59, g: 130, b: 246 }; // #3b82f6
const ACCENT2 = { r: 139, g: 92, b: 246 }; // #8b5cf6
const GOLD = { r: 251, g: 191, b: 36 };    // #fbbf24
const WHITE = { r: 255, g: 255, b: 255 };

// =============================================
// PNG 编码
// =============================================
function createPNG(width, height, pixels) {
  // 8-byte PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT: raw pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOff = y * (1 + width * 4);
    rawData[rowOff] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const pixelOff = rowOff + 1 + x * 4;
      const idx = (y * width + x) * 4;
      rawData[pixelOff] = pixels[idx];       // R
      rawData[pixelOff + 1] = pixels[idx + 1]; // G
      rawData[pixelOff + 2] = pixels[idx + 2]; // B
      rawData[pixelOff + 3] = pixels[idx + 3]; // A
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([len, typeB, data, crc]);
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// =============================================
// 像素绘制
// =============================================
function createPixels(width, height, drawFn) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const c = drawFn(x / width, y / height, x, y, width, height);
      pixels[idx] = c.r;
      pixels[idx + 1] = c.g;
      pixels[idx + 2] = c.b;
      pixels[idx + 3] = c.a !== undefined ? c.a : 255;
    }
  }
  return pixels;
}

function lerpColor(c1, c2, t) {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
    a: 255
  };
}

// =============================================
// 图标绘制函数
// =============================================
function drawAppIcon(rx, ry, x, y, w, h) {
  // Rounded rect corners (skip corners for simplicity, keep as rect)
  // Actually let's do rounded corners
  const margin = w * 0.06;
  const radius = w * 0.1875;

  // Corners: transparent
  const cx = w / 2, cy = h / 2;
  const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
  const cornerX = w / 2 - radius;
  const cornerY = h / 2 - radius;

  if (dx > cornerX && dy > cornerY) {
    const dist = Math.sqrt((dx - cornerX) ** 2 + (dy - cornerY) ** 2);
    if (dist > radius) return { r: 0, g: 0, b: 0, a: 0 }; // transparent
  }

  // Outside the margin area
  if (x < margin || x > w - margin || y < margin || y > h - margin) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // Background gradient
  const t = (rx + ry) / 2;
  return lerpColor(BG, { r: 15, g: 21, b: 40 }, t);

  // Note: This is a simplified icon. For the real app icon,
  // use the SVG → PNG conversion in generate-icons.html (browser tool)
}

function drawSimpleIcon(rx, ry, x, y, w, h) {
  const cx = w / 2, cy = h / 2;
  const margin = w * 0.07;
  const radius = w * 0.18;

  // Rounded corners
  const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
  const cornerX = w / 2 - radius;
  const cornerY = h / 2 - radius;

  if (dx > cornerX && dy > cornerY) {
    const dist = Math.sqrt((dx - cornerX) ** 2 + (dy - cornerY) ** 2);
    if (dist > radius) return { r: 0, g: 0, b: 0, a: 0 };
  }
  if (x < margin || x > w - margin || y < margin || y > h - margin) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // Gradient background
  const t = rx;
  const bg = lerpColor(BG, { r: 15, g: 21, b: 40 }, t);

  // Accent strip at top (simplified eagle representation)
  const relY = (y - margin) / (h - 2 * margin);
  if (relY < 0.25) return lerpColor(ACCENT1, ACCENT2, rx);

  // Gold dot (simplified) at center
  const relX = (x - margin) / (w - 2 * margin);
  const relCX = 0.5, relCY = 0.35;
  const dotDist = Math.sqrt((relX - relCX) ** 2 + (relY - relCY) ** 2);
  if (dotDist < 0.08) return GOLD;

  // Text area (bottom)
  if (relY > 0.75 && w >= 128) {
    // Left wing accent
    if (relX < 0.35 && relY < 0.85) return lerpColor(ACCENT1, ACCENT2, relX * 2);
    if (relX > 0.65 && relY < 0.85) return lerpColor(ACCENT1, ACCENT2, (relX - 0.65) * 2);
  }

  return bg;
}

function drawMaskable(rx, ry, x, y, w, h) {
  // Maskable: safe zone is inner 80%
  const safeMargin = w * 0.1;
  if (x < safeMargin || x > w - safeMargin || y < safeMargin || y > h - safeMargin * 1.3) {
    // Padding zone: background color only
    return BG;
  }
  return drawSimpleIcon(rx, ry, x, y, w, h);
}

// =============================================
// 生成并保存
// =============================================
console.log('🦅 市场猎手 — PNG 图标生成器');
console.log('  输出目录:', ICONS_DIR);
console.log('');

fs.mkdirSync(ICONS_DIR, { recursive: true });

for (const size of SIZES) {
  let name = `icon-${size}.png`;
  let fn = drawSimpleIcon;

  if (MASKABLE_SIZES.includes(size)) {
    name = `icon-maskable-${size}.png`;
    fn = drawMaskable;
  }

  const pixels = createPixels(size, size, fn);
  const png = createPNG(size, size, pixels);
  const outPath = path.join(ICONS_DIR, name);
  fs.writeFileSync(outPath, png);
  console.log(`  ✅ ${name} (${size}×${size})`);

  // Also save regular version for maskable sizes
  if (MASKABLE_SIZES.includes(size)) {
    const regName = `icon-${size}.png`;
    const regPixels = createPixels(size, size, drawSimpleIcon);
    const regPng = createPNG(size, size, regPixels);
    fs.writeFileSync(path.join(ICONS_DIR, regName), regPng);
    console.log(`  ✅ ${regName} (${size}×${size}) [regular]`);
  }
}

// Generate apple-touch-icon (180×180)
const applePixels = createPixels(180, 180, drawSimpleIcon);
fs.writeFileSync(path.join(ICONS_DIR, 'icon-180.png'), createPNG(180, 180, applePixels));
console.log(`  ✅ icon-180.png (180×180) [apple]`);

console.log('');
console.log('🎉 全部图标生成完成！');
console.log('');
console.log('💡 提示：');
console.log('   如需高质量图标，请在浏览器中打开 scripts/generate-icons.html');
console.log('   然后右键保存生成的 SVG→PNG 图标覆盖 public/icons/ 目录');
