import type {Plugin} from "vite";

import * as babel from "@babel/core";

import injectDataLocatorPlugin from "./babel-plugin-inject-data-locator";

const PREVIEW_RUNTIME = `
(() => {
  const SCOPED_THEME_NAMES = ["brutalism", "glass", "mouve"];
  const THEME_STATE_MESSAGE_TYPE = "heroui-theme-state";
  const THEME_OVERLAY_STYLE_ATTR = "data-heroui-theme-overlay";
  const THEME_STORAGE_KEYS = ["heroui-theme", "theme", "heroui-ui-theme", "vite-ui-theme"];
  const STORAGE_SYNC_MARKER = "__herouiThemeStorageSyncInstalled";
  const root = document.documentElement;
  // Materialized index.html values captured before this runtime mutates the
  // root element: the committed theme stamp (used at boot, when Vite has not
  // injected the theme CSS yet so --heroui-active-theme is not computable)
  // and the vibrant flag (restored when the workbench clears its uncommitted
  // theme overlay without reloading).
  const fileDataTheme = root.getAttribute("data-theme") || "";
  const fileVibrantPalette = root.hasAttribute("data-vibrant-palette");

  window.addEventListener("message", (event) => {
    const data = event.data;

    if (!data || typeof data !== "object") return;

    if (data.type === "heroui-theme") {
      applyColorMode(data.theme === "dark" ? "dark" : "light");
    }

    // Workbench Theme panel live preview for UNCOMMITTED edits only. The CSS
    // is produced by the same generator as the materialized
    // src/heroui-theme.css, and the overlay disappears on reload/commit so the
    // sandbox files always win for committed state (iframe === new tab).
    if (data.type === "heroui-theme-overlay") {
      if (typeof data.css === "string") {
        applyThemeOverlay(data);
      } else {
        clearThemeOverlay();
      }
    }
  });

  installThemeStorageSync();
  applyFileTheme();
  reportReady();

  function applyFileTheme() {
    // The materialized sandbox theme is the source of truth on load; stored
    // user themes only apply when no file theme exists.
    //
    // Two file signals, in order:
    // 1. --heroui-active-theme from src/heroui-theme.css — authoritative once
    //    Vite has injected the CSS (e.g. when clearing a workbench overlay).
    // 2. The data-theme stamp materialization writes into index.html —
    //    captured before this runtime mutates the root, and the only signal
    //    available while this script runs from <head> before the CSS loads.
    const activeTheme = getComputedStyle(root)
      .getPropertyValue("--heroui-active-theme")
      .trim()
      .replace(/^["']|["']$/g, "");

    if (activeTheme) {
      const mode = activeTheme.endsWith("-dark") ? "dark" : "light";
      const designTheme = activeTheme.replace(/-(?:light|dark)$/, "");

      applyThemeIntent(designTheme === "light" || designTheme === "dark" ? mode : activeTheme);

      return;
    }

    const attrTheme = normalizeThemeIntent(fileDataTheme);

    if (attrTheme && isSupportedThemeIntent(attrTheme)) {
      applyThemeIntent(attrTheme);

      return;
    }

    const userTheme = getStoredUserTheme();

    if (userTheme) {
      applyThemeIntent(userTheme);

      return;
    }

    applyColorMode(getCurrentColorMode());
    setDesignTheme(getCurrentDesignTheme());
  }

  function applyThemeIntent(theme) {
    const normalizedTheme = normalizeThemeIntent(theme);

    // A bare light/dark intent (e.g. an app dark-mode toggle writing
    // localStorage) only switches the color mode; it must not reset an active
    // scoped design theme such as mouve back to base.
    if (normalizedTheme === "light" || normalizedTheme === "dark") {
      applyColorMode(normalizedTheme);

      return;
    }

    const mode = normalizedTheme.endsWith("-dark") ? "dark" : "light";
    const designTheme = normalizedTheme.replace(/-(?:light|dark)$/, "");

    applyColorMode(mode);
    setDesignTheme(designTheme);
  }

  function applyColorMode(mode) {
    root.classList.remove("light", "dark");
    root.classList.add(mode);
    root.setAttribute("data-theme", mode);
    root.style.colorScheme = mode;
    syncScopedThemeClasses();
  }

  function setDesignTheme(theme) {
    const normalizedTheme = SCOPED_THEME_NAMES.includes(theme) ? theme : "base";

    root.setAttribute("data-design-theme", normalizedTheme);
    syncScopedThemeClasses();
  }

  function applyThemeOverlay(data) {
    let style = document.querySelector("style[" + THEME_OVERLAY_STYLE_ATTR + "]");

    if (!style) {
      style = document.createElement("style");
      style.setAttribute(THEME_OVERLAY_STYLE_ATTR, "true");
      document.head.appendChild(style);
    }

    if (style.textContent !== data.css) {
      style.textContent = data.css;
    }

    setDesignTheme(typeof data.designTheme === "string" ? data.designTheme : "base");

    if (data.vibrantPalette === true) {
      root.setAttribute("data-vibrant-palette", "true");
    } else {
      root.removeAttribute("data-vibrant-palette");
    }
  }

  function clearThemeOverlay() {
    const style = document.querySelector("style[" + THEME_OVERLAY_STYLE_ATTR + "]");

    if (style) style.remove();

    if (fileVibrantPalette) {
      root.setAttribute("data-vibrant-palette", "true");
    } else {
      root.removeAttribute("data-vibrant-palette");
    }

    applyFileTheme();
  }

  function syncScopedThemeClasses() {
    for (const theme of SCOPED_THEME_NAMES) {
      root.classList.remove(theme + "-light", theme + "-dark");
    }

    const designTheme = root.getAttribute("data-design-theme");

    if (!SCOPED_THEME_NAMES.includes(designTheme)) return;

    const mode = root.classList.contains("dark") ? "dark" : "light";

    root.classList.add(designTheme + "-" + mode);
    root.setAttribute("data-theme", designTheme + "-" + mode);
  }

  function reportReady() {
    window.parent?.postMessage(
      {
        colorMode: getCurrentColorMode(),
        designTheme: getCurrentDesignTheme(),
        type: "heroui-ready",
      },
      "*",
    );
  }

  function reportThemeState() {
    window.parent?.postMessage(
      {
        colorMode: getCurrentColorMode(),
        designTheme: getCurrentDesignTheme(),
        type: THEME_STATE_MESSAGE_TYPE,
      },
      "*",
    );
  }

  function getCurrentColorMode() {
    const dataTheme = root.getAttribute("data-theme") || "";

    return root.classList.contains("dark") || dataTheme === "dark" || dataTheme.endsWith("-dark")
      ? "dark"
      : "light";
  }

  function getCurrentDesignTheme() {
    const designTheme = root.getAttribute("data-design-theme");

    if (SCOPED_THEME_NAMES.includes(designTheme)) return designTheme;

    const dataTheme = root.getAttribute("data-theme") || "";
    const dataDesignTheme = dataTheme.replace(/-(?:light|dark)$/, "");

    if (SCOPED_THEME_NAMES.includes(dataDesignTheme)) return dataDesignTheme;

    for (const theme of SCOPED_THEME_NAMES) {
      if (root.classList.contains(theme + "-light") || root.classList.contains(theme + "-dark")) {
        return theme;
      }
    }

    return "base";
  }

  function getStoredUserTheme() {
    try {
      for (const key of THEME_STORAGE_KEYS) {
        const value = window.localStorage.getItem(key);
        const theme = normalizeStoredTheme(value);

        if (theme) return theme;
      }
    } catch {
      // localStorage can be unavailable in embedded preview contexts.
    }

    return null;
  }

  function installThemeStorageSync() {
    try {
      const prototype = Storage.prototype;

      if (prototype[STORAGE_SYNC_MARKER]) return;

      const originalSetItem = prototype.setItem;
      const originalRemoveItem = prototype.removeItem;

      Object.defineProperty(prototype, STORAGE_SYNC_MARKER, {
        configurable: true,
        value: true,
      });

      prototype.setItem = function setItem(key, value) {
        originalSetItem.call(this, key, value);

        if (this !== window.localStorage || !THEME_STORAGE_KEYS.includes(String(key))) return;

        const theme = normalizeStoredTheme(String(value));

        if (theme) {
          applyThemeIntent(theme);
          reportThemeState();
        }
      };

      prototype.removeItem = function removeItem(key) {
        originalRemoveItem.call(this, key);

        if (this === window.localStorage && THEME_STORAGE_KEYS.includes(String(key))) {
          applyFileTheme();
          reportThemeState();
        }
      };
    } catch {
      // Storage can be unavailable in embedded preview contexts.
    }
  }

  function normalizeStoredTheme(value) {
    if (!value) return null;

    const normalized = normalizeThemeIntent(value);

    return isSupportedThemeIntent(normalized) ? normalized : null;
  }

  function normalizeThemeIntent(theme) {
    if (theme === "system") {
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    return String(theme || "").trim();
  }

  function isSupportedThemeIntent(theme) {
    if (theme === "light" || theme === "dark") return true;

    const designTheme = theme.replace(/-(?:light|dark)$/, "");

    return SCOPED_THEME_NAMES.includes(designTheme);
  }
})();

(() => {
  const RUNTIME_ERROR_MESSAGE_TYPE = "HEROUI_PREVIEW_RUNTIME_ERROR";
  const IGNORED_PREFIXES = ["Warning:", "[vite]"];
  const IGNORED_INCLUDES = [
    "[vite] connected",
    "[vite] connecting",
    "Download the React DevTools",
  ];
  const seenErrors = new Set();
  const originalConsoleError = console.error;

  window.addEventListener("error", (event) => {
    postRuntimeError(
      {
        message: event.message,
        name: event.error?.name || "Error",
        stack: event.error?.stack,
        source: event.filename,
      },
      "UNHANDLED_ERROR",
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    postRuntimeError(serializeReason(event.reason, "Unhandled rejection"), "UNHANDLED_REJECTION");
  });

  console.error = (...args) => {
    postRuntimeError(serializeConsoleError(args), "CONSOLE_ERROR");
    originalConsoleError.apply(console, args);
  };

  function postRuntimeError(error, type) {
    const message = normalizeMessage(error?.message || error);

    if (!message || shouldIgnore(message)) return;

    const payload = {
      error: {
        message,
        name: normalizeMessage(error?.name) || type,
        source: normalizeMessage(error?.source),
        stack: normalizeMessage(error?.stack),
        type,
      },
      type: RUNTIME_ERROR_MESSAGE_TYPE,
    };
    const signature = [payload.error.name, payload.error.message, payload.error.stack].join(":");

    if (seenErrors.has(signature)) return;
    seenErrors.add(signature);

    if (seenErrors.size > 20) {
      seenErrors.clear();
      seenErrors.add(signature);
    }

    window.parent?.postMessage(payload, "*");
  }

  function serializeReason(reason, fallbackName) {
    if (reason instanceof Error) {
      return {
        message: reason.message,
        name: reason.name || fallbackName,
        stack: reason.stack,
      };
    }

    return {
      message: normalizeMessage(reason),
      name: fallbackName,
    };
  }

  function serializeConsoleError(args) {
    const errorArg = args.find((arg) => arg instanceof Error);

    if (errorArg) return serializeReason(errorArg, "Console error");

    return {
      message: args.map(normalizeMessage).filter(Boolean).join(" "),
      name: "Console error",
    };
  }

  function normalizeMessage(value) {
    if (typeof value === "string") return value;
    if (value == null) return "";

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function shouldIgnore(message) {
    return (
      IGNORED_PREFIXES.some((prefix) => message.startsWith(prefix)) ||
      IGNORED_INCLUDES.some((include) => message.includes(include))
    );
  }
})();

(() => {
  const HISTORY_NAVIGATE_MESSAGE_TYPE = "HEROUI_PREVIEW_HISTORY_NAVIGATE";
  const HISTORY_STATE_MESSAGE_TYPE = "HEROUI_PREVIEW_HISTORY_STATE";
  const STORAGE_KEY = "__heroui_preview_history__";

  let previewHistory = readPreviewHistory();

  syncPreviewHistory("pop");
  patchHistoryMethod("pushState", "push");
  patchHistoryMethod("replaceState", "replace");

  window.addEventListener("message", (event) => {
    const data = event.data;

    if (!data || typeof data !== "object" || data.type !== HISTORY_NAVIGATE_MESSAGE_TYPE) return;

    if (data.direction === "back") {
      navigatePreviewHistory("back");
    } else if (data.direction === "forward") {
      navigatePreviewHistory("forward");
    }
  });

  window.addEventListener("popstate", () => syncPreviewHistory("pop"));
  window.addEventListener("hashchange", () => syncPreviewHistory("push"));

  window.parent?.postMessage({type: HISTORY_STATE_MESSAGE_TYPE, state: getPreviewHistoryState()}, "*");

  function patchHistoryMethod(method, mode) {
    const original = window.history[method];

    if (typeof original !== "function") return;

    window.history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);

      syncPreviewHistory(mode);

      return result;
    };
  }

  function navigatePreviewHistory(direction) {
    const state = getPreviewHistoryState();

    if (direction === "back" && state.canGoBack) {
      window.history.back();

      return;
    }

    if (direction === "forward" && state.canGoForward) {
      window.history.forward();

      return;
    }

    window.parent?.postMessage({type: HISTORY_STATE_MESSAGE_TYPE, state}, "*");
  }

  function syncPreviewHistory(mode) {
    const url = window.location.href;

    if (previewHistory.entries[previewHistory.index] === url) {
      persistPreviewHistory();
      window.parent?.postMessage({type: HISTORY_STATE_MESSAGE_TYPE, state: getPreviewHistoryState()}, "*");

      return;
    }

    if (mode === "replace" && previewHistory.index >= 0) {
      previewHistory.entries[previewHistory.index] = url;
    } else if (mode === "pop") {
      const index = findNearestHistoryIndex(url);

      if (index >= 0) {
        previewHistory.index = index;
      } else {
        pushPreviewHistoryEntry(url);
      }
    } else {
      pushPreviewHistoryEntry(url);
    }

    persistPreviewHistory();
    window.parent?.postMessage({type: HISTORY_STATE_MESSAGE_TYPE, state: getPreviewHistoryState()}, "*");
  }

  function pushPreviewHistoryEntry(url) {
    const activeEntries =
      previewHistory.index >= 0
        ? previewHistory.entries.slice(0, previewHistory.index + 1)
        : [];

    previewHistory.entries = [...activeEntries, url];
    previewHistory.index = previewHistory.entries.length - 1;
  }

  function findNearestHistoryIndex(url) {
    if (!previewHistory.entries.length) return -1;

    const currentIndex = Math.max(0, previewHistory.index);

    for (let offset = 0; offset < previewHistory.entries.length; offset += 1) {
      const previousIndex = currentIndex - offset;
      const nextIndex = currentIndex + offset;

      if (previousIndex >= 0 && previewHistory.entries[previousIndex] === url) {
        return previousIndex;
      }

      if (nextIndex < previewHistory.entries.length && previewHistory.entries[nextIndex] === url) {
        return nextIndex;
      }
    }

    return -1;
  }

  function getPreviewHistoryState() {
    return {
      canGoBack: previewHistory.index > 0,
      canGoForward: previewHistory.index < previewHistory.entries.length - 1,
      url: window.location.href,
    };
  }

  function readPreviewHistory() {
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");

      if (
        parsed &&
        Array.isArray(parsed.entries) &&
        parsed.entries.every((entry) => typeof entry === "string") &&
        Number.isInteger(parsed.index)
      ) {
        const index = Math.min(Math.max(parsed.index, -1), parsed.entries.length - 1);

        return {entries: parsed.entries, index};
      }
    } catch {
      // Ignore invalid persisted state and start a new preview history.
    }

    return {entries: [], index: -1};
  }

  function persistPreviewHistory() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(previewHistory));
    } catch {
      // Session storage can be unavailable in some embedded preview contexts.
    }
  }
})();

(() => {
  let annotationModeEnabled = false;
  let annotationShield = null;
  let parentFocusGuardEnabled = false;
  let previewFocusIntentUntil = 0;
  let lastCandidateAt = 0;
  let lastCandidateIndex = 0;
  let lastCandidatePoint = null;
  let lastCandidateStackKey = "";
  let lastHoveredLocator = null;
  let lastSelectedAt = 0;
  let lastSelectedLocator = null;

  const MODE_MESSAGE_TYPE = "HEROUI_ANNOTATION_MODE";
  const FOCUS_GUARD_MESSAGE_TYPE = "HEROUI_PREVIEW_FOCUS_GUARD";
  const FOCUS_INTENT_MESSAGE_TYPE = "HEROUI_PREVIEW_FOCUS_INTENT";
  const FOCUS_PATCH_MARKER = "__herouiPreviewFocusGuardInstalled";
  const LOCATOR_ATTRIBUTE = "data-locator";
  const LOCATOR_SELECTOR = "[" + LOCATOR_ATTRIBUTE + "]";
  const SHIELD_ATTRIBUTE = "data-heroui-annotation-shield";
  const CYCLE_DISTANCE_PX = 8;
  const CYCLE_WINDOW_MS = 1400;
  const PREVIEW_FOCUS_INTENT_MS = 800;
  const TEXT_LIKE_TAGS = new Set(["em", "h1", "h2", "h3", "h4", "h5", "h6", "label", "p", "small", "span", "strong"]);
  const SMALL_MEDIA_TAGS = new Set(["canvas", "img", "picture", "svg", "video"]);
  const SURFACE_TAGS = new Set(["article", "aside", "dialog", "fieldset", "footer", "form", "header", "li", "main", "nav", "section"]);
  const CONTROL_SOURCE_PATTERN = /(?:button|checkbox|combobox|field|input|link|radio|select|slider|switch|textarea|toggle)/i;
  const LOGO_SOURCE_PATTERN = /(?:avatar|brand|icon|image|logo|mark|media|picture|svg)/i;
  const SURFACE_CLASS_PATTERN = /(?:^|\\s)(?:card|surface|panel|sheet|modal|popover|dialog|drawer|wrapper|container|rounded|shadow|border|bg-|ring-)(?:$|\\s|[-_:])/i;
  const CONTROL_CLASS_PATTERN = /(?:^|\\s)(?:button|checkbox|field|input|link|radio|select|switch|textarea|textfield)(?:$|\\s|[-_:])/i;
  const TRANSPARENT_COLOR_PATTERN = /^(?:transparent|rgba?\\([^)]*[,/]\\s*0\\s*\\)|oklch\\([^)]*\\/\\s*0\\s*\\))$/i;
  const INTERACTION_EVENTS = [
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "touchstart",
    "touchend",
    "click",
    "dblclick",
    "auxclick",
    "contextmenu",
    "wheel",
    "dragstart",
    "dragover",
    "drop",
  ];
  const KEYBOARD_EVENTS = ["keydown", "keyup", "keypress"];
  const FOCUS_EVENTS = ["blur", "focus", "focusin", "focusout"];
  const PREVIEW_FOCUS_INTENT_EVENTS = ["pointerdown", "mousedown", "touchstart"];
  const SHIELD_EVENTS = [
    ...INTERACTION_EVENTS,
    "pointermove",
    "pointerleave",
    "mousemove",
    "touchmove",
  ];

  installPreviewFocusGuardPatch();

  window.addEventListener("message", (event) => {
    const data = event.data;

    if (!data || typeof data !== "object") return;

    if (data.type === FOCUS_GUARD_MESSAGE_TYPE) {
      setParentFocusGuard(Boolean(data.enabled));

      return;
    }

    if (data.type !== MODE_MESSAGE_TYPE) return;

    setAnnotationMode(Boolean(data.enabled));
  });

  document.addEventListener(
    "mouseover",
    (event) => {
      if (!annotationModeEnabled || isShieldEvent(event)) return;

      handleAnnotationHover(event);
    },
    true,
  );

  document.addEventListener(
    "mouseout",
    (event) => {
      if (!annotationModeEnabled || isShieldEvent(event)) return;

      const element = getAnnotationElement(event.target);

      if (!element) return;

      const nextElement = getAnnotationElement(event.relatedTarget);

      if (nextElement === element) return;

      clearHoveredAnnotation(element);
    },
    true,
  );

  for (const eventName of INTERACTION_EVENTS) {
    document.addEventListener(eventName, handleAnnotationInteraction, {
      capture: true,
      passive: false,
    });
  }

  for (const eventName of KEYBOARD_EVENTS) {
    document.addEventListener(eventName, handleAnnotationKeyboardEvent, {
      capture: true,
      passive: false,
    });
  }

  for (const eventName of FOCUS_EVENTS) {
    window.addEventListener(eventName, handlePreviewFocusGuardEvent, true);
    document.addEventListener(eventName, handlePreviewFocusGuardEvent, true);
  }

  for (const eventName of PREVIEW_FOCUS_INTENT_EVENTS) {
    window.addEventListener(eventName, handlePreviewFocusIntentEvent, true);
    document.addEventListener(eventName, handlePreviewFocusIntentEvent, true);
  }

  window.parent?.postMessage({type: "HEROUI_ANNOTATIONS_READY"}, "*");

  function setAnnotationMode(enabled) {
    annotationModeEnabled = enabled;
    document.documentElement.toggleAttribute("data-heroui-annotation-mode", annotationModeEnabled);
    document.documentElement.style.cursor = annotationModeEnabled ? "crosshair" : "";

    if (annotationModeEnabled) {
      ensureAnnotationShield();

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      return;
    }

    removeAnnotationShield();
    lastCandidateAt = 0;
    lastCandidateIndex = 0;
    lastCandidatePoint = null;
    lastCandidateStackKey = "";
    lastHoveredLocator = null;
    lastSelectedLocator = null;
  }

  function setParentFocusGuard(enabled) {
    parentFocusGuardEnabled = enabled;

    if (parentFocusGuardEnabled && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (parentFocusGuardEnabled) {
      window.blur?.();
    } else {
      previewFocusIntentUntil = 0;
    }
  }

  function shouldBlockPreviewFocus() {
    return annotationModeEnabled || (parentFocusGuardEnabled && !hasRecentPreviewFocusIntent());
  }

  function hasRecentPreviewFocusIntent() {
    return Date.now() <= previewFocusIntentUntil;
  }

  function handlePreviewFocusIntentEvent(event) {
    if (annotationModeEnabled) return;

    previewFocusIntentUntil = Date.now() + PREVIEW_FOCUS_INTENT_MS;
    window.parent?.postMessage({type: FOCUS_INTENT_MESSAGE_TYPE}, "*");
    refocusPreviewIntentTarget(event.target);
  }

  function refocusPreviewIntentTarget(target) {
    const focusTarget = getPreviewIntentFocusTarget(target);

    if (!focusTarget) return;

    window.setTimeout(() => focusPreviewIntentTarget(focusTarget), 0);
    window.setTimeout(() => focusPreviewIntentTarget(focusTarget), 40);
  }

  function getPreviewIntentFocusTarget(target) {
    if (!(target instanceof Element)) return null;

    const element = target.closest(
      [
        "textarea",
        "input:not([type='button']):not([type='checkbox']):not([type='color']):not([type='file']):not([type='hidden']):not([type='image']):not([type='radio']):not([type='range']):not([type='reset']):not([type='submit'])",
        "[contenteditable='']",
        "[contenteditable='true']",
        "[role='textbox']",
      ].join(","),
    );

    return element instanceof HTMLElement ? element : null;
  }

  function focusPreviewIntentTarget(target) {
    if (!target.isConnected || shouldBlockPreviewFocus()) return;
    if (document.activeElement === target) return;

    target.focus({preventScroll: true});
  }

  function installPreviewFocusGuardPatch() {
    try {
      const prototype = HTMLElement.prototype;

      if (prototype[FOCUS_PATCH_MARKER]) return;

      const originalFocus = prototype.focus;

      Object.defineProperty(prototype, FOCUS_PATCH_MARKER, {
        configurable: true,
        value: true,
      });

      prototype.focus = function focus(options) {
        if (shouldBlockPreviewFocus()) {
          if (document.activeElement === this && typeof this.blur === "function") {
            this.blur();
          }

          return;
        }

        return originalFocus.call(this, options);
      };
    } catch {
      // Some embedded preview environments may lock DOM prototypes.
    }
  }

  function ensureAnnotationShield() {
    if (annotationShield?.isConnected) return annotationShield;

    const shield = document.createElement("div");

    shield.setAttribute(SHIELD_ATTRIBUTE, "true");
    shield.setAttribute("aria-hidden", "true");
    Object.assign(shield.style, {
      background: "transparent",
      cursor: "crosshair",
      inset: "0",
      pointerEvents: "auto",
      position: "fixed",
      touchAction: "none",
      userSelect: "none",
      zIndex: "2147483647",
    });

    for (const eventName of SHIELD_EVENTS) {
      shield.addEventListener(eventName, handleAnnotationShieldEvent, {passive: false});
    }

    (document.body || document.documentElement).appendChild(shield);
    annotationShield = shield;

    return shield;
  }

  function removeAnnotationShield() {
    if (!annotationShield) return;

    annotationShield.remove();
    annotationShield = null;
  }

  function getAnnotationElement(target) {
    return target instanceof Element ? target.closest(LOCATOR_SELECTOR) : null;
  }

  function postAnnotationMessage(type, data) {
    if (!data && type !== "COMPONENT_MOUSE_OUT") return;

    window.parent?.postMessage({data, type}, "*");
  }

  function handleAnnotationShieldEvent(event) {
    if (!annotationModeEnabled) return;

    suppressPreviewInteraction(event);

    if (event.type === "pointerleave") {
      clearHoveredAnnotation();

      return;
    }

    if (isAnnotationHoverEvent(event)) {
      handleAnnotationHover(event);

      return;
    }

    if (isAnnotationSelectionEvent(event)) {
      selectAnnotationTarget(event);
    }
  }

  function handleAnnotationInteraction(event) {
    if (!annotationModeEnabled) return;

    if (isShieldEvent(event)) return;

    suppressPreviewInteraction(event);

    if (isAnnotationSelectionEvent(event)) {
      selectAnnotationTarget(event);
    }
  }

  function handleAnnotationKeyboardEvent(event) {
    if (!annotationModeEnabled) return;

    suppressPreviewInteraction(event);
  }

  function handlePreviewFocusGuardEvent(event) {
    if (!shouldBlockPreviewFocus()) return;

    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  function handleAnnotationHover(event) {
    const target = getAnnotationTargetFromEvent(event, {allowCycle: false});

    if (!target) {
      clearHoveredAnnotation();

      return;
    }

    if (target.locator === lastHoveredLocator) return;

    lastHoveredLocator = target.locator;
    postAnnotationMessage("COMPONENT_HOVER", buildAnnotationPayload(target));
  }

  function selectAnnotationTarget(event) {
    const target = getAnnotationTargetFromEvent(event, {allowCycle: true});

    if (!target || !shouldSelectAnnotationTarget(event, target.locator)) return;

    postAnnotationMessage("COMPONENT_CLICK", buildAnnotationPayload(target));
  }

  function clearHoveredAnnotation(element) {
    if (!lastHoveredLocator) return;

    lastHoveredLocator = null;
    postAnnotationMessage(
      "COMPONENT_MOUSE_OUT",
      element ? buildAnnotationPayload({candidateCount: 1, candidateIndex: 0, element}) : null,
    );
  }

  function getAnnotationTargetFromEvent(event, options) {
    const point = getEventPoint(event);

    if (point) {
      return getAnnotationTargetAtPoint(point.x, point.y, {
        allowCycle: Boolean(options?.allowCycle),
        event,
      });
    }

    const element = getAnnotationElement(event.target);

    return element
      ? {
          candidateCount: 1,
          candidateIndex: 0,
          element,
          locator: element.getAttribute(LOCATOR_ATTRIBUTE),
        }
      : null;
  }

  function getAnnotationTargetAtPoint(x, y, options) {
    const candidates = getAnnotationCandidatesAtPoint(x, y);

    if (!candidates.length) return null;

    const stackKey = candidates.map((candidate) => candidate.locator).join("|");
    const now = Date.now();
    const isNearPreviousPoint =
      lastCandidatePoint &&
      Math.abs(lastCandidatePoint.x - x) <= CYCLE_DISTANCE_PX &&
      Math.abs(lastCandidatePoint.y - y) <= CYCLE_DISTANCE_PX;
    const shouldCycle =
      Boolean(options?.allowCycle) &&
      candidates.length > 1 &&
      (Boolean(options?.event?.altKey) ||
        (stackKey === lastCandidateStackKey &&
          isNearPreviousPoint &&
          now - lastCandidateAt <= CYCLE_WINDOW_MS));
    const candidateIndex = shouldCycle ? (lastCandidateIndex + 1) % candidates.length : 0;
    const candidate = candidates[candidateIndex];

    if (options?.allowCycle) {
      lastCandidateAt = now;
      lastCandidateIndex = candidateIndex;
      lastCandidatePoint = {x, y};
      lastCandidateStackKey = stackKey;
    }

    return {
      candidateCount: candidates.length,
      candidateIndex,
      element: candidate.element,
      locator: candidate.locator,
    };
  }

  function getAnnotationCandidatesAtPoint(x, y) {
    const elements = getElementsAtPoint(x, y).filter((element) => !isAnnotationShield(element));
    const candidates = [];
    const seenLocators = new Set();

    elements.forEach((hitElement, stackIndex) => {
      let element = hitElement;
      let ancestorDistance = 0;

      while (element && element !== document.documentElement) {
        if (element.hasAttribute?.(LOCATOR_ATTRIBUTE)) {
          const locator = element.getAttribute(LOCATOR_ATTRIBUTE);

          if (locator && !seenLocators.has(locator)) {
            const rect = element.getBoundingClientRect();

            if (isSelectableRect(rect, x, y)) {
              seenLocators.add(locator);
              candidates.push({
                ancestorDistance,
                directHit: ancestorDistance === 0,
                element,
                locator,
                rect,
                score: 0,
                sourceName: getLocatorElementName(locator, element),
                stackIndex,
              });
            }
          }
        }

        element = element.parentElement;
        ancestorDistance += 1;
      }
    });

    return candidates
      .map((candidate) => ({
        ...candidate,
        score: scoreAnnotationCandidate(candidate),
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.stackIndex - b.stackIndex ||
          a.ancestorDistance - b.ancestorDistance ||
          a.rect.width * a.rect.height - b.rect.width * b.rect.height,
      );
  }

  function getElementsAtPoint(x, y) {
    if (typeof document.elementsFromPoint === "function") {
      return document.elementsFromPoint(x, y).filter((element) => element instanceof Element);
    }

    const element = document.elementFromPoint?.(x, y);

    return element instanceof Element ? [element] : [];
  }

  function scoreAnnotationCandidate(candidate) {
    const element = candidate.element;
    const rect = candidate.rect;
    const tagName = getTagName(element);
    const area = Math.max(1, rect.width * rect.height);
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const isInteractive = isInteractiveElement(element);
    const isControlSource = isControlSourceCandidate(candidate);
    const isLogoSource = isLogoSourceCandidate(candidate);
    const isSurface = isSurfaceElement(element);
    const isSmallTarget = isSmallMeaningfulTarget(element);
    let score = 100 - candidate.stackIndex * 4 - candidate.ancestorDistance * 8;

    if (candidate.directHit) score += 40;
    if (isInteractive) score += 260 + (candidate.directHit ? 80 : 0);
    if (isControlSource) score += 320 + (candidate.directHit ? 80 : 0);
    if (isLogoSource) score += 210 + (candidate.directHit ? 70 : 0);
    if (isSmallTarget && candidate.directHit) score += 140;
    if (area < viewportArea * 0.005) score += 95;
    else if (area < viewportArea * 0.02) score += 55;
    if (hasAccessibleName(element)) score += 35;
    if (isSurface && !isControlSource && !isLogoSource) score += 70;

    if (isTextLikeElement(element) && !isInteractive && !isSmallTarget) {
      score -= 65;
    }

    if (isBroadLayoutElement(element, rect, viewportArea)) {
      score -= 220;
    } else if (area > viewportArea * 0.55) {
      score -= 160;
    } else if (area > viewportArea * 0.32) {
      score -= 70;
    } else if (isSurface && area > viewportArea * 0.01 && !isControlSource && !isLogoSource) {
      score += 25;
    }

    if ((tagName === "svg" || tagName === "path") && isInsideInteractiveElement(element)) {
      score += 35;
    }

    if (getTagName(element) === "div" && !isControlSource && !isLogoSource && area > viewportArea * 0.08) {
      score -= 80;
    }

    return score;
  }

  function isSelectableRect(rect, x, y) {
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  }

  function isInteractiveElement(element) {
    if (!(element instanceof Element)) return false;

    return element.matches(
      [
        "a[href]",
        "button",
        "input",
        "select",
        "summary",
        "textarea",
        "[contenteditable=true]",
        "[role=button]",
        "[role=checkbox]",
        "[role=link]",
        "[role=menuitem]",
        "[role=option]",
        "[role=radio]",
        "[role=switch]",
        "[role=tab]",
        "[tabindex]:not([tabindex='-1'])",
      ].join(","),
    );
  }

  function isInsideInteractiveElement(element) {
    const interactiveAncestor = element.closest?.(
      "a[href],button,input,select,summary,textarea,[contenteditable=true],[role=button],[role=link],[tabindex]:not([tabindex='-1'])",
    );

    return Boolean(interactiveAncestor && interactiveAncestor !== element);
  }

  function isSurfaceElement(element) {
    const tagName = getTagName(element);

    if (SURFACE_TAGS.has(tagName)) return true;

    const className =
      typeof element.className === "string" ? element.className : element.getAttribute("class") || "";

    if (CONTROL_CLASS_PATTERN.test(className)) return false;

    if (SURFACE_CLASS_PATTERN.test(className)) return true;

    const style = window.getComputedStyle(element);
    const hasBackground = style.backgroundColor && !TRANSPARENT_COLOR_PATTERN.test(style.backgroundColor);
    const hasBorder =
      parseFloat(style.borderTopWidth) > 0 ||
      parseFloat(style.borderRightWidth) > 0 ||
      parseFloat(style.borderBottomWidth) > 0 ||
      parseFloat(style.borderLeftWidth) > 0;
    const hasRadius = parseFloat(style.borderTopLeftRadius) > 0;
    const hasShadow = style.boxShadow && style.boxShadow !== "none";

    return Boolean(hasBackground || hasBorder || hasRadius || hasShadow);
  }

  function isTextLikeElement(element) {
    return TEXT_LIKE_TAGS.has(getTagName(element));
  }

  function isSmallMeaningfulTarget(element) {
    const tagName = getTagName(element);

    return SMALL_MEDIA_TAGS.has(tagName) || hasAccessibleName(element);
  }

  function isControlSourceCandidate(candidate) {
    if (CONTROL_SOURCE_PATTERN.test(candidate.sourceName)) return true;
    if (isInteractiveElement(candidate.element)) return true;

    const className =
      typeof candidate.element.className === "string"
        ? candidate.element.className
        : candidate.element.getAttribute("class") || "";

    return CONTROL_CLASS_PATTERN.test(className);
  }

  function isLogoSourceCandidate(candidate) {
    return LOGO_SOURCE_PATTERN.test(candidate.sourceName) || SMALL_MEDIA_TAGS.has(getTagName(candidate.element));
  }

  function hasAccessibleName(element) {
    return Boolean(
      element.getAttribute("aria-label")?.trim() ||
        element.getAttribute("alt")?.trim() ||
        element.getAttribute("title")?.trim(),
    );
  }

  function isBroadLayoutElement(element, rect, viewportArea) {
    const tagName = getTagName(element);
    const area = rect.width * rect.height;

    if (tagName === "html" || tagName === "body") return true;
    if (element.id === "root") return true;
    if (tagName === "main" && area > viewportArea * 0.45) return true;

    return area > viewportArea * 0.72;
  }

  function getTagName(element) {
    return element.tagName.toLowerCase();
  }

  function getLocatorElementName(locator, element) {
    const parts = String(locator || "").split(":");

    return parts.length >= 4 ? parts[parts.length - 3] || element.tagName.toLowerCase() : element.tagName.toLowerCase();
  }

  function getEventPoint(event) {
    if (typeof event.clientX === "number" && typeof event.clientY === "number") {
      return {x: event.clientX, y: event.clientY};
    }

    const touch = event.touches?.[0] || event.changedTouches?.[0];

    if (touch) return {x: touch.clientX, y: touch.clientY};

    return null;
  }

  function isAnnotationHoverEvent(event) {
    return event.type === "pointermove" || event.type === "mousemove" || event.type === "touchmove";
  }

  function isShieldEvent(event) {
    return isAnnotationShield(event.target);
  }

  function isAnnotationShield(target) {
    return target instanceof Element && target.hasAttribute(SHIELD_ATTRIBUTE);
  }

  function suppressPreviewInteraction(event) {
    event.preventDefault();
    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  function shouldSelectAnnotationTarget(event, locator) {
    if (!locator || !isAnnotationSelectionEvent(event)) return false;

    const now = Date.now();

    if (locator === lastSelectedLocator && now - lastSelectedAt < 1000) return false;

    lastSelectedLocator = locator;
    lastSelectedAt = now;

    return true;
  }

  function isAnnotationSelectionEvent(event) {
    if ((event.type === "pointerdown" || event.type === "mousedown") && event.button !== 0) {
      return false;
    }

    if (event.type === "pointerdown") return true;

    if (!("PointerEvent" in window) && (event.type === "mousedown" || event.type === "touchstart")) {
      return true;
    }

    return event.type === "click" && event.detail === 0;
  }

  function buildAnnotationPayload(target) {
    const element = target.element;
    const locator = target.locator || element.getAttribute(LOCATOR_ATTRIBUTE);

    if (!locator) return null;

    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    const parsed = parseLocator(locator, element);

    return {
      boundingRect: {
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      },
      componentNickname: getComponentNickname(element),
      computedStyle: {
        color: computedStyle.color,
        fontFamily: normalizeFontFamily(computedStyle.fontFamily),
        fontSize: computedStyle.fontSize,
      },
      element: parsed.element,
      filename: parsed.filename,
      locator,
      route: window.location.pathname + window.location.search,
      selection: {
        candidateCount: target.candidateCount || 1,
        candidateIndex: target.candidateIndex || 0,
      },
    };
  }

  function normalizeFontFamily(fontFamily) {
    return String(fontFamily || "")
      .split(",")[0]
      ?.replace(/^["']|["']$/g, "")
      .trim();
  }

  function parseLocator(locator, element) {
    const parts = locator.split(":");
    const elementName = parts.length >= 4 ? parts[parts.length - 3] : element.tagName.toLowerCase();
    const filename = parts.length >= 4 ? parts.slice(0, -3).join(":") : "unknown";

    return {
      element: elementName || element.tagName.toLowerCase(),
      filename: filename || "unknown",
    };
  }

  function getComponentNickname(element) {
    const ariaLabel = element.getAttribute("aria-label");

    if (ariaLabel?.trim()) return ariaLabel.trim().slice(0, 80);

    const text = element.textContent?.replace(/\\s+/g, " ").trim();

    return text ? text.slice(0, 80) : undefined;
  }
})();
`;

export default function vitePluginPreviewAnnotations(): Plugin {
  return {
    enforce: "pre",
    name: "vite-plugin-preview-annotations",

    transform(code, id) {
      if (!/\.(jsx|tsx)$/.test(id)) return null;

      const inputSourceMap = this.getCombinedSourcemap();

      try {
        const result = babel.transformSync(code, {
          ast: false,
          babelrc: false,
          configFile: false,
          filename: id,
          inputSourceMap,
          plugins: [
            [
              injectDataLocatorPlugin,
              {
                inputSourceMap,
                types: babel.types,
              },
            ],
          ],
          presets: [["@babel/preset-react", {runtime: "automatic"}], "@babel/preset-typescript"],
          sourceMaps: true,
        });

        if (!result?.code) return null;

        return {
          code: result.code,
          map: result.map,
        };
      } catch (error) {
        console.warn(`[vite-plugin-preview-annotations] Failed to annotate ${id}:`, error);

        return null;
      }
    },

    transformIndexHtml(html) {
      return html.replace("</head>", `<script type="module">${PREVIEW_RUNTIME}</script></head>`);
    },
  };
}
