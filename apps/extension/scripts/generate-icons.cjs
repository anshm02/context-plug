#!/usr/bin/env node

/**
 * Generate placeholder PNG icons for the extension
 * Creates simple colored squares as placeholders
 */

const fs = require("fs");
const path = require("path");

// Simple PNG encoder (creates a solid color PNG)
function createPNG(size, r, g, b) {
  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const width = size;
  const height = size;
  const bitDepth = 8;
  const colorType = 2; // RGB
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(bitDepth, 8);
  ihdrData.writeUInt8(colorType, 9);
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdr = createChunk("IHDR", ihdrData);

  // IDAT chunk (image data)
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      // Create a simple gradient with a border
      const isBorder = x < 2 || x >= width - 2 || y < 2 || y >= height - 2;
      const isInner =
        x >= 4 && x < width - 4 && y >= 4 && y < height - 4;

      if (isBorder) {
        rawData.push(0, 255, 135); // Green border
      } else if (isInner) {
        rawData.push(r, g, b); // Main color
      } else {
        rawData.push(20, 20, 22); // Dark background
      }
    }
  }

  const deflated = deflateSync(Buffer.from(rawData));
  const idat = createChunk("IDAT", deflated);

  // IEND chunk
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// Simple CRC32 implementation
function crc32(buffer) {
  let crc = 0xffffffff;
  const table = [];

  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }

  for (let i = 0; i < buffer.length; i++) {
    crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

// Simple deflate using zlib
const { deflateSync } = require("zlib");

// Generate icons
const iconsDir = path.join(__dirname, "..", "icons");

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [16, 48, 128];

sizes.forEach((size) => {
  const png = createPNG(size, 15, 15, 17); // Dark background with green border
  const filename = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Created ${filename}`);
});

console.log("Icons generated successfully!");

