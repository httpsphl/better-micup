# Desenvolvimento do Better MicUP

Como testar, publicar versões e cuidar da chave de assinatura. O README para quem usa o mod está em [README.md](README.md); o que vai junto com a instalação está em [src/README.md](src/README.md).

```
src/         arquivos que vão para %APPDATA%\BetterMicUP (mod, guard, README do usuário)
installer/   Instalar.bat / Desinstalar.bat / install.ps1
scripts/     keygen.mjs (chave de assinatura) e release.mjs (publicar versão)
dist/        saída do release.mjs (não vai para o git)
```

## Testar no seu PC sem publicar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File installer\install.ps1 -PayloadDir src
```

Instala direto de `src/` em `%APPDATA%\BetterMicUP` e reaplica no Micup. Depois feche o Micup
pela bandeja e abra de novo.

## Publicar uma versão (todo mundo recebe sozinho)

1. Suba `const VERSION` em `src/miccord.js` (ex.: `1.0.2` → `1.0.3`).
2. `git commit -am "..."`
3. `node scripts/release.mjs --notes "o que mudou"`

O script monta os arquivos, gera `manifest.json` com o sha256 de cada um, assina com a sua
chave, faz `git push` e cria a release no GitHub. Os guards instalados conferem a cada 3 horas,
validam a assinatura e os hashes e se atualizam. Use `--dry-run` para só montar `dist/`.

Link fixo do instalador para quem ainda não tem:
https://github.com/httpsphl/better-micup/releases/latest/download/BetterMicUP-Setup.zip

## A chave de assinatura

`node scripts/keygen.mjs` criou `%USERPROFILE%\.better-micup\release-key.pem` e gravou a chave
pública em `src/guard.ps1`. **Ela não vai para o git. Faça backup.** Sem ela não dá para
publicar atualizações que as instalações existentes aceitem; seria preciso mandar um
instalador novo para todo mundo. Se ela vazar, alguém pode publicar código no PC dos seus
amigos através do guard.
