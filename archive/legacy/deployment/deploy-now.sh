const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.resolve(__dirname, '../data');

function keyFromEnv() {
  const raw = (process.env.DATA_KEY || process.env.ENCRYPTION_KEY || '').trim();
  if (!raw) return null;
  // base64
  try {
    const b64 = Buffer.from(raw, 'base64');
    if ([16, 24, 32].includes(b64.length)) {
      return b64.length === 32 ? b64 : Buffer.concat([b64, Buffer.alloc(32 - b64.length)]);
    }
  } catch {}
  // hex
  try {
    const hx = raw.replace(/[^0-9a-f]/gi, '');
    if (hx && hx.length % 2 === 0) {
      const buf = Buffer.from(hx, 'hex');
      if ([16, 24, 32].includes(buf.length)) {
        return buf.length === 32 ? buf : Buffer.concat([buf, Buffer.alloc(32 - buf.length)]);
      }
    }
  } catch {}
  // derive from passphrase
  return crypto.createHash('sha256').update(raw).digest();
}

const KEY = keyFromEnv();

// In production, a 32-byte key is required
if (process.env.NODE_ENV !== 'development') {
  if (!KEY || KEY.length !== 32) {
    console.error('[store] DATA_KEY missing or invalid. Provide a 32‑byte key via DATA_KEY (base64 or hex).');
    process.exit(1);
  }
}

function encryptJson(obj) {
  if (!KEY) return Buffer.from(JSON.stringify(obj, null, 2));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = { v: 1, alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: tag.toString('base64'), ct: ct.toString('base64') };
  return Buffer.from(JSON.stringify(payload));
}

function tryDecrypt(buf) {
  try {
    const text = buf.toString('utf8').trim();
    const parsed = JSON.parse(text);
    if (parsed && parsed.ct && parsed.iv && parsed.tag && parsed.alg === 'aes-256-gcm') {
      if (!KEY) throw new Error('DATA_KEY required to decrypt');
      const iv = Buffer.from(parsed.iv, 'base64');
      const tag = Buffer.from(parsed.tag, 'base64');
      const ct = Buffer.from(parsed.ct, 'base64');
      const dec = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
      dec.setAuthTag(tag);
      const pt = Buffer.concat([dec.update(ct), dec.final()]).toString('utf8');
      return JSON.parse(pt);
    }
    return JSON.parse(text);
  } catch (e) {
    try { return JSON.parse(buf.toString('utf8')); } catch { return {}; }
  }
}

function readJson(file) {
  try {
    const p = path.join(dataDir, file);
    const buf = fs.readFileSync(p);
    return tryDecrypt(buf);
  } catch {
    try {
      const p2 = path.join(dataDir, file + '.json');
      const buf2 = fs.readFileSync(p2);
      return tryDecrypt(buf2);
    } catch {
      return file.endsWith('.json') ? [] : {};
    }
  }
}

function writeJson(file, data) {
  const p = path.join(dataDir, file);
  fs.writeFileSync(p, encryptJson(data));
}

module.exports = { readJson, writeJson };