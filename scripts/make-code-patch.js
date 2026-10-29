#!/usr/bin/env node
'use strict';

/**
 * ساخت بستهٔ به‌روزرسانی کوچک (وصلهٔ کد)
 * ------------------------------------------------------------------
 * فقط «کدِ برنامه» را در یک ZIP می‌گذارد: src/**  و package.json
 * (بدون موتور Electron، بدون آیکن‌ها، بدون نصب‌کننده).
 * نتیجه: به‌جای ~۷۶ مگابایت، چند صد کیلوبایت.
 *
 * خروجی در dist/:
 *   reval-code-<version>.zip
 *   reval-code-<version>.zip.sha256
 *
 * اجرا:  node scripts/make-code-patch.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/* ---------- یک نویسندهٔ سادهٔ ZIP (deflate) ---------- */
function dosTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const now = new Date();
  const { time, date } = dosTime(now);

  files.forEach((f) => {
    const nameBuf = Buffer.from(f.name.replace(/\\/g, '/'), 'utf8');
    const raw = f.data;
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  });

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([Buffer.concat(locals), centralBuf, eocd]);
}

/* ---------- جمع‌آوری فایل‌ها ---------- */
function walk(dir, base) {
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    const full = path.join(dir, ent.name);
    const rel = base ? base + '/' + ent.name : ent.name;
    if (ent.isDirectory()) out.push(...walk(full, rel));
    else if (ent.isFile()) out.push({ name: rel, data: fs.readFileSync(full), full });
  });
  return out;
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = String(pkg.version);
  const electron = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version; }
    catch (_) { return null; }
  })();

  const srcFiles = walk(path.join(ROOT, 'src'), 'src');
  /* فایل‌های سنگین/غیرکد را کنار بگذار */
  const skip = /(^|\/)(node_modules|\.git)\//;
  const keep = srcFiles.filter((f) => !skip.test(f.name));

  const manifest = {
    kind: 'reval-code-patch',
    version,
    electron,
    createdAt: new Date().toISOString(),
    files: keep.length,
  };

  const files = keep.map((f) => ({ name: f.name, data: f.data }));
  files.push({ name: 'package.json', data: Buffer.from(JSON.stringify(pkg, null, 2), 'utf8') });
  files.push({ name: 'patch-manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') });

  const zip = makeZip(files);
  fs.mkdirSync(DIST, { recursive: true });
  const zipPath = path.join(DIST, 'reval-code-' + version + '.zip');
  fs.writeFileSync(zipPath, zip);
  const sha = crypto.createHash('sha256').update(zip).digest('hex');
  fs.writeFileSync(zipPath + '.sha256', sha + '  reval-code-' + version + '.zip\n', 'utf8');

  const kb = Math.round(zip.length / 1024);
  console.log('✅ وصلهٔ کد ساخته شد:');
  console.log('   ' + zipPath);
  console.log('   حجم: ' + kb + ' کیلوبایت (' + (kb / 1024).toFixed(2) + ' مگابایت) · ' + files.length + ' فایل');
  console.log('   sha256: ' + sha);
  console.log('   نسخه: ' + version + ' · electron: ' + (electron || 'نامشخص'));
}

if (require.main === module) main();
module.exports = { makeZip, walk };
