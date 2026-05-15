const crypto = require('crypto');
const ALGO = 'aes-256-gcm';

let keyHex = process.env.FIELD_ENC_KEY;
if (!keyHex) {
  console.warn('[crypto] FIELD_ENC_KEY not set. Generating ephemeral key (DO NOT USE IN PROD).');
  keyHex = crypto.randomBytes(32).toString('hex');
}
let KEY = Buffer.from(keyHex, 'hex');
if (KEY.length !== 32) {
  console.warn('[crypto] FIELD_ENC_KEY invalid length. Falling back to zeroed key (WEAK).');
  KEY = Buffer.alloc(32, 0);
}

function encryptField(plaintext) {
  if (plaintext == null) return null;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (e) {
    console.warn('[crypto] encrypt fallback (returning plaintext) due to error:', e.message);
    return `plain:${Buffer.from(String(plaintext), 'utf8').toString('hex')}`;
  }
}

function decryptField(stored) {
  if (!stored) return null;
  try {
    if (stored.startsWith('plain:')) {
      return Buffer.from(stored.slice(6), 'hex').toString('utf8');
    }
    const [ivHex, tagHex, encryptedHex] = stored.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    console.warn('[crypto] decrypt fallback (returning stored) due to error:', e.message);
    return stored;
  }
}

module.exports = { encryptField, decryptField };
