# Better MicUP

A client mod for the [Micup](https://micup.gg) desktop app, in the spirit of Vencord.

Plugins, themes and a few fixes for the desktop app, configured from a **Better MicUP**
section inside Micup's own settings. It keeps itself applied when Micup updates and updates
itself when a new version is released.

## Features

- Settings integrated into **Micup › Settings › Better MicUP** (plugins, themes, QuickCSS, logs)
- **Plugins**
  - **ScreenShare Plus Bypass**: higher resolution, frame rate and bitrate for screen sharing
  - **MessageLogger**: keeps deleted and edited messages visible
  - **NoTrack**: turns off in-app reports and telemetry
  - **CallTimer**: shows how long you have been in a call
  - **Experiments**: developer options and hidden settings tabs
  - **AlwaysTrustDomains & CleanURLs**: no external-link prompt, strips tracking parameters
  - **DevTools**: F12 / Ctrl+Shift+I
  - **Volume Booster**: per-user volume above 100%
  - **Fake Plus**: emojis and stickers from any server
- **Themes**: built-in presets plus a live QuickCSS editor
- **Stays applied**: a small background watcher re-applies the mod after every Micup update,
  without touching Micup's own update and rollback state
- **Signed auto-updates**: new versions install by themselves; only releases signed with the
  project's key are accepted

## Installing

1. Download **[BetterMicUP-Setup.zip](https://github.com/httpsphl/better-micup/releases/latest/download/BetterMicUP-Setup.zip)**
   (Windows, Micup desktop app).
2. Extract it and double-click `Instalar.bat`.
3. Quit Micup from the tray icon (right click › Sair/Quit) and open it again.

If Windows says the file came from the internet: right click the zip › Properties › tick
**Unblock** before extracting.

## Uninstalling

Run `Desinstalar.bat` from `%APPDATA%\BetterMicUP`. It puts Micup's original files back,
removes the startup entry and deletes the mod's folder.

## Updates

The watcher checks for a new release every 3 hours. Updates take effect the next time Micup
is opened. To turn automatic updates off, create `%APPDATA%\BetterMicUP\update-config.json`
containing `{ "autoUpdate": false }`.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) (in Portuguese).

## Disclaimer

Micup is trademark of Micup Inc. and solely mentioned for the sake of descriptivity. Mention
of it does not imply any affiliation with or endorsement by Micup Inc.

<details>
<summary>Using Better Micup violates Micup terms of service</summary>

Client modifications are against Micup's Terms of Service. Some plugins (for example Fake Plus
and ScreenShare Plus Bypass) unlock features Micup sells, which makes the violation more
visible. Micup could disable accounts that use it.

If your account matters to you, don't use client mods. Use Better MicUP at your own risk, and
avoid posting screenshots that show it in places where that could get you reported.
</details>
