// Shared helpers for keygen.mjs and release.mjs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createPublicKey } from "node:crypto";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const guardPath = path.join(root, "src", "guard.ps1");

// The private key never goes into the repository. Back it up: without it you cannot
// publish updates that already-installed copies will accept.
export const keyDir = path.join(os.homedir(), ".better-micup");
const defaultKeyPath = path.join(keyDir, "release-key.pem");

// BETTERMICUP_KEY wins; otherwise release-key.pem, or the only .pem in ~/.better-micup
// (so a renamed backup copy still works).
function findKeyPath() {
  if (process.env.BETTERMICUP_KEY) return process.env.BETTERMICUP_KEY;
  if (fs.existsSync(defaultKeyPath)) return defaultKeyPath;
  try {
    const pems = fs.readdirSync(keyDir).filter((f) => f.toLowerCase().endsWith(".pem"));
    if (pems.length === 1) return path.join(keyDir, pems[0]);
  } catch {}
  return defaultKeyPath;
}
export const keyPath = findKeyPath();

export function readVersion() {
  const js = fs.readFileSync(path.join(root, "src", "miccord.js"), "utf8");
  const m = js.match(/const VERSION = "(\d+\.\d+\.\d+)"/);
  if (!m) throw new Error("const VERSION = \"x.y.z\" não encontrado em src/miccord.js");
  return m[1];
}

export function readRepo() {
  const ps = fs.readFileSync(guardPath, "utf8");
  const m = ps.match(/^\$UpdateRepo = "([\w.-]+\/[\w.-]+)"/m);
  if (!m) throw new Error("$UpdateRepo não encontrado em src/guard.ps1");
  return m[1];
}

const PUBKEY_LINE = /^\$UpdatePublicKeyXml = '[^'\r\n]*'/m;

export function readEmbeddedPublicKeyXml() {
  const m = fs.readFileSync(guardPath, "utf8").match(/^\$UpdatePublicKeyXml = '([^'\r\n]*)'/m);
  return m ? m[1] : "";
}

export function writeEmbeddedPublicKeyXml(xml) {
  const ps = fs.readFileSync(guardPath, "utf8");
  if (!PUBKEY_LINE.test(ps)) throw new Error("linha $UpdatePublicKeyXml não encontrada em src/guard.ps1");
  fs.writeFileSync(guardPath, ps.replace(PUBKEY_LINE, `$UpdatePublicKeyXml = '${xml}'`));
}

// .NET Framework's RSACryptoServiceProvider.FromXmlString format.
export function publicKeyXml(keyPem) {
  const jwk = createPublicKey(keyPem).export({ format: "jwk" });
  const b64 = (s) => Buffer.from(s, "base64url").toString("base64");
  return `<RSAKeyValue><Modulus>${b64(jwk.n)}</Modulus><Exponent>${b64(jwk.e)}</Exponent></RSAKeyValue>`;
}

// Minimal zip writer (deflate, UTF-8 names, forward slashes).
export function writeZip(zipPath, entries /* [{ name, data: Buffer }] */) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name.replace(/\\/g, "/"), "utf8");
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(zipPath, Buffer.concat([...chunks, cdBuf, end]));
}
