// Publica uma versão nova do Better MicUP no GitHub. Quem tem o mod instalado recebe sozinho.
//
//   node scripts/release.mjs --notes "o que mudou"
//   node scripts/release.mjs --dry-run            (só monta dist/, não publica)
//   node scripts/release.mjs --dry-run --base-url http://127.0.0.1:8765/v1.0.2/   (testes locais)
//
// Antes: suba a VERSION em src/miccord.js e faça commit.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { root, keyPath, readVersion, readRepo, readEmbeddedPublicKeyXml, publicKeyXml, writeZip } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = flag("--dry-run");
const notes = option("--notes") || "";

// (with stdio: "inherit" execFileSync returns null)
const run = (cmd, cmdArgs, opts = {}) =>
  (execFileSync(cmd, cmdArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }) ?? "").trim();

function fail(msg) {
  console.error(`\nERRO: ${msg}`);
  process.exit(1);
}

const version = readVersion();
const tag = `v${version}`;
const repo = readRepo();

// 1. The key must match the public key that installed guards trust.
if (!fs.existsSync(keyPath)) fail(`chave de assinatura não encontrada em ${keyPath}. Rode: node scripts/keygen.mjs`);
const privateKey = createPrivateKey(fs.readFileSync(keyPath));
if (publicKeyXml(privateKey) !== readEmbeddedPublicKeyXml()) {
  fail("a chave pública em src/guard.ps1 não corresponde à sua chave privada. Rode: node scripts/keygen.mjs");
}

// 2. Publishing checks.
if (!dryRun) {
  if (run("git", ["status", "--porcelain"])) fail("há mudanças sem commit. Faça commit antes de publicar.");
  let exists = true;
  try {
    run("gh", ["release", "view", tag, "--repo", repo]);
  } catch {
    exists = false;
  }
  if (exists) fail(`a release ${tag} já existe. Suba a VERSION em src/miccord.js.`);
}

// 3. Assemble the release files.
const out = path.join(root, "dist", tag);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const shipped = [
  ["src/miccord.js", "miccord.js"],
  ["src/miccord.css", "miccord.css"],
  ["src/guard.ps1", "guard.ps1"],
  ["src/guard.vbs", "guard.vbs"],
  ["src/README.md", "README.md"],
  ["installer/install.ps1", "setup.ps1"],
];
const baseUrl = option("--base-url") || `https://github.com/${repo}/releases/download/${tag}/`;
const files = shipped.map(([from, name]) => {
  const data = fs.readFileSync(path.join(root, from));
  fs.writeFileSync(path.join(out, name), data);
  return { path: name, size: data.length, sha256: createHash("sha256").update(data).digest("hex"), url: baseUrl + name };
});

const manifest = { name: "better-micup", version, published: new Date().toISOString(), notes, files };
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8");
const signature = sign("sha256", manifestBytes, privateKey);
if (!verify("sha256", manifestBytes, createPublicKey(privateKey), signature)) fail("falha ao verificar a própria assinatura");
fs.writeFileSync(path.join(out, "manifest.json"), manifestBytes);
fs.writeFileSync(path.join(out, "manifest.sig"), signature.toString("base64") + "\n");

// 4. First-time installer for new users (always the same asset name, so the
//    ".../releases/latest/download/BetterMicUP-Setup.zip" link never changes).
const setupDir = `BetterMicUP-Setup-${version}`;
const read = (p) => fs.readFileSync(path.join(root, p));
writeZip(path.join(out, "BetterMicUP-Setup.zip"), [
  { name: `${setupDir}/Instalar.bat`, data: read("installer/Instalar.bat") },
  { name: `${setupDir}/Desinstalar.bat`, data: read("installer/Desinstalar.bat") },
  { name: `${setupDir}/install.ps1`, data: read("installer/install.ps1") },
  ...["miccord.js", "miccord.css", "guard.ps1", "guard.vbs", "README.md"].map((n) => ({
    name: `${setupDir}/files/${n}`,
    data: read(`src/${n}`),
  })),
]);

console.log(`Release ${tag} montada em ${out}`);
if (dryRun) {
  console.log("(--dry-run: nada foi publicado)");
  process.exit(0);
}

// 5. Publish.
const assets = [...files.map((f) => f.path), "manifest.json", "manifest.sig", "BetterMicUP-Setup.zip"].map((n) =>
  path.join(out, n)
);
run("git", ["push", "origin", "HEAD"], { stdio: "inherit" });
const head = run("git", ["rev-parse", "HEAD"]);
run(
  "gh",
  ["release", "create", tag, ...assets, "--repo", repo, "--target", head, "--title", `Better MicUP ${tag}`, "--notes", notes || `Better MicUP ${tag}`, "--latest"],
  { stdio: "inherit" }
);
console.log(`\nPublicado: https://github.com/${repo}/releases/tag/${tag}`);
console.log("Quem já instalou recebe sozinho em até ~3h (e vê o mod novo ao reabrir o Micup).");
console.log(`Link do instalador para amigos novos: https://github.com/${repo}/releases/latest/download/BetterMicUP-Setup.zip`);
