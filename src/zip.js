'use strict';

/**
 * Reval — خوانندهٔ سادهٔ ZIP (بدون هیچ وابستگی)
 * ----------------------------------------------------
 * فایل‌های ZIP ساخته‌شده با «deflate» یا «store» را می‌خواند و
 * بایت‌به‌بایت بیرون می‌دهد. برای بستهٔ به‌روزرسانی کد (چند صد کیلوبایت)
 * کافی است و روی Node داخل Electron بدون build اجرا می‌شود.
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

/** پیدا کردن امضای پایان فهرست مرکزی از انتهای فایل */
function findEOCD(buf) {
  const maxBack = Math.min(buf.length, 66000);
  for (let i = buf.length - 22; i >= buf.length - maxBack; i--) {
    if (i < 0) break;
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/** فهرست ورودی‌های آرشیو */
function listEntries(buf) {
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error('فایل ZIP معتبر نیست (پایان فهرست پیدا نشد)');
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const rawSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.push({ name, method, compSize, rawSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** خواندن محتوای یک ورودی */
function readEntry(buf, entry) {
  const p = entry.localOffset;
  if (buf.readUInt32LE(p) !== LOC_SIG) throw new Error('سرصفحهٔ محلی معتبر نیست: ' + entry.name);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const data = buf.slice(start, start + entry.compSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return zlib.inflateRawSync(data);
  throw new Error('روش فشرده‌سازی پشتیبانی نمی‌شود (' + entry.method + ') در ' + entry.name);
}

/** نام امن: از خروج از پوشه جلوگیری می‌کند */
function safeName(name) {
  const norm = String(name).replace(/\\/g, '/');
  if (norm.indexOf('..') !== -1 || norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) return null;
  return norm;
}

/** باز کردن ZIP در پوشهٔ مقصد؛ فهرست فایل‌های نوشته‌شده را برمی‌گرداند */
function extractToDir(buf, destDir, opts) {
  const filter = (opts && opts.filter) || (() => true);
  const entries = listEntries(buf);
  const written = [];
  entries.forEach((e) => {
    if (/\/$/.test(e.name)) return; // پوشه
    const rel = safeName(e.name);
    if (!rel || !filter(rel)) return;
    const out = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, readEntry(buf, e));
    written.push(rel);
  });
  return written;
}

function extractFile(zipPath, destDir, opts) {
  const buf = fs.readFileSync(zipPath);
  return extractToDir(buf, destDir, opts);
}

module.exports = { listEntries, readEntry, extractToDir, extractFile, safeName };
