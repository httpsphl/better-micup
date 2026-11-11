# Better MicUP

Mod do Micup (renderer `fluxer_renderer`) no estilo Vencord.

## Instalar / desinstalar

- **Instalar:** baixe o `BetterMicUP-Setup.zip`, extraia e dê dois cliques em `Instalar.bat`.
  Depois feche o Micup pela bandeja (Sair) e abra de novo. As opções ficam em
  **Configurações do Micup › Better MicUP**.
- **Desinstalar:** `Desinstalar.bat` em `%APPDATA%\BetterMicUP`. Devolve o Micup ao original,
  remove a inicialização com o Windows e apaga a pasta do mod.

Se o Windows avisar que o arquivo veio da internet: botão direito no zip > Propriedades >
marque **Desbloquear** antes de extrair.

## Atualizações automáticas

O guard procura uma versão nova a cada 3 horas (e 2 minutos depois de ligar o PC). Ele só
aceita versões assinadas pela chave de quem publica o mod e confere cada arquivo antes de
instalar. A versão nova vale a partir da próxima vez que o Micup for aberto; um aviso confirma.

Para desligar, crie `%APPDATA%\BetterMicUP\update-config.json` com:

```json
{ "autoUpdate": false }
```

Para procurar agora: `powershell -NoProfile -ExecutionPolicy Bypass -File "%APPDATA%\BetterMicUP\guard.ps1" -UpdateNow`
(com o guard parado).

## Arquivos (em `%APPDATA%\BetterMicUP`)

- `miccord.js` / `miccord.css`: o mod em si (injetado no `index.html` do renderer).
- `guard.ps1`: mantém o mod aplicado quando o Micup se atualiza e instala as atualizações do mod.
  Inicia no logon via `guard.vbs` (chave `HKCU\...\Run\BetterMicUPGuard`). Log em `guard.log`.
- `backup-auto\`: as últimas versões substituídas por atualizações automáticas.

O guard nunca mexe no `modules\state.json` do Micup; assim o rollback automático do Micup
continua funcionando se uma atualização do Micup der problema.

## Diagnóstico do compartilhamento de tela

Em Configurações › Desenvolvedor, ou com o Micup aberto em F12 > Console:

```js
Miccord.screenShareEvents
```

Mostra os últimos eventos: `capture-started`, `capture-ended-by-source` (o Windows encerrou a
captura: janela fechada/minimizada), `encoder-stall-reported` / `encoder-stall-false-alarm` /
`encoder-stall-confirmed` (checagem do encoder do Micup).
