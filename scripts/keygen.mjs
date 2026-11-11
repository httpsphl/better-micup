// Gera (uma única vez) a chave que assina as releases e grava a chave pública em src/guard.ps1.
//   node scripts/keygen.mjs
// Se a chave já existir, só regrava a chave pública no guard.
import fs from "node:fs";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { keyPath, publicKeyXml, readEmbeddedPublicKeyXml, writeEmbeddedPublicKeyXml } from "./lib.mjs";

if (fs.existsSync(keyPath)) {
  console.log(`Usando a chave existente: ${keyPath}`);
} else if (readEmbeddedPublicKeyXml().includes("<Modulus>") && !process.argv.includes("--replace-key")) {
  // A key is already in use: the guards out there only accept releases signed with it.
  console.error(`ERRO: não achei a chave privada (${keyPath}), mas src/guard.ps1 já tem uma chave pública.`);
  console.error("Gerar outra faria todas as instalações existentes recusarem as próximas atualizações.");
  console.error("Ache o arquivo .pem (backup, outro nome) e use BETTERMICUP_KEY=caminho para apontar para ele.");
  console.error("Só se a chave antiga foi perdida de vez: node scripts/keygen.mjs --replace-key");
  console.error("(aí todos precisarão reinstalar com o instalador novo).");
  process.exit(1);
} else {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072, publicExponent: 0x10001 });
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log(`Chave nova criada: ${keyPath}`);
  console.log("FAÇA BACKUP desse arquivo (fora do repositório). Sem ele você não consegue mais");
  console.log("publicar atualizações que as instalações existentes aceitem.");
}

const xml = publicKeyXml(fs.readFileSync(keyPath));
if (readEmbeddedPublicKeyXml() === xml) {
  console.log("src/guard.ps1 já tem essa chave pública.");
} else {
  writeEmbeddedPublicKeyXml(xml);
  console.log("Chave pública gravada em src/guard.ps1.");
}
