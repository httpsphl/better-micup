/**
 * ============================================================================
 * Miccord v1.0.0 — Vencord-Equivalent Client Modification for Micup Desktop
 * ============================================================================
 * Injected via fluxer_renderer before the Rspack runtime initializes.
 * Provides:
 *   - Full Rspack Module Hook, Patcher & Search Engine (Miccord.Webpack / Patcher)
 *   - Native User Settings Sidebar Integration (5 Miccord Tabs) + Ctrl+Shift+M Modal
 *   - 7 Essential Built-in Plugins (ScreenShare Plus Bypass, MessageLogger, NoTrack, etc.)
 *   - Live QuickCSS Editor & 6 Built-in Preset Themes
 * ============================================================================
 */

(function initMiccord() {
  if (window.__MICCORD_INITIALIZED__) return;
  window.__MICCORD_INITIALIZED__ = true;

  const VERSION = "1.0.2";
  const STORAGE_KEY = "miccord_settings_v1";
  const MSGLOG_KEY = "miccord_message_logs_v1";
  const SS_EVENTS_KEY = "miccord_screenshare_events_v1";

  const Logger = {
    info: (...args) => console.info("[Miccord]", ...args),
    warn: (...args) => console.warn("[Miccord]", ...args),
    error: (...args) => console.error("[Miccord]", ...args),
  };

  // Screen-share diagnostics: why did the last streams stop? Read with `Miccord.screenShareEvents`.
  function recordScreenShareEvent(type, data = {}) {
    const entry = {
      type,
      at: new Date().toISOString(),
      visibility: document.visibilityState,
      focused: typeof document.hasFocus === "function" ? document.hasFocus() : null,
      ...data,
    };
    Logger.info("ScreenShare:", type, entry);
    try {
      const list = JSON.parse(localStorage.getItem(SS_EVENTS_KEY) || "[]");
      list.unshift(entry);
      localStorage.setItem(SS_EVENTS_KEY, JSON.stringify(list.slice(0, 40)));
    } catch {}
  }

  function readScreenShareEvents() {
    try {
      return JSON.parse(localStorage.getItem(SS_EVENTS_KEY) || "[]");
    } catch {
      return [];
    }
  }

  // ==========================================================================
  // 1. Persistent Configuration & State Management
  // ==========================================================================
  const DEFAULT_SETTINGS = {
    activeTheme: "obsidian",
    quickCssEnabled: true,
    quickCss: `/* Better MicUP QuickCSS — Mac Obsidian Style */\n`,
    customCssUrls: [],
    showFloatingPill: false,
    plugins: {
      ScreenShareBypass: {
        enabled: true,
        forceResolution: "picker",
        forceFps: "picker",
        maxBitrateKbps: "12000",
        disableEncoderThrottling: true,
        unlockCamera1080p: true,
      },
      MessageLogger: {
        enabled: true,
        keepDeletedInChat: true,
        showInlineEdits: true,
        ignoreBots: false,
        ignoreSelf: false,
        maxLogs: 250,
      },
      NoTrack: {
        enabled: true,
      },
      CallTimer: {
        enabled: true,
      },
      ExperimentsAndHiddenTabs: {
        enabled: true,
      },
      AlwaysTrustDomains: {
        enabled: true,
        cleanTrackingParams: true,
      },
      DevToolsShortcut: {
        enabled: true,
      },
      VolumeBooster: {
        enabled: true,
        maxMultiplier: "200",
      },
      FakePlus: {
        enabled: true,
        convertExternalToLinks: true,
      },
    },
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_SETTINGS);
      const parsed = JSON.parse(raw);
      const merged = {
        ...structuredClone(DEFAULT_SETTINGS),
        ...parsed,
        plugins: { ...structuredClone(DEFAULT_SETTINGS.plugins) },
      };
      if (parsed.plugins) {
        for (const [k, v] of Object.entries(parsed.plugins)) {
          if (merged.plugins[k]) {
            merged.plugins[k] = { ...merged.plugins[k], ...v };
          }
        }
      }
      for (const k of Object.keys(DEFAULT_SETTINGS.plugins)) {
        if (!merged.plugins[k]) {
          merged.plugins[k] = { ...DEFAULT_SETTINGS.plugins[k] };
        }
      }
      return merged;
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  function loadMessageLogs() {
    try {
      const raw = localStorage.getItem(MSGLOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  const state = {
    settings: loadSettings(),
    messageLogs: loadMessageLogs(), // Array of { id, type: 'deleted'|'edited', channelId, guildId, author, content, oldContent, timestamp, attachments }
    uiListeners: new Set(),
    modalOpen: false,
    modalTab: "miccord_dashboard",
    callStartTime: null,
    currentVoiceChannelId: null,
    lightboxUrl: null,
  };

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
    } catch (e) {
      console.warn("[Miccord] Falha ao salvar configurações:", e);
    }
    applyThemesAndQuickCSS();
    notifyUI();
  }

  function saveMessageLogs() {
    try {
      const max = state.settings.plugins.MessageLogger?.maxLogs || 250;
      if (state.messageLogs.length > max) {
        state.messageLogs = state.messageLogs.slice(0, max);
      }
      localStorage.setItem(MSGLOG_KEY, JSON.stringify(state.messageLogs));
    } catch {}
    notifyUI();
  }

  function notifyUI() {
    for (const fn of state.uiListeners) {
      try {
        fn();
      } catch {}
    }
    updateFloatingWidget();
  }

  // ==========================================================================
  // 2. Modern Minimalist Vector Icon System (Black Obsidian — No Colorful Emojis)
  // ==========================================================================
  const ICONS_PATH = {
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />',
    terminal: '<polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />',
    refresh: '<path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />',
    package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />',
    palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"/>',
    trash: '<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
    search: '<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />',
    mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />',
    micOff: '<line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />',
    headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />',
    volumeX: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />',
    eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />',
    pin: '<line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9a2 2 0 0 1-1.11-1.79V4h1a1 1 0 0 0 0-2H9a1 1 0 0 0 0 2h1v6.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />',
    rotateCcw: '<path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />',
    code: '<polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" />',
    play: '<polygon points="5 3 19 12 5 21 5 3" />',
    settings: '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />',
    x: '<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />',
    clock: '<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />',
    externalLink: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />',
    paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />',
    sliders: '<line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" />',
    check: '<polyline points="20 6 9 17 4 12" />',
    volume2: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />',
    smile: '<circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" stroke-width="3" stroke-linecap="round" /><line x1="15" y1="9" x2="15.01" y2="9" stroke-width="3" stroke-linecap="round" />',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" /><path d="M19 4v4" /><path d="M21 6h-4" /><path d="M5 18v2" /><path d="M6 19H4" />',
  };

  function svgIconReact(name, size = 16, style = {}) {
    const React = getReact();
    if (!React) return null;
    const inner = ICONS_PATH[name] || "";
    return React.createElement("svg", {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { display: "inline-block", verticalAlign: "-2px", flexShrink: 0, ...style },
      dangerouslySetInnerHTML: { __html: inner }
    });
  }

  function svgIconHtml(name, size = 16, extraStyle = "") {
    const inner = ICONS_PATH[name] || "";
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0;${extraStyle}">${inner}</svg>`;
  }

  // ==========================================================================
  // 3. Theme Engine & Live QuickCSS Manager
  // ==========================================================================
  const PRESET_THEMES = [
    {
      id: "obsidian",
      name: "Black Obsidian",
      author: "Miccord",
      desc: "Minimalismo escuro com preto absoluto (#000000), superfícies de carbono e estética moderna.",
      colors: ["#000000", "#070709", "#ffffff"],
    },
    {
      id: "amoled",
      name: "AMOLED Pitch Black",
      author: "Miccord",
      desc: "Preto absoluto com contraste profundo para telas OLED.",
      colors: ["#000000", "#08080c", "#a1a1aa"],
    },
    {
      id: "slate",
      name: "Slate Minimal",
      author: "Miccord",
      desc: "Tons de ardósia escuro com acabamento fosco suave.",
      colors: ["#0b0f17", "#0f1420", "#94a3b8"],
    },
    {
      id: "midnight",
      name: "Midnight (refact0r)",
      author: "refact0r",
      desc: "Port fiel do tema Midnight do Discord: painéis flutuantes, paleta navy deep (#161a21 / #1c212a) e acentos azuis ciano.",
      colors: ["#161a21", "#1c212a", "#3b82f6"],
    },
    {
      id: "cyberpunk",
      name: "Cyberpunk Dark",
      author: "Miccord",
      desc: "Tons violeta-escuro com detalhes neon rosa e ciano.",
      colors: ["#0a0614", "#100a20", "#f43f5e"],
    },
    {
      id: "catppuccin",
      name: "Catppuccin Mocha",
      author: "Miccord",
      desc: "Paleta suave e aconchegante inspirada no Catppuccin Mocha.",
      colors: ["#1e1e2e", "#181825", "#cba6f7"],
    },
    {
      id: "dracula",
      name: "Dracula Pro",
      author: "Miccord",
      desc: "Tema clássico escuro com acentos roxos e magenta.",
      colors: ["#282a36", "#21222c", "#bd93f9"],
    },
    {
      id: "emerald",
      name: "Emerald Matrix",
      author: "Miccord",
      desc: "Fundo verde-obsidiana com destaques esmeralda.",
      colors: ["#050e0a", "#091610", "#10b981"],
    },
    {
      id: "frost",
      name: "Frost Midnight",
      author: "Miccord",
      desc: "Azul meia-noite glacial com destaques celestes.",
      colors: ["#090e17", "#0d1522", "#38bdf8"],
    },
  ];

  let quickCssStyleEl = null;

  function applyThemesAndQuickCSS() {
    if (!document.documentElement) return;
    const theme = state.settings.activeTheme || "obsidian";
    if (theme === "obsidian" || theme === "default") {
      document.documentElement.setAttribute("data-miccord-theme", "obsidian");
    } else {
      document.documentElement.setAttribute("data-miccord-theme", theme);
    }

    if (!quickCssStyleEl) {
      quickCssStyleEl = document.getElementById("miccord-quickcss-style");
      if (!quickCssStyleEl && document.head) {
        quickCssStyleEl = document.createElement("style");
        quickCssStyleEl.id = "miccord-quickcss-style";
        // Copy CSP nonce if available on any script/style
        const nonceEl = document.querySelector("[nonce]");
        if (nonceEl && nonceEl.nonce) {
          quickCssStyleEl.setAttribute("nonce", nonceEl.nonce);
        }
        document.head.appendChild(quickCssStyleEl);
      }
    }

    if (quickCssStyleEl) {
      quickCssStyleEl.textContent = state.settings.quickCssEnabled
        ? state.settings.quickCss || ""
        : "";
    }
  }

  // ==========================================================================
  // 3. Patcher Utility (Before / Instead / After Function Monkey-Patching)
  // ==========================================================================
  const patches = [];

  const Patcher = {
    before(obj, prop, callback, tag = "anonymous") {
      return this._patch(obj, prop, "before", callback, tag);
    },
    after(obj, prop, callback, tag = "anonymous") {
      return this._patch(obj, prop, "after", callback, tag);
    },
    instead(obj, prop, callback, tag = "anonymous") {
      return this._patch(obj, prop, "instead", callback, tag);
    },
    _patch(obj, prop, type, callback, tag) {
      if (!obj || typeof obj[prop] !== "function") return () => {};
      const orig = obj[prop];
      const patchEntry = { obj, prop, type, callback, tag, orig, active: true };
      patches.push(patchEntry);

      const wrapper = function (...args) {
        if (!patchEntry.active) return orig.apply(this, args);
        try {
          if (type === "before") {
            const newArgs = callback.call(this, args);
            if (Array.isArray(newArgs)) args = newArgs;
            return orig.apply(this, args);
          } else if (type === "instead") {
            return callback.call(this, args, orig.bind(this));
          } else if (type === "after") {
            const res = orig.apply(this, args);
            const newRes = callback.call(this, args, res);
            return newRes !== undefined ? newRes : res;
          }
        } catch (err) {
          console.error(`[Miccord Patcher:${tag}] Erro em ${prop}:`, err);
          return orig.apply(this, args);
        }
      };

      Object.assign(wrapper, orig);
      wrapper.__miccordOrig = orig;
      wrapper.toString = () => orig.toString();

      try {
        obj[prop] = wrapper;
      } catch {
        try {
          Object.defineProperty(obj, prop, {
            configurable: true,
            enumerable: true,
            writable: true,
            value: wrapper,
          });
        } catch (e) {
          console.warn(`[Miccord Patcher] Não foi possível sobrescrever ${prop}:`, e);
        }
      }

      return () => {
        patchEntry.active = false;
        try {
          obj[prop] = orig;
        } catch {}
      };
    },
    unpatchAll(tag) {
      for (const p of patches) {
        if (!tag || p.tag === tag) {
          p.active = false;
          try {
            p.obj[p.prop] = p.orig;
          } catch {}
        }
      }
    },
  };

  // ==========================================================================
  // 4. Rspack Runtime Hook & Module Searcher (`Miccord.Webpack`)
  // ==========================================================================
  let wreqRef = null;
  let settingsResolverPatched = false; // true once Micup's settings tab resolver is hooked
  const moduleListeners = new Map(); // id -> Set<callback>
  const anyModuleListeners = new Set();

  const Webpack = {
    get wreq() {
      return wreqRef;
    },
    get cache() {
      return wreqRef?.c || {};
    },
    get factories() {
      return wreqRef?.m || {};
    },
    getModule(id, forceRequire = false) {
      if (!wreqRef) return null;
      const strId = String(id);
      if (wreqRef.c && wreqRef.c[strId]) {
        return wreqRef.c[strId].exports;
      }
      if (forceRequire && wreqRef.m && wreqRef.m[strId]) {
        try {
          return wreqRef(strId);
        } catch {
          return null;
        }
      }
      return null;
    },
    find(predicate, { includeUnloaded = false } = {}) {
      if (!wreqRef) return null;
      for (const mod of Object.values(wreqRef.c || {})) {
        const exp = mod?.exports;
        if (!exp) continue;
        try {
          if (predicate(exp, mod.id)) return exp;
          if (exp.default && predicate(exp.default, mod.id)) return exp.default;
          if (exp.A && predicate(exp.A, mod.id)) return exp.A;
        } catch {}
      }
      if (includeUnloaded && wreqRef.m) {
        for (const id of Object.keys(wreqRef.m)) {
          if (wreqRef.c[id]) continue;
          const exp = this.getModule(id);
          if (!exp) continue;
          try {
            if (predicate(exp, id)) return exp;
            if (exp.default && predicate(exp.default, id)) return exp.default;
            if (exp.A && predicate(exp.A, id)) return exp.A;
          } catch {}
        }
      }
      return null;
    },
    findAll(predicate) {
      const results = [];
      if (!wreqRef) return results;
      for (const [id, mod] of Object.entries(wreqRef.c || {})) {
        const exp = mod?.exports;
        if (!exp) continue;
        try {
          if (predicate(exp, id)) results.push({ id, exports: exp });
          else if (exp.default && predicate(exp.default, id)) results.push({ id, exports: exp.default });
          else if (exp.A && predicate(exp.A, id)) results.push({ id, exports: exp.A });
        } catch {}
      }
      return results;
    },
    findByProps(...props) {
      return this.find((exp) => exp && typeof exp === "object" && props.every((p) => p in exp));
    },
    findByCode(...snippets) {
      if (!wreqRef?.m) return null;
      for (const [id, factory] of Object.entries(wreqRef.m)) {
        const code = Function.prototype.toString.call(factory);
        if (snippets.every((s) => code.includes(s))) {
          return { id, exports: this.getModule(id), code };
        }
      }
      return null;
    },
    onModule(id, callback) {
      const strId = String(id);
      if (wreqRef?.c?.[strId]?.exports) {
        try {
          callback(wreqRef.c[strId].exports, strId, wreqRef);
        } catch (e) {
          console.error(`[Miccord] Erro em onModule(${strId}):`, e);
        }
      }
      if (!moduleListeners.has(strId)) {
        moduleListeners.set(strId, new Set());
      }
      moduleListeners.get(strId).add(callback);
    },
  };

  // Module ids are deterministic per source path, but they do change when Micup moves code
  // around (React was `13706` up to 1.0.17 and is gone in 1.0.21). Resolve by shape instead.
  let cachedReact = null;
  const isReactModule = (m) =>
    !!m &&
    typeof m.createElement === "function" &&
    typeof m.useState === "function" &&
    typeof m.useEffect === "function" &&
    typeof m.Fragment !== "undefined";

  function getReact() {
    if (cachedReact) return cachedReact;
    const byId = Webpack.getModule(13706);
    if (isReactModule(byId)) return (cachedReact = byId);
    const found = Webpack.find((exp) => isReactModule(exp));
    if (found) cachedReact = found;
    return cachedReact;
  }

  function notifyModuleLoaded(id, exports, req) {
    const strId = String(id);
    const listeners = moduleListeners.get(strId);
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(exports, strId, req);
        } catch (e) {
          console.error(`[Miccord] Erro no listener do módulo ${strId}:`, e);
        }
      }
    }
    for (const cb of anyModuleListeners) {
      try {
        cb(strId, exports, req);
      } catch {}
    }
  }

  function wrapFactory(id, origFactory) {
    if (typeof origFactory !== "function" || origFactory.__miccordWrapped) {
      return origFactory;
    }
    const wrapped = function (module, exports, req) {
      if (!wreqRef) wreqRef = req;
      if (!req.c) req.c = {};
      req.c[id] = module;
      try {
        return origFactory.call(this, module, exports, req);
      } finally {
        try {
          notifyModuleLoaded(id, module.exports, req);
        } catch {}
      }
    };
    wrapped.__miccordWrapped = true;
    wrapped.__orig = origFactory;
    wrapped.toString = () => Function.prototype.toString.call(origFactory);
    return wrapped;
  }

  function wrapFactoriesMap(factoriesObj) {
    if (!factoriesObj || typeof factoriesObj !== "object") return;
    for (const id of Object.keys(factoriesObj)) {
      factoriesObj[id] = wrapFactory(id, factoriesObj[id]);
    }
  }

  function installRspackHook() {
    const chunkArray = (self.rspackChunkfluxer_app = self.rspackChunkfluxer_app || []);
    const nativePush = Array.prototype.push;

    // If the Rspack runtime already ran (miccord.js injected too late), it has replaced
    // `chunkArray.push` with its JSONP callback. Keep using it, otherwise every chunk loaded
    // later would land in a plain array and its `import()` would never resolve.
    const runtimePushBeforeUs =
      Object.prototype.hasOwnProperty.call(chunkArray, "push") && chunkArray.push !== nativePush
        ? chunkArray.push
        : null;
    if (runtimePushBeforeUs) {
      console.warn("[Miccord] miccord.js carregou depois do runtime do Rspack; módulos já carregados não serão hookados.");
    }

    // Wrap factories in any chunks already pushed before miccord.js
    for (const chunk of chunkArray) {
      if (Array.isArray(chunk) && chunk[1]) {
        wrapFactoriesMap(chunk[1]);
      }
    }

    // Push our initialization chunk first (runs right away if the runtime is already up)
    chunkArray.push([
      ["miccord_runtime_hook"],
      {},
      function (wreq) {
        wreqRef = wreq;
        wreq.c = wreq.c || {};

        // Patch wreq.d so all exported getters/values are configurable and writable!
        wreq.d = function (exportsObj, gettersObj, valuesObj) {
          if (gettersObj) {
            for (const key in gettersObj) {
              if (wreq.o(gettersObj, key) && !wreq.o(exportsObj, key)) {
                let currentGetter = gettersObj[key];
                Object.defineProperty(exportsObj, key, {
                  enumerable: true,
                  configurable: true,
                  get: function () {
                    return currentGetter.call(this);
                  },
                  set: function (newVal) {
                    currentGetter = () => newVal;
                  },
                });
              }
            }
          }
          if (valuesObj) {
            for (const key in valuesObj) {
              if (wreq.o(valuesObj, key) && !wreq.o(exportsObj, key)) {
                Object.defineProperty(exportsObj, key, {
                  enumerable: true,
                  configurable: true,
                  writable: true,
                  value: valuesObj[key],
                });
              }
            }
          }
        };

        // Ensure all registered factories in wreq.m are wrapped
        wrapFactoriesMap(wreq.m);

        console.log(
          `%c Miccord v${VERSION} %c Rspack Runtime Hookado (${Object.keys(wreq.m || {}).length} módulos registrados) `,
          "background: #ffffff; color: #000000; font-weight: 700; padding: 3px 8px; border-radius: 4px 0 0 4px;",
          "background: #09090b; color: #d4d4d8; font-weight: 500; padding: 3px 8px; border-radius: 0 4px 4px 0; border: 1px solid rgba(255,255,255,0.1);"
        );

        setupCoreHooks();
      },
    ]);

    // Intercept future .push() calls without recursion when Rspack binds `l.push = s.bind(null, l.push.bind(l))`.
    // Before the runtime takes over, chunks still have to be wrapped as they are queued.
    const wrapChunks = (chunks) => {
      for (const chunk of chunks) {
        if (Array.isArray(chunk) && chunk[1]) {
          wrapFactoriesMap(chunk[1]);
        }
      }
    };
    const queuePush = function (...chunks) {
      wrapChunks(chunks);
      return nativePush.apply(chunkArray, chunks);
    };
    const makeRuntimePush = (runtimePush) =>
      function (...chunks) {
        wrapChunks(chunks);
        return runtimePush.apply(this, chunks);
      };
    let rspackPush = runtimePushBeforeUs ? makeRuntimePush(runtimePushBeforeUs) : null;
    Object.defineProperty(chunkArray, "push", {
      configurable: true,
      enumerable: false,
      get() {
        return rspackPush || queuePush;
      },
      set(newPushFn) {
        rspackPush = makeRuntimePush(newPushFn);
      },
    });
  }

  // ==========================================================================
  // 5. Toast Notification Helper (Uses Micup's native Toast module `629858` + DOM fallback)
  // ==========================================================================
  function showToast(message, type = "info") {
    try {
      const toastMod = Webpack.getModule(629858);
      if (toastMod && typeof toastMod.ox === "function") {
        toastMod.ox({
          type: type === "error" ? "error" : type === "success" ? "success" : "info",
          children: `[Miccord] ${message}`,
          timeout: 3200,
        });
        return;
      }
    } catch {}

    // Fallback DOM toast (Black Obsidian Minimalist)
    const el = document.createElement("div");
    el.style.cssText = `
      position: fixed; top: 18px; right: 18px; z-index: 9999999;
      background: #09090b; color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.12);
      border-left: 3px solid ${type === "error" ? "#f43f5e" : type === "success" ? "#22c55e" : "#ffffff"};
      padding: 9px 14px; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12.5px; font-weight: 500; box-shadow: 0 12px 36px rgba(0,0,0,0.85);
      display: flex; align-items: center; gap: 8px;
    `;
    el.innerHTML = `${svgIconHtml(type === "error" ? "x" : type === "success" ? "check" : "zap", 14)} <span>${message}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ==========================================================================
  // 6. Built-In Plugins Catalog & Implementations
  // ==========================================================================
  const PLUGIN_DEFINITIONS = [
    {
      id: "ScreenShareBypass",
      name: "ScreenShare Plus Bypass",
      category: "Voz & Áudio",
      author: "Better MicUP",
      description:
        "Desbloqueia compartilhamento de tela em 1080p (Full HD), 1440p (Quad HD) e Source/4K Nativo a 60, 90 ou 120 FPS com bitrate de até 20 Mbps sem precisar de assinatura Plus.",
      settingsSchema: [
        {
          key: "maxBitrateKbps",
          label: "Bitrate Máximo de Vídeo",
          type: "select",
          options: [
            { value: "6000", label: "6.000 kbps (6 Mbps — Padrão Plus)" },
            { value: "9000", label: "9.000 kbps (9 Mbps — Alta Nitidez)" },
            { value: "12000", label: "12.000 kbps (12 Mbps — Ultra HD)" },
            { value: "15000", label: "15.000 kbps (15 Mbps — 4K Extremo)" },
            { value: "20000", label: "20.000 kbps (20 Mbps — Sem Compressão)" },
          ],
        },
      ],
    },
    {
      id: "MessageLogger",
      name: "MessageLogger",
      category: "Chat & Privacidade",
      author: "Better MicUP",
      description:
        "Salva mensagens apagadas e histórico de edições em tempo real. Mantém mensagens excluídas visíveis diretamente no chat com selo [APAGADA].",
      settingsSchema: [
        { key: "keepDeletedInChat", label: "Manter mensagens apagadas visíveis no chat", type: "boolean" },
        { key: "showInlineEdits", label: "Anexar texto antigo ao editar mensagem", type: "boolean" },
        { key: "ignoreBots", label: "Ignorar mensagens de Bots", type: "boolean" },
        { key: "ignoreSelf", label: "Ignorar minhas próprias mensagens", type: "boolean" },
      ],
    },
    {
      id: "NoTrack",
      name: "NoTrack & Anti-Telemetry",
      category: "Sistema & Segurança",
      author: "Better MicUP",
      description:
        "Bloqueia requisições de telemetria, analytics, relatórios automáticos e rastreamento em segundo plano.",
      settingsSchema: [],
    },
    {
      id: "CallTimer",
      name: "CallTimer",
      category: "Voz & Áudio",
      author: "Better MicUP",
      description:
        "Exibe um cronômetro em tempo real (HH:MM:SS) mostrando há quanto tempo você está conectado no canal de voz atual.",
      settingsSchema: [],
    },
    {
      id: "ExperimentsAndHiddenTabs",
      name: "Experiments & Developer Options",
      category: "Sistema & Segurança",
      author: "Better MicUP",
      description:
        "Habilita o Modo Desenvolvedor e desbloqueia a aba oculta 'Developer Options' nativa do Micup nas Configurações de Usuário.",
      settingsSchema: [],
    },
    {
      id: "AlwaysTrustDomains",
      name: "AlwaysTrustDomains & CleanURLs",
      category: "Chat & Privacidade",
      author: "Better MicUP",
      description:
        "Desativa o modal de confirmação ao clicar em links externos e limpa parâmetros de rastreamento (utm_*, fbclid, gclid) automaticamente.",
      settingsSchema: [
        { key: "cleanTrackingParams", label: "Sanitizar URLs (remover utm_*, fbclid)", type: "boolean" },
      ],
    },
    {
      id: "DevToolsShortcut",
      name: "DevTools & Hotkeys (F12 / Ctrl+Shift+M)",
      category: "Sistema & Segurança",
      author: "Better MicUP",
      description:
        "Ativa F12 e Ctrl+Shift+I para abrir o Chromium DevTools nativo do Electron e Ctrl+Shift+M para abrir o painel rápido do Better MicUP.",
      settingsSchema: [],
    },
    {
      id: "VolumeBooster",
      name: "Volume Individual Amplificado",
      category: "Voz & Áudio",
      author: "Better MicUP",
      description:
        "Permite aumentar o volume de amigos e participantes da chamada além do limite padrão do app (até 200%) com ganho WebAudio sem distorção.",
      settingsSchema: [
        {
          key: "maxMultiplier",
          label: "Limite Máximo de Volume",
          type: "select",
          options: [
            { value: "200", label: "200% (2x — Dobro de Volume Recomendado)" },
            { value: "250", label: "250% (2.5x — Alto Ganho)" },
            { value: "300", label: "300% (3x — Ganho Extremo)" },
          ],
        },
      ],
    },
    {
      id: "FakePlus",
      name: "Fake Plus (Emotes & Stickers Livres)",
      category: "Chat & Mensagens",
      author: "Better MicUP",
      description:
        "Desbloqueia o envio de emojis customizados e stickers de qualquer servidor ou DM sem necessidade de assinatura Plus. Converte para imagens em alta resolução ao enviar.",
      settingsSchema: [
        {
          key: "convertExternalToLinks",
          label: "Converter emotes externos para links CDN de alta resolução (NitroSpoof)",
          type: "boolean",
        },
      ],
    },
  ];

  // Sync runtime plugin settings with Micup's internal stores
  function syncStoreBasedPlugins() {
    try {
      // 1. ScreenShareBypass & FakePlus traits via UserStore (978111)
      const userStoreMod = Webpack.getModule(978111);
      const userStore = userStoreMod?.A || userStoreMod?.default;
      if (userStore && !userStore.__miccordPatched) {
        userStore.__miccordPatched = true;
        Patcher.after(
          userStore,
          "getCurrentUser",
          (_args, user) => {
            if (user) {
              if (state.settings.plugins.ScreenShareBypass?.enabled || state.settings.plugins.FakePlus?.enabled) {
                try {
                  if (Array.isArray(user.traits) && !user.traits.includes("premium")) {
                    user.traits = [...user.traits, "premium"];
                  }
                } catch {}
              }
              if (state.settings.plugins.FakePlus?.enabled) {
                try {
                  user.premium_type = 2;
                  user.isPremium = () => true;
                } catch {}
              }
            }
            return user;
          },
          "ScreenShareBypass_UserTraits"
        );
      }

      // 2. Camera 1080p unlock via VoiceSettings
      const ssCfg = state.settings.plugins.ScreenShareBypass;
      if (ssCfg?.enabled) {
        const voiceSettingsMod = Webpack.getModule(844865);
        const voiceSettings = voiceSettingsMod?.Ay || voiceSettingsMod?.default;
        const voiceActionsMod = Webpack.getModule(494382);
        const updateFn =
          typeof voiceActionsMod?.yo === "function"
            ? voiceActionsMod.yo
            : typeof voiceSettings?.updateSettings === "function"
            ? voiceSettings.updateSettings.bind(voiceSettings)
            : null;

        if (updateFn && voiceSettings?.cameraResolution === "medium") {
          try {
            updateFn({ cameraResolution: "high" });
          } catch {}
        }
      }

      // 3. ExperimentsAndHiddenTabs + AlwaysTrustDomains + NoTrack + FakePlus DeveloperOptions
      const userSettingsMod = Webpack.getModule(407149);
      const userSettings = userSettingsMod?.default || userSettingsMod?.A;
      if (userSettings) {
        if (state.settings.plugins.ExperimentsAndHiddenTabs?.enabled && typeof userSettings.setDeveloperMode === "function") {
          if (!userSettings.developerMode) userSettings.setDeveloperMode(true);
        }
        if (state.settings.plugins.AlwaysTrustDomains?.enabled && typeof userSettings.setSanitizeUrls === "function") {
          userSettings.setSanitizeUrls( Boolean(state.settings.plugins.AlwaysTrustDomains.cleanTrackingParams) );
        }
      }

      const trustActMod = Webpack.getModule(422204);
      if (trustActMod && typeof trustActMod.ni === "function") {
        trustActMod.ni(Boolean(state.settings.plugins.AlwaysTrustDomains?.enabled));
      }

      const devStoreMod = Webpack.getModule(525564);
      const devStore = devStoreMod?.A || devStoreMod?.default;
      if (devStore && typeof devStore.setOption === "function") {
        if (state.settings.plugins.NoTrack?.enabled) {
          devStore.setOption("noOpInAppReports", true);
        }
        if (state.settings.plugins.FakePlus?.enabled) {
          try {
            devStore.setOption("premiumTypeOverride", 2);
            devStore.setOption("hasEverPurchasedOverride", true);
            devStore.setOption("premiumSinceOverride", new Date("2024-01-01"));
          } catch {}
        }
      }

      // 4. VolumeBooster AudioContext check
      if (state.settings.plugins.VolumeBooster?.enabled && window.__miccordSharedAudioCtx) {
        if (window.__miccordSharedAudioCtx.state === "suspended") {
          window.__miccordSharedAudioCtx.resume().catch(() => {});
        }
      }
    } catch (err) {
      console.warn("[Miccord] Aviso ao sincronizar stores:", err);
    }
  }

  // ==========================================================================
  // 7. Hooking Core Micup Modules (MessageStore, Gateway, Typing, HTTP, Settings)
  // ==========================================================================
  function setupCoreHooks() {
    // ------------------------------------------------------------------------
    // A. Hook Native User Settings Sidebar & Router (`166190` & `219381`)
    // ------------------------------------------------------------------------
    Webpack.onModule(166190, (exports) => {
      if (exports.__miccordPatched) return;
      exports.__miccordPatched = true;

      const MICCORD_TABS = [
        { type: "miccord_dashboard", category: "miccord", label: "Better MicUP" },
        { type: "miccord_plugins", category: "miccord", label: "Plugins" },
        { type: "miccord_themes", category: "miccord", label: "Temas & QuickCSS" },
        { type: "miccord_msglogger", category: "miccord", label: "Message Logger" },
        { type: "miccord_devtools", category: "miccord", label: "DevTools & Rspack" },
      ];

      function makeMiccordIcon(pathD) {
        return function MiccordTabIcon(props) {
          const ReactMod = getReact();
          if (!ReactMod) return null;
          return ReactMod.createElement(
            "svg",
            {
              className: props?.className || "",
              width: props?.size || 18,
              height: props?.size || 18,
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              strokeLinecap: "round",
              strokeLinejoin: "round",
            },
            ReactMod.createElement("path", { d: pathD })
          );
        };
      }

      const TAB_ICONS = {
        miccord_dashboard: makeMiccordIcon("M13 2L3 14h9l-1 8 10-12h-9l1-8z"),
        miccord_plugins: makeMiccordIcon("M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"),
        miccord_themes: makeMiccordIcon("M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"),
        miccord_msglogger: makeMiccordIcon("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"),
        miccord_devtools: makeMiccordIcon("M16 18l6-6-6-6M8 6l-6 6 6 6"),
      };

      // 1. Category header title: 166190.F$(category, i18n)
      Patcher.instead(
        exports,
        "F$",
        (args, orig) => {
          const [category] = args;
          if (category === "miccord") return "Better MicUP";
          return orig(...args);
        },
        "SettingsCategoryTitle"
      );

      // 2. All tabs list: 166190.Wh(i18n)
      Patcher.after(
        exports,
        "Wh",
        (_args, tabs) => {
          if (!Array.isArray(tabs)) return tabs;
          if (tabs.some((t) => t.category === "miccord")) return tabs;
          // Without the tab component resolver (module `219381`, gone in Micup 1.0.21) Micup
          // can't render our tabs and the settings screen would break. Use Ctrl+Shift+M instead.
          if (!settingsResolverPatched) return tabs;

          const injected = MICCORD_TABS.map((t) => ({
            type: t.type,
            category: t.category,
            label: t.label,
            icon: TAB_ICONS[t.type],
            iconWeight: "fill",
          }));

          // Insert right after app_settings so Miccord is prominently visible in the sidebar!
          let lastAppIdx = -1;
          for (let i = 0; i < tabs.length; i++) {
            if (tabs[i].category === "app_settings") lastAppIdx = i;
          }
          if (lastAppIdx !== -1) {
            const copy = [...tabs];
            copy.splice(lastAppIdx + 1, 0, ...injected);
            return copy;
          }
          return [...tabs, ...injected];
        },
        "SettingsTabsList"
      );

      // 3. Individual tab label lookup: 166190.I0 — `(tabType, i18n)` up to 1.0.17,
      //    `(i18n, tabType)` since 1.0.21, so look for the tab type in either position.
      Patcher.instead(
        exports,
        "I0",
        (args, orig) => {
          const tabType = args.find((a) => typeof a === "string" && a.startsWith("miccord_"));
          const found = MICCORD_TABS.find((t) => t.type === tabType);
          if (found) return found.label;
          return orig(...args);
        },
        "SettingsTabLabel"
      );

      // 4. Individual tab icon lookup: 166190._i(tabType)
      Patcher.instead(
        exports,
        "_i",
        (args, orig) => {
          const [tabType] = args;
          if (TAB_ICONS[tabType]) {
            return { icon: TAB_ICONS[tabType], iconWeight: "fill" };
          }
          return orig(...args);
        },
        "SettingsTabIcon"
      );

      // 5. Since Micup 1.0.21 the settings modal resolves a tab's component with plain object
      //    lookups that are not exported (`Mb[type] ?? Mf[type]` inside the UserSettingsModal
      //    module). A non-enumerable property on Object.prototype makes those lookups find our
      //    tabs without rewriting Micup's code. The `miccord_` prefix keeps it collision-free;
      //    being a writable data property, plain assignments to these keys still work.
      for (const t of MICCORD_TABS) {
        if (Object.prototype.hasOwnProperty.call(Object.prototype, t.type)) continue;
        try {
          Object.defineProperty(Object.prototype, t.type, {
            value: getMiccordTabComponent(t.type),
            writable: true,
            configurable: true,
            enumerable: false,
          });
        } catch (e) {
          Logger.warn("Não foi possível registrar a aba", t.type, e);
          return;
        }
      }
      settingsResolverPatched = true;
    });

    // 6. Settings Tab Component Resolver up to Micup 1.0.17: 219381.E(tabType)
    Webpack.onModule(219381, (exports) => {
      if (exports.__miccordPatched) return;
      exports.__miccordPatched = true;
      if (typeof exports.E !== "function") return;
      settingsResolverPatched = true;

      Patcher.instead(
        exports,
        "E",
        (args, orig) => {
          const [tabType] = args;
          if (typeof tabType === "string" && tabType.startsWith("miccord_")) {
            return getMiccordTabComponent(tabType);
          }
          return orig(...args);
        },
        "SettingsTabComponent"
      );
    });

    // ------------------------------------------------------------------------
    // B. Hook MessageStore (`634368`) & ReferencedMessageStore (`986713`) for MessageLogger
    // ------------------------------------------------------------------------
    Webpack.onModule(634368, (exports) => {
      const store = exports?.A || exports?.default;
      if (!store || store.__miccordPatched) return;
      store.__miccordPatched = true;

      function extractAuthorInfo(msg, authorIdFallback) {
        const userStore = Webpack.getModule(978111)?.A;
        const currentUser = userStore?.getCurrentUser?.();
        const authorObj = msg?.author || (authorIdFallback && userStore?.getUser?.(authorIdFallback));
        return {
          id: authorObj?.id || msg?.author_id || authorIdFallback || "unknown",
          username: authorObj?.username || msg?.author?.username || "Usuário",
          GlobalName: authorObj?.globalName || authorObj?.global_name || authorObj?.username || "Usuário",
          avatar: authorObj?.avatar || null,
          bot: Boolean(authorObj?.bot),
          isSelf: Boolean(currentUser && (authorObj?.id === currentUser.id || msg?.author_id === currentUser.id)),
        };
      }

      // Intercept single message deletion
      Patcher.instead(
        store,
        "handleMessageDelete",
        (args, orig) => {
          const [event] = args;
          const cfg = state.settings.plugins.MessageLogger;
          if (!cfg?.enabled || !event?.id || !event?.channel_id) {
            return orig(...args);
          }

          const existingMsg = store.getMessage?.(event.channel_id, event.id);
          if (existingMsg && !existingMsg.__miccordDeleted) {
            const authorInfo = extractAuthorInfo(existingMsg);
            const shouldSkip =
              (cfg.ignoreBots && authorInfo.bot) || (cfg.ignoreSelf && authorInfo.isSelf);

            if (!shouldSkip) {
              state.messageLogs.unshift({
                id: `${event.id}_del_${Date.now()}`,
                messageId: event.id,
                type: "deleted",
                channelId: event.channel_id,
                guildId: event.guild_id || null,
                author: authorInfo,
                content: existingMsg.content || "",
                attachments: Array.isArray(existingMsg.attachments)
                  ? existingMsg.attachments.map((a) => ({ url: a.url, filename: a.filename }))
                  : [],
                timestamp: Date.now(),
              });
              saveMessageLogs();
            }

            // Keep deleted message visible right in the chat!
            if (cfg.keepDeletedInChat && !shouldSkip) {
              try {
                existingMsg.__miccordDeleted = true;
                if (typeof existingMsg.content === "string" && !existingMsg.content.includes("[APAGADA]")) {
                  existingMsg.content = `${existingMsg.content}  \`[APAGADA]\``;
                }
                if (typeof store.emitChange === "function") store.emitChange();
                return false; // Prevent removal from channel messages map!
              } catch {}
            }
          }
          return orig(...args);
        },
        "MessageLoggerDelete"
      );

      // Intercept bulk message deletion
      Patcher.instead(
        store,
        "handleMessageDeleteBulk",
        (args, orig) => {
          const [event] = args;
          const cfg = state.settings.plugins.MessageLogger;
          if (!cfg?.enabled || !Array.isArray(event?.ids) || !event?.channel_id) {
            return orig(...args);
          }

          for (const msgId of event.ids) {
            const existingMsg = store.getMessage?.(event.channel_id, msgId);
            if (existingMsg && !existingMsg.__miccordDeleted) {
              const authorInfo = extractAuthorInfo(existingMsg);
              state.messageLogs.unshift({
                id: `${msgId}_bulk_${Date.now()}`,
                messageId: msgId,
                type: "deleted",
                channelId: event.channel_id,
                guildId: event.guild_id || null,
                author: authorInfo,
                content: existingMsg.content || "",
                attachments: [],
                timestamp: Date.now(),
              });
              if (cfg.keepDeletedInChat) {
                existingMsg.__miccordDeleted = true;
                if (typeof existingMsg.content === "string" && !existingMsg.content.includes("[APAGADA]")) {
                  existingMsg.content = `${existingMsg.content}  \`[APAGADA]\``;
                }
              }
            }
          }
          saveMessageLogs();
          if (cfg.keepDeletedInChat) {
            if (typeof store.emitChange === "function") store.emitChange();
            return false;
          }
          return orig(...args);
        },
        "MessageLoggerDeleteBulk"
      );

      // Intercept message edits
      Patcher.before(
        store,
        "handleMessageUpdate",
        (args) => {
          const [event] = args;
          const cfg = state.settings.plugins.MessageLogger;
          if (!cfg?.enabled || !event?.id || !event?.channel_id || typeof event.content !== "string") {
            return args;
          }

          const oldMsg = store.getMessage?.(event.channel_id, event.id);
          if (oldMsg && typeof oldMsg.content === "string" && oldMsg.content !== event.content) {
            const cleanOld = oldMsg.content.replace(/\n> \*\[Antes\]:.*$/s, "").trim();
            if (cleanOld && cleanOld !== event.content) {
              const authorInfo = extractAuthorInfo(oldMsg, event.author?.id);
              const shouldSkip =
                (cfg.ignoreBots && authorInfo.bot) || (cfg.ignoreSelf && authorInfo.isSelf);

              if (!shouldSkip) {
                state.messageLogs.unshift({
                  id: `${event.id}_edit_${Date.now()}`,
                  messageId: event.id,
                  type: "edited",
                  channelId: event.channel_id,
                  guildId: event.guild_id || null,
                  author: authorInfo,
                  oldContent: cleanOld,
                  content: event.content,
                  timestamp: Date.now(),
                });
                saveMessageLogs();

                if (cfg.showInlineEdits) {
                  event.content = `${event.content}\n> *[Antes]: ${cleanOld}*`;
                }
              }
            }
          }
          return args;
        },
        "MessageLoggerEdit"
      );
    });

    // Also protect ReferencedMessageStore (`986713`) from purging deleted replies when keepDeletedInChat is on
    Webpack.onModule(986713, (exports) => {
      const refStore = exports?.A || exports?.default;
      if (!refStore || refStore.__miccordPatched) return;
      refStore.__miccordPatched = true;

      Patcher.instead(
        refStore,
        "handleMessageDelete",
        (args, orig) => {
          if (state.settings.plugins.MessageLogger?.enabled && state.settings.plugins.MessageLogger?.keepDeletedInChat) {
            return false;
          }
          return orig(...args);
        },
        "RefMessageLoggerDelete"
      );
    });

    // ------------------------------------------------------------------------
    // C. Hook Gateway (`582520`) for CallTimer
    // ------------------------------------------------------------------------
    Webpack.onModule(582520, (exports) => {
      const gw = exports?.default || exports?.A;
      if (!gw || gw.__miccordPatched) return;
      gw.__miccordPatched = true;

      function hookSocketInstance(socket) {
        if (!socket || socket.__miccordSocketPatched) return;
        socket.__miccordSocketPatched = true;

        // Patch buildVoiceStatePayload for CallTimer
        if (typeof socket.buildVoiceStatePayload === "function") {
          Patcher.after(
            socket,
            "buildVoiceStatePayload",
            (_args, payload) => {
              if (!payload || typeof payload !== "object") return payload;

              // Track CallTimer start/stop
              if (payload.channel_id) {
                if (state.currentVoiceChannelId !== payload.channel_id) {
                  state.currentVoiceChannelId = payload.channel_id;
                  state.callStartTime = Date.now();
                }
              } else {
                state.currentVoiceChannelId = null;
                state.callStartTime = null;
              }
              notifyUI();
              return payload;
            },
            "CallTimerPayload"
          );
        }
      }

      if (gw.socket) hookSocketInstance(gw.socket);
      Patcher.after(
        gw,
        "initialize",
        () => {
          if (gw.socket) hookSocketInstance(gw.socket);
        },
        "GatewayInitSocket"
      );
    });

    // ------------------------------------------------------------------------
    // D. Hook TypingActions (`377988`) & HTTPClient (`370375`) for SilentTyping & NoTrack
    // ------------------------------------------------------------------------
    Webpack.onModule(377988, (exports) => {
      const typingObj = exports?.H || exports?.default;
      if (!typingObj || typingObj.__miccordPatched) return;
      typingObj.__miccordPatched = true;

      Patcher.instead(
        typingObj,
        "handleComposerChange",
        (args, orig) => {
          if (state.settings.plugins.SilentTyping?.enabled) {
            return; // Block typing indicator dispatch
          }
          return orig(...args);
        },
        "SilentTypingComposer"
      );
    });

    Webpack.onModule(370375, (exports) => {
      const http = exports?.http || exports?.default;
      if (!http || http.__miccordPatched) return;
      http.__miccordPatched = true;

      Patcher.instead(
        http,
        "post",
        (args, orig) => {
          const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
          if (state.settings.plugins.SilentTyping?.enabled && url.includes("/typing")) {
            return Promise.resolve({ status: 204, data: null, ok: true });
          }
          if (
            state.settings.plugins.NoTrack?.enabled &&
            (url.includes("/science") || url.includes("/telemetry") || url.includes("/track") || url.includes("sentry"))
          ) {
            return Promise.resolve({ status: 204, data: null, ok: true });
          }

          // FakePlus message interceptor (Stickers & External Emotes)
          if (state.settings.plugins.FakePlus?.enabled && url.includes("/messages") && !url.includes("/search")) {
            try {
              const mediaHelper = Webpack.getModule(937185);
              const configStore = Webpack.getModule(799377);
              const mediaEndpoint = configStore?.default?.mediaEndpoint || "https://media.micup.gg";

              const transformPayload = (payload) => {
                if (!payload || typeof payload !== "object") return;

                // 1. Convert Stickers to direct media URLs
                if (Array.isArray(payload.sticker_ids) && payload.sticker_ids.length > 0) {
                  const stickerId = payload.sticker_ids[0];
                  let stickerUrl = null;
                  try {
                    if (typeof mediaHelper?.bm === "function") {
                      stickerUrl = mediaHelper.bm({ id: stickerId, size: 160 });
                    }
                  } catch {}
                  if (!stickerUrl) {
                    stickerUrl = `${mediaEndpoint}/stickers/${stickerId}.webp?size=160`;
                  }
                  if (stickerUrl) {
                    payload.content = payload.content ? `${payload.content}\n${stickerUrl}` : stickerUrl;
                    delete payload.sticker_ids;
                  }
                }

                // 2. Convert External / Animated Emojis to direct CDN links if enabled
                if (state.settings.plugins.FakePlus?.convertExternalToLinks && typeof payload.content === "string") {
                  payload.content = payload.content.replace(/<(a?):([a-zA-Z0-9_~]+):([0-9]+)>/g, (_match, animated, _name, id) => {
                    let emojiUrl = null;
                    try {
                      if (typeof mediaHelper?._O === "function") {
                        emojiUrl = mediaHelper._O({ id, animated: Boolean(animated) });
                      }
                    } catch {}
                    if (!emojiUrl) {
                      emojiUrl = `${mediaEndpoint}/emojis/${id}.webp?size=48&quality=lossless`;
                    }
                    return emojiUrl;
                  });
                }
              };

              if (args[1]?.body && typeof args[1].body === "object" && !(args[1].body instanceof FormData)) {
                transformPayload(args[1].body);
              } else if (args[1]?.body instanceof FormData && args[1].body.has("payload_json")) {
                try {
                  const parsed = JSON.parse(args[1].body.get("payload_json"));
                  transformPayload(parsed);
                  args[1].body.set("payload_json", JSON.stringify(parsed));
                } catch {}
              }
            } catch (err) {
              console.warn("[Miccord] Erro no interceptor FakePlus de mensagens:", err);
            }
          }

          return orig(...args);
        },
        "HttpInterceptor"
      );
    });

    // Sync store-based plugins once key stores load
    for (const storeId of [525564, 407149, 422204, 823063, 978111, 844865, 685161, 618349, 496416, 468258]) {
      Webpack.onModule(storeId, () => syncStoreBasedPlugins());
    }
    setTimeout(syncStoreBasedPlugins, 1800);

    // ------------------------------------------------------------------------
    // E. ScreenSharePlusBypass Hooks (`690261`, `477986`, `702223`, `857720`, `414298`)
    // ------------------------------------------------------------------------

    // 1. Module 690261: Video Quality Entitlement (`Q7`) & Profile Limits (`Tx`)
    Webpack.onModule(690261, (exports) => {
      if (!exports || exports.__miccordPatched) return;
      exports.__miccordPatched = true;

      // Q7() -> returns boolean whether user has `feature_higher_video_quality`
      Patcher.instead(
        exports,
        "Q7",
        (args, orig) => {
          if (state.settings.plugins.ScreenShareBypass?.enabled) {
            return true;
          }
          return orig(...args);
        },
        "ScreenShareBypass_Q7"
      );

      // Tx() -> returns `{ maxHeight: 2160, maxFrameRate: 120 }`
      Patcher.instead(
        exports,
        "Tx",
        (args, orig) => {
          if (state.settings.plugins.ScreenShareBypass?.enabled) {
            return { maxHeight: 2160, maxFrameRate: 120 };
          }
          return orig(...args);
        },
        "ScreenShareBypass_Tx"
      );
    });

    // 2. Module 477986: Central Trait/Instance Limit Resolver (`k.resolve`)
    Webpack.onModule(477986, (exports) => {
      const resolver = exports?.k || exports?.default;
      if (!resolver || resolver.__miccordPatched) return;
      resolver.__miccordPatched = true;

      Patcher.instead(
        resolver,
        "resolve",
        (args, orig) => {
          const req = args[0];
          const ssEnabled = state.settings.plugins.ScreenShareBypass?.enabled;
          if (req && typeof req === "object") {
            if (ssEnabled) {
              if (req.key === "feature_higher_video_quality") return 1;
              if (req.key === "max_guild_video_height") return 2160;
              if (req.key === "max_guild_video_fps") return 120;
            }
            if (state.settings.plugins.FakePlus?.enabled) {
              if (req.key === "feature_global_expressions") return 1;
              if (req.key === "feature_custom_emojis") return 1;
              if (req.key === "feature_custom_stickers") return 1;
              if (req.key === "feature_large_uploads") return 1;
              if (req.key === "max_guild_emojis") return 9999;
              if (req.key === "max_guild_stickers") return 9999;
            }
          }
          return orig(...args);
        },
        "ScreenShareBypass_LimitResolve"
      );
    });

    // Helper to resolve current user-desired screen share quality & FPS across all hooks
    let voiceSettingsStore = null;
    const activeScreenShareVideoTracks = new Set();

    const snapFrameRate = (fps) => {
      const n = Number(fps);
      if (n >= 120) return 120;
      if (n >= 90) return 90;
      if (n >= 60) return 60;
      if (n >= 30) return 30;
      return 15;
    };

    const RES_DIMENSIONS = {
      low_240p: { width: 426, height: 240 },
      low_480p: { width: 854, height: 480 },
      medium: { width: 1280, height: 720 },
      high: { width: 1920, height: 1080 },
      ultra: { width: 2560, height: 1440 },
      source: { width: 3840, height: 2160 },
    };

    const getDesiredScreenShareSpec = (fallbackRes = "high", fallbackFps = 60) => {
      const cfg = state.settings.plugins.ScreenShareBypass;
      const mode = voiceSettingsStore?.streamingMode || "custom";
      const storedRes = voiceSettingsStore?.screenshareResolution || fallbackRes || "high";
      const storedFps = Number(voiceSettingsStore?.videoFrameRate || fallbackFps || 60);

      let resolution = storedRes;
      if (cfg?.forceResolution && cfg.forceResolution !== "picker") {
        resolution = cfg.forceResolution;
      } else if (mode === "gaming" || mode === "screenshare") {
        resolution = "high";
      }

      let frameRate = snapFrameRate(storedFps);
      if (cfg?.forceFps && cfg.forceFps !== "picker") {
        frameRate = snapFrameRate(Number(cfg.forceFps));
      } else if (mode === "screenshare") {
        frameRate = 30;
      } else if (mode === "gaming") {
        frameRate = 60;
      }

      const dims = RES_DIMENSIONS[resolution] || RES_DIMENSIONS.high;
      const maxBitrate = Math.max(6000000, (Number(cfg?.maxBitrateKbps) || 12000) * 1000);
      return {
        mode:
          (cfg?.forceResolution && cfg.forceResolution !== "picker") ||
          (cfg?.forceFps && cfg.forceFps !== "picker")
            ? "custom"
            : mode,
        resolution,
        width: dims.width,
        height: dims.height,
        frameRate,
        maxBitrate,
      };
    };

    const applyTrackConstraints = async (track, width, height, frameRate) => {
      if (!track || track.readyState === "ended" || typeof track.applyConstraints !== "function") {
        return;
      }
      const fps = snapFrameRate(frameRate);
      const candidates = [];
      if (width > 0 && height > 0) {
        candidates.push({
          width: { ideal: width, max: width },
          height: { ideal: height, max: height },
          frameRate: { ideal: fps, max: fps },
        });
        candidates.push({
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: fps, max: fps },
        });
      }
      candidates.push({
        frameRate: { ideal: fps, max: fps },
      });

      for (const c of candidates) {
        try {
          await track.applyConstraints(c);
          break;
        } catch {}
      }
    };

    // Hook `navigator.mediaDevices.getDisplayMedia` & `RTCRtpSender.prototype.setParameters`
    // In Electron, `setDisplayMediaRequestHandler` ignores initial `getDisplayMedia` frameRate
    // constraints unless `videoTrack.applyConstraints` is called on the resolved MediaStreamTrack!
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getDisplayMedia === "function" &&
        !navigator.mediaDevices.getDisplayMedia.__miccordPatched
      ) {
        const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(
          navigator.mediaDevices
        );
        // 'ended' only fires when the *source* goes away (window closed/minimized, capture
        // failed). Stopping the share from Micup calls track.stop(), which does not fire it.
        const watchScreenShareTrack = (track) => {
          let settings = {};
          try {
            settings = track.getSettings?.() || {};
          } catch {}
          recordScreenShareEvent("capture-started", {
            surface: settings.displaySurface || null,
            width: settings.width || null,
            height: settings.height || null,
            frameRate: settings.frameRate || null,
          });
          track.addEventListener?.(
            "ended",
            () => {
              activeScreenShareVideoTracks.delete(track);
              recordScreenShareEvent("capture-ended-by-source", {
                surface: settings.displaySurface || null,
                label: track.label || null,
              });
              showToast(
                "A captura foi encerrada pelo Windows (janela fechada ou minimizada). Para jogos em tela cheia, compartilhe a tela inteira.",
                "error"
              );
            },
            { once: true }
          );
        };

        const patchedGetDisplayMedia = async function (constraints) {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (!cfg?.enabled) {
            const plainStream = await origGetDisplayMedia(constraints);
            for (const track of plainStream?.getVideoTracks?.() || []) watchScreenShareTrack(track);
            return plainStream;
          }

          const spec = getDesiredScreenShareSpec();
          let reqWidth = spec.width;
          let reqHeight = spec.height;
          let reqFps = spec.frameRate;

          let nextConstraints = constraints;
          if (constraints && typeof constraints === "object") {
            const vid =
              constraints.video && typeof constraints.video === "object"
                ? { ...constraints.video }
                : {};
            const cW = Number(vid.width?.ideal || vid.width?.max || vid.width || 0);
            const cH = Number(vid.height?.ideal || vid.height?.max || vid.height || 0);
            const cFps = Number(vid.frameRate?.ideal || vid.frameRate?.max || vid.frameRate || 0);
            if (cW > 0 && (!cfg.forceResolution || cfg.forceResolution === "picker")) {
              reqWidth = cW;
            }
            if (cH > 0 && (!cfg.forceResolution || cfg.forceResolution === "picker")) {
              reqHeight = cH;
            }
            if (cFps > 0 && (!cfg.forceFps || cfg.forceFps === "picker") && cFps > reqFps) {
              reqFps = snapFrameRate(cFps);
            }
            vid.width = { ideal: reqWidth, max: reqWidth };
            vid.height = { ideal: reqHeight, max: reqHeight };
            vid.frameRate = { ideal: reqFps, max: reqFps };
            nextConstraints = { ...constraints, video: vid };
          }

          const stream = await origGetDisplayMedia(nextConstraints);
          if (stream && typeof stream.getVideoTracks === "function") {
            for (const track of stream.getVideoTracks()) {
              activeScreenShareVideoTracks.add(track);
              watchScreenShareTrack(track);
              if (reqFps >= 60) {
                try {
                  track.contentHint = "motion";
                } catch {}
              }
              await applyTrackConstraints(track, reqWidth, reqHeight, reqFps);
            }
          }
          return stream;
        };
        patchedGetDisplayMedia.__miccordPatched = true;
        navigator.mediaDevices.getDisplayMedia = patchedGetDisplayMedia;
      }
    } catch (err) {
      Logger.warn("Failed to hook getDisplayMedia:", err);
    }

    try {
      if (
        typeof RTCRtpSender !== "undefined" &&
        RTCRtpSender.prototype &&
        typeof RTCRtpSender.prototype.setParameters === "function" &&
        !RTCRtpSender.prototype.setParameters.__miccordPatched
      ) {
        const origSetParameters = RTCRtpSender.prototype.setParameters;
        const patchedSetParameters = function (params) {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (
            cfg?.enabled &&
            cfg.disableEncoderThrottling &&
            params &&
            typeof params === "object" &&
            this?.track?.kind === "video" &&
            (activeScreenShareVideoTracks.has(this.track) ||
              params.degradationPreference === "maintain-resolution" ||
              params.degradationPreference === "maintain-framerate-and-resolution")
          ) {
            const spec = getDesiredScreenShareSpec();
            // Build a copy instead of mutating Micup's object, so we can fall back to it.
            const boosted = { ...params, degradationPreference: "maintain-resolution" };
            if (Array.isArray(params.encodings)) {
              boosted.encodings = params.encodings.map((enc) => {
                const next = {
                  ...enc,
                  active: true,
                  maxFramerate: spec.frameRate,
                  maxBitrate: Math.max(Number(enc.maxBitrate || 0), spec.maxBitrate),
                  priority: "high",
                  networkPriority: "high",
                  scaleResolutionDownBy: 1,
                };
                delete next.scaleResolutionDownTo;
                return next;
              });
            }
            const sender = this;
            const result = origSetParameters.call(sender, boosted);
            if (result && typeof result.catch === "function") {
              // If the encoder refuses our values, apply Micup's own instead of failing the call.
              return result.catch((err) => {
                Logger.warn("setParameters recusou os parâmetros do ScreenShareBypass; usando os do Micup.", err);
                // A failed call invalidates the transactionId, so take a fresh one.
                const fresh = sender.getParameters();
                return origSetParameters.call(sender, { ...params, transactionId: fresh.transactionId });
              });
            }
            return result;
          }
          return origSetParameters.call(this, params);
        };
        patchedSetParameters.__miccordPatched = true;
        RTCRtpSender.prototype.setParameters = patchedSetParameters;
      }
    } catch (err) {
      Logger.warn("Failed to hook RTCRtpSender.setParameters:", err);
    }

    // Track `VoiceSettings` store (`844865`) so we always know the selected resolution & FPS
    Webpack.onModule(844865, (exports) => {
      const store = exports?.Ay || exports?.default;
      if (!store || store.__miccordPatched) return;
      store.__miccordPatched = true;
      voiceSettingsStore = store;

      Patcher.after(
        store,
        "updateSettings",
        (args) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (!cfg?.enabled) return;
          const patch = args[0];
          if (
            patch &&
            (patch.videoFrameRate !== undefined ||
              patch.screenshareResolution !== undefined ||
              patch.streamingMode !== undefined)
          ) {
            const spec = getDesiredScreenShareSpec();
            for (const track of activeScreenShareVideoTracks) {
              if (track.readyState === "ended") {
                activeScreenShareVideoTracks.delete(track);
                continue;
              }
              if (spec.frameRate >= 60) {
                try {
                  track.contentHint = "motion";
                } catch {}
              }
              applyTrackConstraints(
                track,
                spec.resolution === "source" ? 0 : spec.width,
                spec.resolution === "source" ? 0 : spec.height,
                spec.frameRate
              );
            }
          }
        },
        "ScreenShareBypass_VoiceSettingsUpdate"
      );
    });

    // 3. Module 702223: Core ScreenShare Quality, Bitrate & Encoding Engine
    Webpack.onModule(702223, (exports) => {
      if (!exports || exports.__miccordPatched) return;
      exports.__miccordPatched = true;

      // Raise hard bitrate ceiling constant `A2` from 9 Mbps to 25 Mbps, disable initial FPS cap in `Qg`,
      // and unlock 90 & 120 FPS in `m_` array (used by User Settings -> Voice & Video tab)
      try {
        exports.A2 = 25000000;
        if (exports.Qg && typeof exports.Qg === "object") {
          exports.Qg.capped = false;
        }
        if (Array.isArray(exports.m_)) {
          for (const fps of [90, 120]) {
            if (!exports.m_.includes(fps)) exports.m_.push(fps);
          }
          const origFilter = Array.prototype.filter.bind(exports.m_);
          exports.m_.filter = function (...fArgs) {
            if (state.settings.plugins.ScreenShareBypass?.enabled) {
              return [15, 30, 60, 90, 120];
            }
            return origFilter(...fArgs);
          };
        }
      } catch {}

      // `hW(fps)` -> Frame rate snapping (unlock 90 & 120 FPS instead of clamping at 60)
      Patcher.instead(
        exports,
        "hW",
        (args, orig) => {
          if (state.settings.plugins.ScreenShareBypass?.enabled) {
            return snapFrameRate(args[0]);
          }
          return orig(...args);
        },
        "ScreenShareBypass_hW"
      );

      // `Cr()` (hardware H.264 empty-profile clamp) is intentionally NOT overridden anymore:
      // it is a compatibility workaround for GPU encoders, not a quality limit. Forcing it off
      // could leave the hardware encoder producing no frames, and Micup then ends the stream.

      // `Fd(target, frameRateCapped)` -> Effective FPS resolver (never drop to 30 FPS)
      Patcher.instead(
        exports,
        "Fd",
        (args, orig) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled && cfg.disableEncoderThrottling && args[0]?.frameRate) {
            return args[0].frameRate;
          }
          return orig(...args);
        },
        "ScreenShareBypass_Fd"
      );

      // `bA(state, metrics)` -> Dynamic uplink FPS capper (prevent 60 -> 30 -> 60 FPS oscillation!)
      Patcher.instead(
        exports,
        "bA",
        (args, orig) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled && cfg.disableEncoderThrottling) {
            return { capped: false, narrowRounds: 0, recoveredRounds: 0, drops: 0 };
          }
          return orig(...args);
        },
        "ScreenShareBypass_bA"
      );

      // `wU(target)` -> Resolution ladder rungs generator (remove 1080p/720p/540p/360p step-down rungs!)
      Patcher.instead(
        exports,
        "wU",
        (args, orig) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled && cfg.disableEncoderThrottling && args[0]?.width && args[0]?.height) {
            return [{ width: args[0].width, height: args[0].height }];
          }
          return orig(...args);
        },
        "ScreenShareBypass_wU"
      );

      // `VJ` & `s_` -> Resolution ladder step-up/step-down state transitions (lock at index 0 = full resolution)
      for (const ladderFn of ["VJ", "s_"]) {
        Patcher.instead(
          exports,
          ladderFn,
          (args, orig) => {
            const cfg = state.settings.plugins.ScreenShareBypass;
            if (cfg?.enabled && cfg.disableEncoderThrottling) {
              return { index: 0, downRounds: 0, upRounds: 0, drops: 0, lastStepUp: false };
            }
            return orig(...args);
          },
          `ScreenShareBypass_${ladderFn}`
        );
      }

      // `B$(options)` -> Degradation preference resolver (use "maintain-resolution" to disable JS ladder & WebRTC downscaling)
      Patcher.instead(
        exports,
        "B$",
        (args, orig) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled && cfg.disableEncoderThrottling) {
            return "maintain-resolution";
          }
          return orig(...args);
        },
        "ScreenShareBypass_B$"
      );

      // `ru(params)` -> Builds WebRTC RTCRtpSender `{ degradationPreference, encodings }`
      Patcher.before(
        exports,
        "ru",
        (args) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled && cfg.disableEncoderThrottling && args[0] && typeof args[0] === "object") {
            args[0] = {
              ...args[0],
              frameRateCapped: false,
              ladderRung: null,
              simulcast: false,
            };
          }
          return args;
        },
        "ScreenShareBypass_ru_before"
      );

      Patcher.after(
        exports,
        "ru",
        (args, res) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (!cfg?.enabled || !cfg.disableEncoderThrottling || !res || typeof res !== "object") {
            return res;
          }
          const target = args[0]?.target;
          const spec = getDesiredScreenShareSpec(target?.resolution, target?.frameRate);
          const wantedFps =
            cfg.forceFps && cfg.forceFps !== "picker"
              ? Number(cfg.forceFps)
              : Number(target?.frameRate || spec.frameRate || 60);
          const wantedBitrate = Math.max(
            Number(target?.maxBitrate || 6000000),
            spec.maxBitrate
          );

          res.degradationPreference = "maintain-resolution";
          if (Array.isArray(res.encodings)) {
            res.encodings = res.encodings.map((enc) => {
              const updated = {
                ...enc,
                active: true,
                maxFramerate: wantedFps,
                maxBitrate: wantedBitrate,
                priority: "high",
                networkPriority: "high",
                scaleResolutionDownBy: 1,
              };
              delete updated.scaleResolutionDownTo;
              return updated;
            });
          }
          return res;
        },
        "ScreenShareBypass_ru_after"
      );

      // `$z(res, context, entitled, profile)` -> Resolution entitlement validator
      Patcher.instead(
        exports,
        "$z",
        (args, orig) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled) {
            if (cfg.forceResolution && cfg.forceResolution !== "picker") {
              return cfg.forceResolution;
            }
            const res = args[0];
            if (res === "low_240p") return "low_480p";
            if (RES_DIMENSIONS[res]) return res;
            return "high";
          }
          return orig(...args);
        },
        "ScreenShareBypass_$z"
      );

      // `bk(mode, res, fps, entitled, profile)` -> Mode/preset validator
      // Must use `Patcher.instead` because `bk` internally calls lexical `h(e)` which clamps 120 -> 60!
      Patcher.instead(
        exports,
        "bk",
        (args, orig) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled) {
            const mode = args[0];
            const rawRes =
              cfg.forceResolution && cfg.forceResolution !== "picker"
                ? cfg.forceResolution
                : args[1] === "low_240p"
                  ? "low_480p"
                  : RES_DIMENSIONS[args[1]]
                    ? args[1]
                    : "high";
            const rawFps =
              cfg.forceFps && cfg.forceFps !== "picker"
                ? snapFrameRate(cfg.forceFps)
                : snapFrameRate(Math.max(Number(args[2]) || 30, 15));

            if (
              mode === "screenshare" &&
              (!cfg.forceResolution || cfg.forceResolution === "picker") &&
              (!cfg.forceFps || cfg.forceFps === "picker")
            ) {
              return { resolution: "high", frameRate: 30 };
            }
            if (
              mode === "gaming" &&
              (!cfg.forceResolution || cfg.forceResolution === "picker") &&
              (!cfg.forceFps || cfg.forceFps === "picker")
            ) {
              return { resolution: "high", frameRate: 60 };
            }
            return { resolution: rawRes, frameRate: rawFps };
          }
          return orig(...args);
        },
        "ScreenShareBypass_bk"
      );

      // `bU(options)` -> Main target builder `{ mode, resolution, frameRate, width, height, maxBitrate, ... }`
      Patcher.before(
        exports,
        "bU",
        (args) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled && args[0] && typeof args[0] === "object") {
            args[0] = {
              ...args[0],
              entitled: true,
              profile: { maxHeight: 2160, maxFrameRate: 120 },
              softwareEncoderClamp: false,
              softwareEncoder: false,
            };
            if (cfg.forceResolution && cfg.forceResolution !== "picker") {
              args[0].mode = "custom";
              args[0].storedResolution = cfg.forceResolution;
            }
            if (cfg.forceFps && cfg.forceFps !== "picker") {
              args[0].mode = "custom";
              args[0].storedFrameRate = Number(cfg.forceFps);
            }
          }
          return args;
        },
        "ScreenShareBypass_bU_before"
      );

      Patcher.after(
        exports,
        "bU",
        (args, res) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (!cfg?.enabled || !res || typeof res !== "object") return res;

          const input = args[0] || {};
          const isCustomOrForcedRes =
            input.mode === "custom" || (cfg.forceResolution && cfg.forceResolution !== "picker");
          const isCustomOrForcedFps =
            input.mode === "custom" || (cfg.forceFps && cfg.forceFps !== "picker");

          const wantedRes =
            cfg.forceResolution && cfg.forceResolution !== "picker"
              ? cfg.forceResolution
              : input.storedResolution || res.resolution;
          const wantedFps =
            cfg.forceFps && cfg.forceFps !== "picker"
              ? snapFrameRate(cfg.forceFps)
              : snapFrameRate(input.storedFrameRate || res.frameRate || 60);
          const minBitrate = (Number(cfg.maxBitrateKbps) || 12000) * 1000;

          if (isCustomOrForcedRes && RES_DIMENSIONS[wantedRes]) {
            res.resolution = wantedRes;
            res.rung = wantedRes;
            const dims = RES_DIMENSIONS[wantedRes];
            if (
              wantedRes === "source" &&
              input.sourceDimensions?.width > 0 &&
              input.sourceDimensions?.height > 0
            ) {
              res.width = 2 * Math.max(1, Math.round(input.sourceDimensions.width / 2));
              res.height = 2 * Math.max(1, Math.round(input.sourceDimensions.height / 2));
            } else {
              res.width = dims.width;
              res.height = dims.height;
            }
          }

          if (isCustomOrForcedFps) {
            res.frameRate = wantedFps;
          }

          if (res.frameRate >= 60) {
            res.contentHint = "motion";
          }

          res.maxBitrate = Math.max(res.maxBitrate || 6000000, minBitrate);
          res.tierLimited = false;
          res.softwareEncoderClamped = false;
          if (cfg.disableEncoderThrottling) {
            res.degradationPreference = "maintain-resolution";
          }
          return res;
        },
        "ScreenShareBypass_bU_after"
      );

      // `sj(options)` -> Builds `{ captureOptions, publishOptions }` passed to WebRTC / LiveKit
      Patcher.after(
        exports,
        "sj",
        (args, res) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (!cfg?.enabled || !res || typeof res !== "object") return res;

          const wantedFps =
            cfg.forceFps && cfg.forceFps !== "picker"
              ? snapFrameRate(cfg.forceFps)
              : snapFrameRate(args[0]?.frameRate || res.captureOptions?.resolution?.frameRate || 60);
          const minBitrate = (Number(cfg.maxBitrateKbps) || 12000) * 1000;

          if (res.captureOptions?.resolution) {
            res.captureOptions.resolution.frameRate = wantedFps;
            if (cfg.forceResolution && cfg.forceResolution !== "picker") {
              const dims = RES_DIMENSIONS[cfg.forceResolution];
              if (dims) {
                res.captureOptions.resolution.width = dims.width;
                res.captureOptions.resolution.height = dims.height;
              }
            }
          }
          if (wantedFps >= 60 && res.captureOptions) {
            res.captureOptions.contentHint = "motion";
          }
          if (res.publishOptions?.screenShareEncoding) {
            res.publishOptions.screenShareEncoding.maxFramerate = wantedFps;
            res.publishOptions.screenShareEncoding.maxBitrate = Math.max(
              res.publishOptions.screenShareEncoding.maxBitrate || 6000000,
              minBitrate
            );
            res.publishOptions.screenShareEncoding.priority = "high";
          }
          if (cfg.disableEncoderThrottling && res.publishOptions) {
            res.publishOptions.degradationPreference = "maintain-resolution";
          }
          return res;
        },
        "ScreenShareBypass_sj"
      );

      // `gQ(quality, pick)` -> Computes settings patch when user clicks a resolution/FPS button in the UI
      Patcher.instead(
        exports,
        "gQ",
        (args, orig) => {
          if (state.settings.plugins.ScreenShareBypass?.enabled && args[1]) {
            const quality = args[0] || {};
            const pick = args[1];
            const spec = getDesiredScreenShareSpec(
              quality.storedResolution,
              quality.storedFrameRate
            );
            const nextRes =
              pick.axis === "resolution" && pick.resolution ? pick.resolution : spec.resolution;
            const nextFps =
              pick.axis === "frameRate" && pick.frameRate
                ? snapFrameRate(pick.frameRate)
                : spec.frameRate;
            return {
              streamingMode: "custom",
              screenshareResolution: nextRes,
              videoFrameRate: nextFps,
            };
          }
          return orig(...args);
        },
        "ScreenShareBypass_gQ"
      );
    });

    // 4. Module 857720: ScreenShare Picker & Stream Settings Menu UI Options (`jC`)
    Webpack.onModule(857720, (exports) => {
      if (!exports || exports.__miccordPatched) return;
      exports.__miccordPatched = true;

      Patcher.before(
        exports,
        "jC",
        (args) => {
          if (state.settings.plugins.ScreenShareBypass?.enabled && args[0]?.quality) {
            args[0] = {
              ...args[0],
              showPremiumFeatures: true,
              quality: {
                ...args[0].quality,
                entitled: true,
                profile: { maxHeight: 2160, maxFrameRate: 120 },
              },
            };
          }
          return args;
        },
        "ScreenShareBypass_jC_before"
      );

      Patcher.after(
        exports,
        "jC",
        (args, res) => {
          if (!state.settings.plugins.ScreenShareBypass?.enabled || !res) return res;
          const currentRes = args[0]?.target?.resolution || "high";
          const currentFps = snapFrameRate(args[0]?.target?.frameRate || 60);

          const allRes = ["low_480p", "medium", "high", "ultra", "source"];
          res.resolutions = allRes.map((val) => ({
            value: val,
            premium: false,
            selected: val === currentRes,
            write: {
              kind: "write",
              patch: {
                streamingMode: "custom",
                screenshareResolution: val,
                videoFrameRate: currentFps,
              },
            },
          }));

          const allFps = [15, 30, 60, 90, 120];
          res.frameRates = allFps.map((fps) => ({
            value: fps,
            premium: false,
            selected: fps === currentFps,
            write: {
              kind: "write",
              patch: {
                streamingMode: "custom",
                screenshareResolution: currentRes,
                videoFrameRate: fps,
              },
            },
          }));

          return res;
        },
        "ScreenShareBypass_jC_after"
      );
    });

    // 5. Module 414298: ScreenShare Target Store (`isSoftwareEncoderClamped`, `isFrameRateCapped`, `getLadderRung`)
    Webpack.onModule(414298, (exports) => {
      const targetStore = exports?.A || exports?.default;
      if (!targetStore || targetStore.__miccordPatched) return;
      targetStore.__miccordPatched = true;

      try {
        targetStore.frameRateCapped = false;
        targetStore.ladderRung = null;
        targetStore.softwareEncoderClamped = false;
      } catch {}

      Patcher.instead(
        targetStore,
        "isSoftwareEncoderClamped",
        (args, orig) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled && cfg.disableEncoderThrottling) return false;
          return orig(...args);
        },
        "ScreenShareBypass_NoSoftClamp"
      );

      Patcher.instead(
        targetStore,
        "isFrameRateCapped",
        (args, orig) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled && cfg.disableEncoderThrottling) return false;
          return orig(...args);
        },
        "ScreenShareBypass_NoFpsCap"
      );

      Patcher.instead(
        targetStore,
        "setFrameRateCapped",
        (args, orig) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled && cfg.disableEncoderThrottling) {
            targetStore.frameRateCapped = false;
            return;
          }
          return orig(...args);
        },
        "ScreenShareBypass_SetNoFpsCap"
      );

      Patcher.instead(
        targetStore,
        "getLadderRung",
        (args, orig) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled && cfg.disableEncoderThrottling) return null;
          return orig(...args);
        },
        "ScreenShareBypass_NoLadderRung"
      );

      Patcher.instead(
        targetStore,
        "setLadderRung",
        (args, orig) => {
          const cfg = state.settings.plugins.ScreenShareBypass;
          if (cfg?.enabled && cfg.disableEncoderThrottling) {
            targetStore.ladderRung = null;
            return;
          }
          return orig(...args);
        },
        "ScreenShareBypass_SetNoLadderRung"
      );
    });

    // 6. Module 7854: VoiceEngineV2ScreenShareSupport (`TM`, `tF`)
    Webpack.onModule(7854, (exports) => {
      if (!exports || exports.__miccordPatched) return;
      exports.__miccordPatched = true;

      // `TM()` -> Re-resolves active screen-share target; ensure it always reflects user's current FPS & resolution
      if (typeof exports.TM === "function") {
        Patcher.after(
          exports,
          "TM",
          (args, res) => {
            const cfg = state.settings.plugins.ScreenShareBypass;
            if (!cfg?.enabled || !res || typeof res !== "object") return res;
            const spec = getDesiredScreenShareSpec(res.resolution, res.frameRate);
            res.frameRate = spec.frameRate;
            res.maxBitrate = Math.max(res.maxBitrate || 6000000, spec.maxBitrate);
            if (spec.frameRate >= 60) {
              res.contentHint = "motion";
            }
            if (cfg.disableEncoderThrottling) {
              res.degradationPreference = "maintain-resolution";
              res.softwareEncoderClamped = false;
            }
            return res;
          },
          "ScreenShareBypass_TM"
        );
      }

      // `tF(enabled, publishOptions, callbacks)` -> Builds final LiveKit publishOptions
      if (typeof exports.tF === "function") {
        Patcher.after(
          exports,
          "tF",
          (args, resPromise) => {
            const cfg = state.settings.plugins.ScreenShareBypass;
            if (!cfg?.enabled || !resPromise || typeof resPromise.then !== "function") {
              return resPromise;
            }
            return resPromise.then((res) => {
              if (!res || typeof res !== "object") return res;
              const spec = getDesiredScreenShareSpec();
              res.screenShareEncoding = {
                ...(res.screenShareEncoding || {}),
                maxBitrate: Math.max(
                  Number(res.screenShareEncoding?.maxBitrate || 0),
                  spec.maxBitrate
                ),
                maxFramerate: spec.frameRate,
                priority: "high",
              };
              if (cfg.disableEncoderThrottling) {
                res.degradationPreference = "maintain-resolution";
                res.simulcast = false;
                delete res.screenShareSimulcastLayers;
                if (spec.frameRate > 60) {
                  res.backupCodec = false;
                  delete res.backupCodecPolicy;
                }
              }
              return res;
            });
          },
          "ScreenShareBypass_tF"
        );
      }

      // `Wm({ track, codec, onEncodeFailure, reEnforce })` -> encoder check that Micup starts for
      // every screen share. If the source delivered frames but `framesEncoded` is still 0 it
      // reports "stalled", and Micup either republishes with another codec (dropping the current
      // one for the session) or simply turns the stream off. That fires by mistake when the
      // shared window only starts producing frames at the moment you alt+tab to it (a covered
      // Chrome window doesn't repaint) and the encoder is a frame behind. Confirm before acting.
      if (typeof exports.Wm === "function") {
        const readFramesEncoded = async (sender) => {
          if (!sender || typeof sender.getStats !== "function") return -1;
          try {
            const report = await sender.getStats();
            let total = 0;
            report.forEach((s) => {
              if (
                s.type === "outbound-rtp" &&
                (s.kind === "video" || s.mediaType === "video") &&
                typeof s.framesEncoded === "number"
              ) {
                total += s.framesEncoded;
              }
            });
            return total;
          } catch {
            return -1;
          }
        };

        Patcher.instead(
          exports,
          "Wm",
          (args, orig) => {
            const opts = args[0];
            if (!opts || typeof opts !== "object" || typeof opts.onEncodeFailure !== "function") {
              return orig(...args);
            }
            let cancelled = false;
            const reportFailure = opts.onEncodeFailure;
            const guardedOpts = Object.assign({}, opts, {
              onEncodeFailure: (report) => {
                if (!report || report.reason !== "stalled") return reportFailure(report);
                recordScreenShareEvent("encoder-stall-reported", {
                  codec: report.codec || null,
                  sourceFrames: report.sourceFrames ?? null,
                  sourceFps: report.sourceFramesPerSecond ?? null,
                });
                let attempt = 0;
                const recheck = async () => {
                  if (cancelled) return;
                  attempt += 1;
                  const encoded = await readFramesEncoded(opts.track?.sender);
                  if (cancelled) return;
                  if (encoded > 0) {
                    recordScreenShareEvent("encoder-stall-false-alarm", {
                      codec: report.codec || null,
                      framesEncoded: encoded,
                      attempt,
                    });
                    return;
                  }
                  if (attempt < 3) {
                    setTimeout(recheck, 2500);
                    return;
                  }
                  recordScreenShareEvent("encoder-stall-confirmed", { codec: report.codec || null });
                  reportFailure(report);
                };
                setTimeout(recheck, 2500);
              },
            });
            const cancel = orig(guardedOpts, ...args.slice(1));
            if (typeof cancel !== "function") return cancel;
            return function (...cancelArgs) {
              cancelled = true;
              return cancel.apply(this, cancelArgs);
            };
          },
          "ScreenShare_StallGuard"
        );
      }
    });

    // ------------------------------------------------------------------------
    // F. FakePlus Expression Picker & Permission Hooks (`618349`)
    // ------------------------------------------------------------------------
    Webpack.onModule(618349, (exports) => {
      if (!exports || exports.__miccordPatched) return;
      exports.__miccordPatched = true;

      // oB -> checks whether global expressions feature is enabled
      Patcher.instead(
        exports,
        "oB",
        (args, orig) => {
          if (state.settings.plugins.FakePlus?.enabled) return true;
          return orig(...args);
        },
        "FakePlus_oB"
      );

      // ao -> check custom emoji (returns { canUse, isLockedByPremium, isLockedByPermission })
      Patcher.instead(
        exports,
        "ao",
        (args, orig) => {
          if (state.settings.plugins.FakePlus?.enabled) {
            return { canUse: true, isLockedByPremium: false, isLockedByPermission: false };
          }
          return orig(...args);
        },
        "FakePlus_ao"
      );

      // np -> check emoji full
      Patcher.instead(
        exports,
        "np",
        (args, orig) => {
          if (state.settings.plugins.FakePlus?.enabled) {
            return { canUse: true, isLockedByPremium: false, isLockedByPermission: false };
          }
          return orig(...args);
        },
        "FakePlus_np"
      );

      // hO -> check custom sticker
      Patcher.instead(
        exports,
        "hO",
        (args, orig) => {
          if (state.settings.plugins.FakePlus?.enabled) {
            return { canUse: true, isLockedByPremium: false, isLockedByPermission: false };
          }
          return orig(...args);
        },
        "FakePlus_hO"
      );

      // rq -> filter emojis array
      Patcher.instead(
        exports,
        "rq",
        (args, orig) => {
          if (state.settings.plugins.FakePlus?.enabled && Array.isArray(args[1])) {
            return args[1];
          }
          return orig(...args);
        },
        "FakePlus_rq"
      );

      // MU -> filter stickers array
      Patcher.instead(
        exports,
        "MU",
        (args, orig) => {
          if (state.settings.plugins.FakePlus?.enabled && Array.isArray(args[1])) {
            return args[1];
          }
          return orig(...args);
        },
        "FakePlus_MU"
      );

      // lC & WV -> locked badges/upsells
      Patcher.instead(
        exports,
        "lC",
        (args, orig) => {
          if (state.settings.plugins.FakePlus?.enabled) return false;
          return orig(...args);
        },
        "FakePlus_lC"
      );

      Patcher.instead(
        exports,
        "WV",
        (args, orig) => {
          if (state.settings.plugins.FakePlus?.enabled) return false;
          return orig(...args);
        },
        "FakePlus_WV"
      );
    });

    // ------------------------------------------------------------------------
    // G. VolumeBooster Hooks (`685161`, `468258`, `496416`)
    // ------------------------------------------------------------------------

    // 1. Module 685161: Volume calculation & sanitization math
    Webpack.onModule(685161, (exports) => {
      if (!exports || exports.__miccordPatched) return;
      exports.__miccordPatched = true;

      const getMaxVol = () => {
        const mult = Number(state.settings.plugins.VolumeBooster?.maxMultiplier) || 200;
        return Math.max(100, Math.min(300, mult));
      };

      // DD(e): slider value clamp (unlock > 100 up to maxMultiplier)
      Patcher.instead(
        exports,
        "DD",
        (args, orig) => {
          if (state.settings.plugins.VolumeBooster?.enabled) {
            const e = args[0];
            const max = getMaxVol();
            return Number.isFinite(e) ? Math.max(0, Math.min(max, e)) : 100;
          }
          return orig(...args);
        },
        "VolumeBooster_DD"
      );

      // Jv(e): volume sanitizer (previously clamped anything > 100 down to 100!)
      Patcher.instead(
        exports,
        "Jv",
        (args, orig) => {
          if (state.settings.plugins.VolumeBooster?.enabled) {
            const e = args[0];
            const max = getMaxVol();
            return !Number.isFinite(e) || e <= max ? e : max;
          }
          return orig(...args);
        },
        "VolumeBooster_Jv"
      );

      // xh(e): sanitizes saved participant volumes dictionary without dropping values > 100
      Patcher.instead(
        exports,
        "xh",
        (args, orig) => {
          if (state.settings.plugins.VolumeBooster?.enabled) {
            const volumes = args[0];
            if (!volumes || typeof volumes !== "object") return volumes;
            const max = getMaxVol();
            const entries = Object.entries(volumes);
            return Object.fromEntries(
              entries.map(([k, v]) => [k, Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 100])
            );
          }
          return orig(...args);
        },
        "VolumeBooster_xh"
      );
    });

    // 2. Module 468258: Participant Volume Slider component in action menus & voice overlay
    Webpack.onModule(468258, (exports) => {
      if (!exports || exports.__miccordPatched) return;
      exports.__miccordPatched = true;

      Patcher.before(
        exports,
        "C",
        (args) => {
          if (state.settings.plugins.VolumeBooster?.enabled && args[0] && typeof args[0] === "object") {
            if (args[0].maxValue === 200) {
              const max = Number(state.settings.plugins.VolumeBooster?.maxMultiplier) || 200;
              args[0].maxValue = max;
            }
          }
          return args;
        },
        "VolumeBooster_SliderMax"
      );
    });

    // 3. Module 496416: LiveKit RemoteAudioTrack (EQ) WebAudio Gain & Amplification
    Webpack.onModule(496416, (exports) => {
      const RemoteAudioTrack = exports?.EQ;
      if (!RemoteAudioTrack || !RemoteAudioTrack.prototype || RemoteAudioTrack.prototype.__miccordPatched) return;
      RemoteAudioTrack.prototype.__miccordPatched = true;

      const origSetVolume = RemoteAudioTrack.prototype.setVolume;
      RemoteAudioTrack.prototype.setVolume = function (vol) {
        if (state.settings.plugins.VolumeBooster?.enabled) {
          try {
            if (!this.audioContext) {
              const AudioCtx = window.AudioContext || window.webkitAudioContext;
              if (AudioCtx) {
                if (!window.__miccordSharedAudioCtx || window.__miccordSharedAudioCtx.state === "closed") {
                  window.__miccordSharedAudioCtx = new AudioCtx();
                }
                const ctx = window.__miccordSharedAudioCtx;
                if (ctx.state === "suspended") {
                  ctx.resume().catch(() => {});
                }
                this.setAudioContext(ctx);
              }
            }
          } catch (err) {
            console.warn("[Miccord] VolumeBooster setAudioContext error:", err);
          }
        }
        return origSetVolume.call(this, vol);
      };
    });
  }

  // ==========================================================================
  // 8. React UI Components (Rendered both inside UserSettingsModal & Standalone Modal)
  // ==========================================================================
  // One stable component per tab: a fresh function on every lookup would make React remount
  // the whole settings page (losing scroll and input state) each time Micup re-renders.
  const miccordTabComponents = new Map();
  function getMiccordTabComponent(tabType) {
    if (!miccordTabComponents.has(tabType)) {
      miccordTabComponents.set(tabType, createMiccordSettingsComponent(tabType));
    }
    return miccordTabComponents.get(tabType);
  }

  function createMiccordSettingsComponent(initialTabType = "miccord_dashboard") {
    return function MiccordSettingsView(props) {
      const React = getReact();
      if (!React) return null;

      const h = React.createElement;
      const [activeSubTab, setActiveSubTab] = React.useState(props?.settingsTabType || initialTabType);
      const [, forceRender] = React.useReducer((x) => x + 1, 0);
      const [searchQuery, setSearchQuery] = React.useState("");
      const [catFilter, setCatFilter] = React.useState("ALL");
      const [rspackQuery, setRspackQuery] = React.useState("");
      const [evalInput, setEvalInput] = React.useState("Miccord.Webpack.getModule(978111)?.A?.getCurrentUser()");
      const [evalOutput, setEvalOutput] = React.useState("");

      React.useEffect(() => {
        if (props?.settingsTabType && props.settingsTabType.startsWith("miccord_")) {
          setActiveSubTab(props.settingsTabType);
        }
      }, [props?.settingsTabType]);

      React.useEffect(() => {
        state.uiListeners.add(forceRender);
        return () => state.uiListeners.delete(forceRender);
      }, []);

      const enabledCount = Object.values(state.settings.plugins).filter((p) => p?.enabled).length;
      const totalModules = Object.keys(Webpack.factories || {}).length;
      const loadedModules = Object.keys(Webpack.cache || {}).length;

      // Helper to toggle a plugin
      const onTogglePlugin = (pluginId) => {
        const cur = state.settings.plugins[pluginId] || {};
        cur.enabled = !cur.enabled;
        state.settings.plugins[pluginId] = cur;
        saveSettings();
        syncStoreBasedPlugins();
        showToast(
          `Plugin ${pluginId}: ${cur.enabled ? "Ativado" : "Desativado"}`,
          cur.enabled ? "success" : "info"
        );
      };

      // Helper to update a plugin sub-setting
      const onUpdatePluginSetting = (pluginId, key, val) => {
        if (!state.settings.plugins[pluginId]) state.settings.plugins[pluginId] = { enabled: true };
        state.settings.plugins[pluginId][key] = val;
        saveSettings();
        syncStoreBasedPlugins();
      };

      // Sub-navigation Header
      const renderHeroAndSubnav = () =>
        h(
          React.Fragment,
          null,
          h(
            "div",
            { className: "miccord-hero" },
            h(
              "div",
              { className: "miccord-hero-left" },
              h(
                "h2",
                { className: "miccord-hero-title" },
                svgIconReact("zap", 18, { strokeWidth: 2.2 }),
                "Better MicUP",
                h("span", { style: { fontSize: "12px", color: "var(--miccord-text-muted)", fontWeight: "500", marginLeft: "6px" } }, "Client Mod & Motor de Plugins"),
                h("span", { className: "miccord-badge-pill" }, `v${VERSION}`)
              ),
              h(
                "p",
                { className: "miccord-hero-sub" },
                "Fica em Configurações do Micup › Better MicUP (atalho opcional: Ctrl+Shift+M)."
              )
            ),
            h(
              "div",
              { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
              h(
                "button",
                {
                  className: "miccord-btn",
                  onClick: () => window.flx?.devtools?.open?.(),
                },
                svgIconReact("terminal", 13),
                "DevTools (F12)"
              ),
              h(
                "button",
                {
                  className: "miccord-btn primary",
                  onClick: () => location.reload(),
                },
                svgIconReact("refresh", 13),
                "Recarregar UI"
              )
            )
          ),
          h(
            "div",
            { className: "miccord-subnav" },
            [
              { id: "miccord_dashboard", label: "Visão Geral", icon: "grid" },
              { id: "miccord_plugins", label: `Plugins (${enabledCount}/${PLUGIN_DEFINITIONS.length})`, icon: "package" },
              { id: "miccord_themes", label: "Temas & QuickCSS", icon: "palette" },
              { id: "miccord_msglogger", label: `Message Logger (${state.messageLogs.length})`, icon: "history" },
              { id: "miccord_devtools", label: "DevTools & Rspack", icon: "terminal" },
            ].map((tab) =>
              h(
                "button",
                {
                  key: tab.id,
                  className: `miccord-subnav-btn ${activeSubTab === tab.id ? "active" : ""}`,
                  onClick: () => setActiveSubTab(tab.id),
                },
                svgIconReact(tab.icon, 13),
                tab.label
              )
            )
          )
        );

      // ----------------------------------------------------------------------
      // Tab 1: Dashboard
      // ----------------------------------------------------------------------
      const renderDashboard = () => {
        return h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "18px" } },
          h(
            "div",
            { className: "miccord-stats-row" },
            h(
              "div",
              { className: "miccord-stat-card" },
              h("span", { className: "miccord-stat-value" }, `${enabledCount} / ${PLUGIN_DEFINITIONS.length}`),
              h("span", { className: "miccord-stat-label" }, "Plugins Ativos")
            ),
            h(
              "div",
              { className: "miccord-stat-card" },
              h(
                "span",
                { className: "miccord-stat-value" },
                PRESET_THEMES.find((t) => t.id === state.settings.activeTheme)?.name || "Padrão"
              ),
              h("span", { className: "miccord-stat-label" }, "Tema Ativo")
            ),
            h(
              "div",
              { className: "miccord-stat-card" },
              h("span", { className: "miccord-stat-value" }, `${state.messageLogs.length}`),
              h("span", { className: "miccord-stat-label" }, "Mensagens Capturadas")
            ),
            h(
              "div",
              { className: "miccord-stat-card" },
              h("span", { className: "miccord-stat-value" }, `${loadedModules} / ${totalModules}`),
              h("span", { className: "miccord-stat-label" }, "Módulos Rspack Carregados")
            )
          ),

          // macOS System Status Overview Card
          h(
            "div",
            { className: "miccord-plugin-card enabled" },
            h(
              "div",
              { className: "miccord-plugin-header" },
              h(
                "div",
                { className: "miccord-plugin-title-wrap" },
                h(
                  "div",
                  { className: "miccord-plugin-name" },
                  svgIconReact("shield", 15),
                  "Status do Sistema & Modificações Ativas",
                  h("span", { className: "miccord-badge-pill" }, "OPERACIONAL")
                ),
                h(
                  "div",
                  { className: "miccord-plugin-author" },
                  "Better MicUP Black Obsidian em execução no Micup Desktop"
                )
              )
            ),
            h(
              "div",
              { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px", marginTop: "8px" } },
              h(
                "div",
                { style: { padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--miccord-border)", borderRadius: "8px" } },
                h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", fontSize: "12.5px", color: "#fff", marginBottom: "4px" } },
                  svgIconReact("monitor", 14),
                  "ScreenShare Plus Bypass"
                ),
                h("div", { style: { fontSize: "11.5px", color: "var(--miccord-text-muted)", lineHeight: "1.4" } },
                  "Desbloqueado nativamente no app. Escolha qualquer qualidade ou FPS no seletor do Micup com bitrate desimpedido e Anti-Clamp automático."
                )
              ),
              h(
                "div",
                { style: { padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--miccord-border)", borderRadius: "8px" } },
                h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", fontSize: "12.5px", color: "#fff", marginBottom: "4px" } },
                  svgIconReact("shieldCheck", 14),
                  "NoTrack & Privacidade"
                ),
                h("div", { style: { fontSize: "11.5px", color: "var(--miccord-text-muted)", lineHeight: "1.4" } },
                  "Telemetria, analytics e relatórios de uso bloqueados no nível de rede e store interna."
                )
              ),
              h(
                "div",
                { style: { padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--miccord-border)", borderRadius: "8px" } },
                h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", fontSize: "12.5px", color: "#fff", marginBottom: "4px" } },
                  svgIconReact("history", 14),
                  "Message Logger"
                ),
                h("div", { style: { fontSize: "11.5px", color: "var(--miccord-text-muted)", lineHeight: "1.4" } },
                  "Mensagens excluídas e histórico de edições preservados em memória segura com selo visual no chat."
                )
              ),
              h(
                "div",
                { style: { padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--miccord-border)", borderRadius: "8px" } },
                h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", fontSize: "12.5px", color: "#fff", marginBottom: "4px" } },
                  svgIconReact("terminal", 14),
                  "Developer Engine & F12"
                ),
                h("div", { style: { fontSize: "11.5px", color: "var(--miccord-text-muted)", lineHeight: "1.4" } },
                  "Atalhos F12 (DevTools) e Ctrl+Shift+M (Better MicUP) habilitados. Rspack interceptado com sucesso."
                )
              ),
              h(
                "div",
                { style: { padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--miccord-border)", borderRadius: "8px" } },
                h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", fontSize: "12.5px", color: "#fff", marginBottom: "4px" } },
                  svgIconReact("volume2", 14),
                  "Volume Individual Amplificado"
                ),
                h("div", { style: { fontSize: "11.5px", color: "var(--miccord-text-muted)", lineHeight: "1.4" } },
                  "Amplificação de até 200% para participantes baixos via WebAudio GainNode nativo com zero clipping."
                )
              ),
              h(
                "div",
                { style: { padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--miccord-border)", borderRadius: "8px" } },
                h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", fontSize: "12.5px", color: "#fff", marginBottom: "4px" } },
                  svgIconReact("smile", 14),
                  "Fake Plus & Emotes Livres"
                ),
                h("div", { style: { fontSize: "11.5px", color: "var(--miccord-text-muted)", lineHeight: "1.4" } },
                  "Emojis customizados e stickers liberados globalmente sem necessidade de assinatura Plus."
                )
              ),
              h(
                "div",
                { style: { padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--miccord-border)", borderRadius: "8px" } },
                h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: "600", fontSize: "12.5px", color: "#fff", marginBottom: "4px" } },
                  svgIconReact("shield", 14),
                  "Auto-Patcher & Persistência"
                ),
                h("div", { style: { fontSize: "11.5px", color: "var(--miccord-text-muted)", lineHeight: "1.4" } },
                  "Guardião em segundo plano ativo: monitora atualizações OTA do Micup e reaplica o Better MicUP automaticamente em milissegundos."
                )
              )
            )
          ),

          // Export / Import Backup Card
          h(
            "div",
            { className: "miccord-plugin-card" },
            h(
              "div",
              { className: "miccord-plugin-name" },
              svgIconReact("copy", 15),
              "Backup & Restauração de Configurações"
            ),
            h(
              "p",
              { className: "miccord-plugin-desc" },
              "Exporte seus plugins, temas e QuickCSS para a área de transferência ou restaure a configuração padrão."
            ),
            h(
              "div",
              { style: { display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "8px" } },
              h(
                "button",
                {
                  className: "miccord-btn primary",
                  onClick: () => {
                    navigator.clipboard?.writeText(JSON.stringify(state.settings, null, 2));
                    showToast("Configurações do Better MicUP copiadas para a área de transferência!", "success");
                  },
                },
                svgIconReact("copy", 13),
                "Copiar JSON de Configuração"
              ),
              h(
                "button",
                {
                  className: "miccord-btn danger",
                  onClick: () => {
                    state.settings = structuredClone(DEFAULT_SETTINGS);
                    saveSettings();
                    syncStoreBasedPlugins();
                    showToast("Configurações restauradas para o padrão!", "info");
                  },
                },
                svgIconReact("rotateCcw", 13),
                "Restaurar Padrões"
              )
            )
          )
        );
      };

      // ----------------------------------------------------------------------
      // Tab 2: Plugins Grid
      // ----------------------------------------------------------------------
      const renderPlugins = () => {
        const categories = ["ALL", ...new Set(PLUGIN_DEFINITIONS.map((p) => p.category))];
        const filtered = PLUGIN_DEFINITIONS.filter((p) => {
          const matchesCat = catFilter === "ALL" || p.category === catFilter;
          const q = searchQuery.trim().toLowerCase();
          const matchesSearch =
            !q ||
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q);
          return matchesCat && matchesSearch;
        });

        return h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "16px" } },
          h(
            "div",
            { className: "miccord-toolbar" },
            h("input", {
              className: "miccord-search-input",
              placeholder: "Pesquisar plugins por nome, função ou categoria...",
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
            }),
            h(
              "div",
              { className: "miccord-filter-group" },
              categories.map((cat) =>
                h(
                  "button",
                  {
                    key: cat,
                    className: `miccord-btn ${catFilter === cat ? "primary" : ""}`,
                    onClick: () => setCatFilter(cat),
                  },
                  cat === "ALL" ? "Todos" : cat
                )
              )
            )
          ),
          h(
            "div",
            { className: "miccord-plugin-grid" },
            filtered.map((plugin) => {
              const pState = state.settings.plugins[plugin.id] || { enabled: false };
              const isEnabled = Boolean(pState.enabled);

              return h(
                "div",
                {
                  key: plugin.id,
                  className: `miccord-plugin-card ${isEnabled ? "enabled" : ""}`,
                },
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                  h(
                    "div",
                    { className: "miccord-plugin-header" },
                    h(
                      "div",
                      { className: "miccord-plugin-title-wrap" },
                      h(
                        "div",
                        { className: "miccord-plugin-name" },
                        plugin.name,
                        h("span", { className: "miccord-plugin-tag" }, plugin.category)
                      ),
                      h("span", { className: "miccord-plugin-author" }, `por ${plugin.author}`)
                    ),
                    h(
                      "button",
                      {
                        className: `miccord-switch ${isEnabled ? "checked" : ""}`,
                        onClick: () => onTogglePlugin(plugin.id),
                        title: isEnabled ? "Desativar Plugin" : "Ativar Plugin",
                      },
                      h("span", { className: "miccord-switch-thumb" })
                    )
                  ),
                  h("p", { className: "miccord-plugin-desc" }, plugin.description),

                  // Render inline settings if plugin has schema and is enabled
                  isEnabled &&
                    plugin.settingsSchema &&
                    plugin.settingsSchema.length > 0 &&
                    h(
                      "div",
                      { className: "miccord-plugin-settings" },
                      plugin.settingsSchema.map((field) =>
                        h(
                          "div",
                          { key: field.key, className: "miccord-setting-row" },
                          h("span", null, field.label),
                          field.type === "boolean"
                            ? h(
                                "button",
                                {
                                  className: `miccord-switch ${pState[field.key] ? "checked" : ""}`,
                                  onClick: () => onUpdatePluginSetting(plugin.id, field.key, !pState[field.key]),
                                },
                                h("span", { className: "miccord-switch-thumb" })
                              )
                            : field.type === "select"
                            ? h(
                                "select",
                                {
                                  className: "miccord-setting-select",
                                  value: pState[field.key] ?? "",
                                  onChange: (e) => onUpdatePluginSetting(plugin.id, field.key, e.target.value),
                                },
                                field.options.map((opt) =>
                                  h(
                                    "option",
                                    {
                                      key: opt.value,
                                      value: opt.value,
                                      style: { backgroundColor: "#18181c", color: "#ffffff" },
                                    },
                                    opt.label
                                  )
                                )
                              )
                            : h("input", {
                                className: "miccord-setting-input",
                                type: "text",
                                value: pState[field.key] ?? "",
                                onChange: (e) => onUpdatePluginSetting(plugin.id, field.key, e.target.value),
                              })
                        )
                      )
                    )
                )
              );
            })
          )
        );
      };

      // ----------------------------------------------------------------------
      // Tab 3: Themes & QuickCSS
      // ----------------------------------------------------------------------
      const renderThemes = () =>
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "20px" } },
          h(
            "div",
            null,
            h("h3", { style: { margin: "0 0 12px 0", fontSize: "15px", color: "#fff", display: "flex", alignItems: "center", gap: "8px" } }, svgIconReact("palette", 16), "Temas Integrados"),
            h(
              "div",
              { className: "miccord-theme-grid" },
              PRESET_THEMES.map((theme) => {
                const isActive = state.settings.activeTheme === theme.id;
                return h(
                  "div",
                  {
                    key: theme.id,
                    className: `miccord-theme-card ${isActive ? "active" : ""}`,
                    onClick: () => {
                      state.settings.activeTheme = theme.id;
                      saveSettings();
                      showToast(`Tema aplicado: ${theme.name}`, "success");
                    },
                  },
                  h(
                    "div",
                    {
                      className: "miccord-theme-preview",
                      style: {
                        background: `linear-gradient(135deg, ${theme.colors[0]} 0%, ${theme.colors[1]} 65%, ${theme.colors[2]} 100%)`,
                      },
                    },
                    theme.colors.map((c, idx) =>
                      h("span", {
                        key: idx,
                        className: "miccord-theme-swatch",
                        style: { background: c },
                      })
                    )
                  ),
                  h(
                    "div",
                    { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                    h("strong", { style: { fontSize: "13.5px", color: "#fff" } }, theme.name),
                    isActive && h("span", { className: "miccord-badge-pill" }, "ATIVO")
                  ),
                  h("p", { className: "miccord-plugin-desc", style: { fontSize: "11.5px" } }, theme.desc)
                );
              })
            )
          ),

          // Live QuickCSS Editor
          h(
            "div",
            { className: "miccord-plugin-card" },
            h(
              "div",
              { className: "miccord-plugin-header" },
              h(
                "div",
                { className: "miccord-plugin-title-wrap" },
                h(
                  "div",
                  { className: "miccord-plugin-name" },
                  svgIconReact("code", 16),
                  "Editor QuickCSS em Tempo Real"
                ),
                h(
                  "div",
                  { className: "miccord-plugin-author" },
                  "Qualquer regra CSS digitada abaixo é aplicada instantaneamente ao Micup"
                )
              ),
              h(
                "button",
                {
                  className: `miccord-switch ${state.settings.quickCssEnabled ? "checked" : ""}`,
                  onClick: () => {
                    state.settings.quickCssEnabled = !state.settings.quickCssEnabled;
                    saveSettings();
                  },
                },
                h("span", { className: "miccord-switch-thumb" })
              )
            ),
            h("textarea", {
              className: "miccord-css-editor",
              value: state.settings.quickCss || "",
              placeholder: "/* Exemplo: body { font-family: 'JetBrains Mono', monospace !important; } */",
              onChange: (e) => {
                state.settings.quickCss = e.target.value;
                saveSettings();
              },
            }),
            h(
              "div",
              { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
              h(
                "button",
                {
                  className: "miccord-btn",
                  onClick: () => {
                    state.settings.quickCss =
                      "/* Miccord QuickCSS — Black Obsidian */\nimg[class*='avatar'] { border-radius: 8px !important; }\n";
                    saveSettings();
                    showToast("Snippet de exemplo inserido no QuickCSS!", "info");
                  },
                },
                svgIconReact("code", 13),
                "Inserir Snippet de Exemplo"
              ),
              h(
                "button",
                {
                  className: "miccord-btn danger",
                  onClick: () => {
                    state.settings.quickCss = "";
                    saveSettings();
                  },
                },
                svgIconReact("eraser", 13),
                "Limpar QuickCSS"
              )
            )
          )
        );

      // ----------------------------------------------------------------------
      // Tab 4: Message Logger History
      // ----------------------------------------------------------------------
      const renderMessageLogger = () => {
        const channelStore = Webpack.getModule(811383)?.default;
        const guildStore = Webpack.getModule(246151)?.default;

        return h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "14px" } },
          h(
            "div",
            { className: "miccord-toolbar" },
            h(
              "div",
              { style: { fontSize: "12.5px", color: "var(--miccord-text-muted)", display: "flex", alignItems: "center", gap: "6px" } },
              svgIconReact("history", 14),
              `Total registrado: ${state.messageLogs.length} eventos (mensagens apagadas e edições)`
            ),
            h(
              "div",
              { style: { display: "flex", gap: "8px" } },
              h(
                "button",
                {
                  className: "miccord-btn",
                  onClick: () => {
                    navigator.clipboard?.writeText(JSON.stringify(state.messageLogs, null, 2));
                    showToast("Logs exportados para a área de transferência!", "success");
                  },
                },
                svgIconReact("copy", 13),
                "Exportar JSON"
              ),
              h(
                "button",
                {
                  className: "miccord-btn danger",
                  onClick: () => {
                    state.messageLogs = [];
                    saveMessageLogs();
                    showToast("Histórico do MessageLogger limpo!", "info");
                  },
                },
                svgIconReact("trash", 13),
                "Limpar Histórico"
              )
            )
          ),

          state.messageLogs.length === 0
            ? h(
                "div",
                {
                  className: "miccord-plugin-card",
                  style: { textAlign: "center", padding: "36px", color: "#9ca3af" },
                },
                "Nenhuma mensagem apagada ou editada foi capturada ainda nesta sessão. O MessageLogger está monitorando em segundo plano!"
              )
            : h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                state.messageLogs.map((entry) => {
                  const ch = channelStore?.getChannel?.(entry.channelId);
                  const guild = entry.guildId ? guildStore?.getGuild?.(entry.guildId) : null;
                  const locationLabel = guild
                    ? `${guild.name} #${ch?.name || entry.channelId}`
                    : ch?.name
                    ? `#${ch.name}`
                    : `Canal ${entry.channelId}`;

                  return h(
                    "div",
                    {
                      key: entry.id,
                      className:
                        entry.type === "deleted" ? "miccord-msg-deleted-card" : "miccord-msg-edited-card",
                    },
                    h(
                      "div",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "12px",
                          color: "var(--miccord-text-secondary)",
                        },
                      },
                      h(
                        "div",
                        { style: { display: "flex", alignItems: "center", gap: "7px" } },
                        h(
                          "span",
                          {
                            className: entry.type === "deleted" ? "miccord-badge-deleted" : "miccord-badge-edited",
                          },
                          entry.type === "deleted" ? "APAGADA" : "EDITADA"
                        ),
                        h("strong", { style: { color: "#ffffff" } }, `@${entry.author?.username || "usuário"}`),
                        h("span", { style: { color: "var(--miccord-text-faint)" } }, `— ${locationLabel}`)
                      ),
                      h("span", { style: { fontFamily: "var(--miccord-font-mono)", fontSize: "11px", color: "var(--miccord-text-faint)" } }, new Date(entry.timestamp).toLocaleTimeString())
                    ),
                    entry.type === "edited" &&
                      entry.oldContent &&
                      h(
                        "div",
                        { style: { fontSize: "12px", color: "#fca5a5", textDecoration: "line-through" } },
                        `Antes: ${entry.oldContent}`
                      ),
                    h(
                      "div",
                      { style: { fontSize: "13px", color: "#ffffff", whiteSpace: "pre-wrap" } },
                      entry.content || "(Sem texto / Apenas anexo)"
                    ),
                    Array.isArray(entry.attachments) &&
                      entry.attachments.length > 0 &&
                      h(
                        "div",
                        { style: { fontSize: "11.5px", color: "var(--miccord-text-muted)" } },
                        entry.attachments.map((a, i) =>
                          h(
                            "a",
                            {
                              key: i,
                              href: a.url,
                              target: "_blank",
                              rel: "noreferrer",
                              style: { display: "inline-flex", alignItems: "center", gap: "4px", marginRight: "10px", color: "#e4e4e7" },
                            },
                            svgIconReact("paperclip", 12),
                            a.filename || a.url
                          )
                        )
                      )
                  );
                })
              )
        );
      };

      // ----------------------------------------------------------------------
      // Tab 5: Rspack Module Explorer & DevTools Console
      // ----------------------------------------------------------------------
      const renderDevTools = () => {
        const q = rspackQuery.trim().toLowerCase();
        const matchingModules = [];
        if (Webpack.wreq?.m) {
          for (const [id, factory] of Object.entries(Webpack.wreq.m)) {
            if (matchingModules.length >= 40) break;
            const loadedExp = Webpack.wreq.c?.[id]?.exports;
            const keys = loadedExp && typeof loadedExp === "object" ? Object.keys(loadedExp) : [];
            const defaultKeys =
              loadedExp?.default && typeof loadedExp.default === "object"
                ? Object.keys(loadedExp.default)
                : loadedExp?.A && typeof loadedExp.A === "object"
                ? Object.keys(loadedExp.A)
                : [];
            const allKeysStr = [...keys, ...defaultKeys].join(", ");

            if (
              !q ||
              id.toLowerCase().includes(q) ||
              allKeysStr.toLowerCase().includes(q) ||
              Function.prototype.toString.call(factory).toLowerCase().includes(q)
            ) {
              matchingModules.push({
                id,
                loaded: Boolean(Webpack.wreq.c?.[id]),
                keys: allKeysStr || "(função / primitivo)",
              });
            }
          }
        }

        return h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "18px" } },
          // Interactive JS Eval Box
          h(
            "div",
            { className: "miccord-plugin-card" },
            h(
              "div",
              { className: "miccord-plugin-name" },
              svgIconReact("terminal", 15),
              "Console de Inspeção Runtime (Miccord API)"
            ),
            h("input", {
              className: "miccord-search-input",
              style: { fontFamily: "monospace", marginTop: "6px" },
              value: evalInput,
              onChange: (e) => setEvalInput(e.target.value),
            }),
            h(
              "div",
              { style: { display: "flex", gap: "8px", marginTop: "6px" } },
              h(
                "button",
                {
                  className: "miccord-btn primary",
                  onClick: () => {
                    try {
                      const fn = new Function("Miccord", `return (${evalInput});`);
                      const res = fn(window.Miccord);
                      setEvalOutput(
                        typeof res === "object" ? JSON.stringify(res, null, 2) : String(res)
                      );
                    } catch (err) {
                      setEvalOutput(`Erro: ${err.message}`);
                    }
                  },
                },
                svgIconReact("play", 13),
                "Executar Expressão"
              ),
              h(
                "button",
                {
                  className: "miccord-btn",
                  onClick: () => window.flx?.devtools?.open?.(),
                },
                svgIconReact("terminal", 13),
                "Abrir Chromium DevTools"
              )
            ),
            evalOutput &&
              h(
                "pre",
                {
                  style: {
                    background: "#050507",
                    border: "1px solid var(--miccord-border)",
                    padding: "12px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#4ade80",
                    fontFamily: "var(--miccord-font-mono)",
                    maxHeight: "200px",
                    overflow: "auto",
                    margin: "6px 0 0 0",
                  },
                },
                evalOutput
              )
          ),

          // Rspack Module Searcher
          h(
            "div",
            { className: "miccord-plugin-card" },
            h(
              "div",
              { className: "miccord-plugin-name" },
              svgIconReact("package", 15),
              `Explorador de Módulos Rspack (${loadedModules} carregados de ${totalModules})`
            ),
            h("input", {
              className: "miccord-search-input",
              placeholder: "Pesquisar por ID do módulo (ex: 634368), export ou trecho de código...",
              value: rspackQuery,
              onChange: (e) => setRspackQuery(e.target.value),
            }),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  maxHeight: "300px",
                  overflowY: "auto",
                  marginTop: "8px",
                },
              },
              matchingModules.map((m) =>
                h(
                  "div",
                  {
                    key: m.id,
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      background: "var(--miccord-bg-surface-2)",
                      border: "1px solid var(--miccord-border)",
                      borderRadius: "6px",
                      fontSize: "12px",
                    },
                  },
                  h(
                    "div",
                    null,
                    h("strong", { style: { color: "#ffffff", fontFamily: "var(--miccord-font-mono)" } }, `Módulo #${m.id} `),
                    h(
                      "span",
                      { style: { color: m.loaded ? "var(--miccord-success)" : "var(--miccord-text-faint)", fontSize: "11px", fontWeight: "600" } },
                      m.loaded ? "[Carregado]" : "[Lazy]"
                    ),
                    h("div", { style: { color: "var(--miccord-text-muted)", fontSize: "11px" } }, `Exports: ${m.keys}`)
                  ),
                  h(
                    "button",
                    {
                      className: "miccord-btn",
                      onClick: () => {
                        const mod = Webpack.getModule(m.id);
                        console.log(`[Miccord] Módulo #${m.id}:`, mod);
                        showToast(`Módulo #${m.id} enviado ao console (F12)!`, "info");
                      },
                    },
                    svgIconReact("terminal", 12),
                    "Log no Console"
                  )
                )
              )
            )
          )
        );
      };

      return h(
        "div",
        { className: "miccord-root" },
        renderHeroAndSubnav(),
        activeSubTab === "miccord_dashboard" && renderDashboard(),
        activeSubTab === "miccord_plugins" && renderPlugins(),
        activeSubTab === "miccord_themes" && renderThemes(),
        activeSubTab === "miccord_msglogger" && renderMessageLogger(),
        activeSubTab === "miccord_devtools" && renderDevTools()
      );
    };
  }

  // ==========================================================================
  // 9. Standalone Overlay Modal (`Ctrl+Shift+M`), Floating Pill & Lightbox DOM
  // ==========================================================================
  let floatingWidgetEl = null;
  let standaloneModalEl = null;
  let lightboxEl = null;

  function formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  }

  function openMiccordSettingsModal(initialTab = "miccord_dashboard") {
    state.modalTab = initialTab;

    // Our tabs only exist inside Micup's settings when the tab resolver could be hooked.
    if (!settingsResolverPatched) {
      toggleStandaloneModal(true, initialTab);
      return;
    }

    // 1. Abre diretamente o UserSettingsModal nativo do Micup na aba do Better MicUP!
    try {
      const modalMod = Webpack.findByProps("push", "modal") || Webpack.getModule(876048);
      // UserSettingsModal moved from `629878` (1.0.17) to `827605` (1.0.21).
      const settingsMod = [
        Webpack.findByProps("UserSettingsModal"),
        Webpack.getModule(827605, true),
        Webpack.getModule(629878, true),
      ].find((m) => typeof m?.UserSettingsModal === "function");
      const React = getReact();
      if (modalMod && settingsMod && React) {
        modalMod.push(
          (0, modalMod.modal)(() =>
            React.createElement(settingsMod.UserSettingsModal, {
              initialTab: initialTab,
              "data-flx": "miccord.user-settings-modal",
            })
          )
        );
        return;
      }
    } catch (e) {
      console.warn("[Miccord] Falha ao abrir modal nativo de configurações:", e);
    }

    // 2. Fallback: Clicar no botão nativo da engrenagem ⚙ de configurações no canto inferior esquerdo
    const gearBtn = document.querySelector('button[aria-label*="Configurações"], button[aria-label*="Settings"], button[aria-label*="Setting"], button[data-flx*="settings"]');
    if (gearBtn) {
      gearBtn.click();
      setTimeout(() => {
        const tabEl = document.querySelector(`#settings-tab-${initialTab}, [data-tab-id="${initialTab}"], [aria-label*="Better MicUP"]`);
        if (tabEl) tabEl.click();
      }, 80);
      return;
    }

    // 3. Fallback adicional se não estiver em tela de chat/servidor
    toggleStandaloneModal(true, initialTab);
  }

  function toggleStandaloneModal(forceState, tab = "miccord_dashboard") {
    state.modalOpen = typeof forceState === "boolean" ? forceState : !state.modalOpen;
    state.modalTab = tab;

    if (!state.modalOpen) {
      if (standaloneModalEl) {
        standaloneModalEl.remove();
        standaloneModalEl = null;
      }
      return;
    }

    if (!standaloneModalEl) {
      standaloneModalEl = document.createElement("div");
      standaloneModalEl.className = "miccord-modal-backdrop";
      standaloneModalEl.addEventListener("click", (e) => {
        if (e.target === standaloneModalEl) toggleStandaloneModal(false);
      });
      document.body.appendChild(standaloneModalEl);
    }

    // Mount our React component inside standaloneModalEl or render pure DOM fallback if React isn't loaded yet
    renderStandaloneModalContent();
  }

  function renderStandaloneModalContent() {
    if (!standaloneModalEl) return;
    standaloneModalEl.innerHTML = "";

    const win = document.createElement("div");
    win.className = "miccord-modal-window";

    const topbar = document.createElement("div");
    topbar.className = "miccord-modal-topbar";
    topbar.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;font-weight:600;color:#fff;font-size:13px;letter-spacing:-0.01em;">
        ${svgIconHtml("zap", 15)}
        <span>Better MicUP</span>
        <span class="miccord-badge-pill">Configurações Micup</span>
      </div>
      <button class="miccord-modal-close-icon" id="miccord-modal-close" title="Fechar (ESC)">
        ${svgIconHtml("x", 16)}
      </button>
    `;
    win.appendChild(topbar);

    const body = document.createElement("div");
    body.className = "miccord-modal-body";
    win.appendChild(body);
    standaloneModalEl.appendChild(win);

    topbar.querySelector("#miccord-modal-close")?.addEventListener("click", () => toggleStandaloneModal(false));

    // Try rendering with Micup's React + ReactDOM (`193204` or `13706`)
    try {
      const React = getReact();
      const ReactDOMClient = Webpack.findByProps("createRoot") || Webpack.getModule(193204);
      if (React && ReactDOMClient && typeof ReactDOMClient.createRoot === "function") {
        const Comp = createMiccordSettingsComponent(state.modalTab);
        const root = ReactDOMClient.createRoot(body);
        root.render(React.createElement(Comp, { settingsTabType: state.modalTab }));
        return;
      }
    } catch (e) {
      console.warn("[Miccord] Fallback render no modal:", e);
    }
  }

  function updateFloatingWidget() {
    // A pílula flutuante foi removida conforme solicitado: removemos qualquer elemento existente
    if (floatingWidgetEl) {
      try { floatingWidgetEl.remove(); } catch {}
      floatingWidgetEl = null;
    }
    const oldPills = document.querySelectorAll(".miccord-floating-widget");
    oldPills.forEach((el) => el.remove());
  }

  function openImageLightbox(url) {
    if (!url) return;
    if (lightboxEl) lightboxEl.remove();
    const hiResUrl = url.replace(/(\?size=\d+)/, "?size=1024");

    lightboxEl = document.createElement("div");
    lightboxEl.className = "miccord-lightbox";
    lightboxEl.innerHTML = `
      <img src="${hiResUrl}" alt="Preview" />
      <div style="display:flex;gap:10px;">
        <button class="miccord-btn primary" id="miccord-lb-copy">
          ${svgIconHtml("copy", 13)}
          <span>Copiar URL</span>
        </button>
        <a class="miccord-btn" href="${hiResUrl}" target="_blank" rel="noreferrer" style="text-decoration:none;">
          ${svgIconHtml("externalLink", 13)}
          <span>Abrir no Navegador</span>
        </a>
        <button class="miccord-btn danger" id="miccord-lb-close">
          ${svgIconHtml("x", 13)}
          <span>Fechar</span>
        </button>
      </div>
    `;
    lightboxEl.addEventListener("click", (e) => {
      if (e.target === lightboxEl) {
        lightboxEl.remove();
        lightboxEl = null;
      }
    });
    document.body.appendChild(lightboxEl);

    lightboxEl.querySelector("#miccord-lb-copy")?.addEventListener("click", () => {
      navigator.clipboard?.writeText(hiResUrl);
      showToast("URL da imagem copiada!", "success");
    });
    lightboxEl.querySelector("#miccord-lb-close")?.addEventListener("click", () => {
      lightboxEl?.remove();
      lightboxEl = null;
    });
  }

  // ==========================================================================
  // 10. Global Keyboard Shortcuts
  // ==========================================================================
  function setupDOMListeners() {
    applyThemesAndQuickCSS();
    updateFloatingWidget();

    // The guard installs updates in the background; tell the user once the new version runs.
    try {
      const lastVersion = localStorage.getItem("miccord_last_version");
      if (lastVersion && lastVersion !== VERSION) {
        setTimeout(() => showToast(`Better MicUP atualizado para v${VERSION}`, "success"), 8000);
      }
      localStorage.setItem("miccord_last_version", VERSION);
    } catch {}

    // Update CallTimer display every second when in a call
    // Global Keyboard Shortcuts
    window.addEventListener(
      "keydown",
      (e) => {
        // Ctrl + Shift + M -> Abre as Configurações do Micup direto no Better MicUP
        if (e.ctrlKey && e.shiftKey && e.code === "KeyM") {
          e.preventDefault();
          openMiccordSettingsModal("miccord_dashboard");
          return;
        }

        // ESC -> Close Standalone Modal or Lightbox
        if (e.key === "Escape") {
          if (lightboxEl) {
            lightboxEl.remove();
            lightboxEl = null;
          } else if (state.modalOpen) {
            toggleStandaloneModal(false);
          }
        }

        // F12 or Ctrl + Shift + I -> DevTools
        if (
          state.settings.plugins.DevToolsShortcut?.enabled &&
          (e.key === "F12" || (e.ctrlKey && e.shiftKey && e.code === "KeyI"))
        ) {
          e.preventDefault();
          window.flx?.devtools?.open?.();
          return;
        }
      },
      true
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupDOMListeners);
  } else {
    setupDOMListeners();
  }

  // Expose Public API on `window.Miccord`
  window.Miccord = {
    version: VERSION,
    Webpack,
    Patcher,
    Plugins: PLUGIN_DEFINITIONS,
    Themes: PRESET_THEMES,
    get state() {
      return state;
    },
    get settings() {
      return state.settings;
    },
    // Últimos eventos de compartilhamento (início, fim pela fonte, alarmes do encoder)
    get screenShareEvents() {
      return readScreenShareEvents();
    },
    saveSettings,
    showToast,
    openSettings: openMiccordSettingsModal,
  };

  // Install Rspack hook immediately!
  installRspackHook();
})();
