(() => {
  const BADGE_CLASS = "gh-remark-badge";
  const BADGE_EMPTY_CLASS = "gh-remark-badge--empty";
  const BADGE_LOGIN_ATTR = "data-gh-remark-login";
  const ORIGINAL_TITLE_ATTR = "data-gh-remark-original-title";
  const RESERVED_SEGMENTS = new Set([
    "about",
    "account",
    "apps",
    "blog",
    "collections",
    "copilot",
    "contact",
    "dashboard",
    "enterprise",
    "events",
    "explore",
    "features",
    "gist",
    "issues",
    "login",
    "logout",
    "marketplace",
    "new",
    "notifications",
    "overview",
    "repositories",
    "orgs",
    "organizations",
    "packages",
    "people",
    "pricing",
    "projects",
    "pulls",
    "readme",
    "repository",
    "search",
    "security",
    "settings",
    "site",
    "sponsors",
    "support",
    "teams",
    "topics",
    "trending",
    "users"
  ]);

  const SOURCE_SELECTORS = [
    "[data-login]",
    "[data-hovercard-url]",
    "[login]",
    "a[href]",
    "img[alt^='@']",
    "[aria-label*='@']",
    "[class*='user-group-module__TextCell']",
    "[class*='text-cell-module__SanitizedHtml']",
    "[class*='sanitized-group-header-text-module__SanitizedHtml']",
    "[class*='slicer-items-module__title']"
  ];

  let notes = {};
  let scanScheduled = false;
  let localeOverride = "en";
  let localeMessages = null;
  const SUPPORTED_PATH_PATTERNS = [
    /^\/orgs\/[^/]+\/people(?:\/.*)?$/i,
    /^\/orgs\/[^/]+\/projects(?:\/.*)?$/i
  ];

  function isSupportedPage(pathname = window.location.pathname) {
    const cleanPath = String(pathname || "/").replace(/\/+$/, "") || "/";
    return SUPPORTED_PATH_PATTERNS.some((pattern) => pattern.test(cleanPath));
  }

  function cleanupInjectedBadges() {
    document.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => {
      badge.remove();
    });

    document.querySelectorAll(`[${ORIGINAL_TITLE_ATTR}]`).forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }

      const originalTitle = node.getAttribute(ORIGINAL_TITLE_ATTR) || "";
      if (originalTitle) {
        node.setAttribute("title", originalTitle);
      } else {
        node.removeAttribute("title");
      }
      node.removeAttribute(ORIGINAL_TITLE_ATTR);
    });
  }

  function resolveAutoLocale() {
    return "en";
  }

  async function loadLocaleMessages(locale) {
    try {
      const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (_error) {
      return null;
    }
  }

  function formatMessageFromEntry(entry, substitutions = []) {
    if (!entry || typeof entry !== "object" || !entry.message) {
      return "";
    }

    let text = String(entry.message);
    if (entry.placeholders && typeof entry.placeholders === "object") {
      const placeholders = Object.entries(entry.placeholders)
        .map(([name, config]) => {
          const idx = Number(String(config.content || "").replace(/\$/g, "")) - 1;
          return { name: String(name || "").toUpperCase(), idx };
        })
        .filter((item) => Number.isInteger(item.idx) && item.idx >= 0)
        .sort((a, b) => a.idx - b.idx);

      placeholders.forEach(({ name, idx }) => {
        const value = substitutions[idx] !== undefined ? String(substitutions[idx]) : "";
        text = text.replace(new RegExp(`\\$${name}\\$`, "g"), value);
      });
    }

    text = text.replace(/\{(\d+)\}/g, (_match, idxText) => {
      const idx = Number(idxText);
      return substitutions[idx] !== undefined ? String(substitutions[idx]) : "";
    });

    return text;
  }

  async function refreshLocaleResources() {
    const resolvedLocale = localeOverride === "auto" ? resolveAutoLocale() : localeOverride;
    localeMessages = await loadLocaleMessages(resolvedLocale);
  }

  function t(key, substitutions = []) {
    const fromForced =
      localeMessages && localeMessages[key] ? formatMessageFromEntry(localeMessages[key], substitutions) : "";
    if (fromForced) {
      return fromForced;
    }

    const message = chrome.i18n.getMessage(key, substitutions);
    return message || key;
  }

  function normalizeLogin(login) {
    return String(login || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
  }

  function isLikelyLogin(segment) {
    return /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(segment);
  }

  function extractLoginFromAtText(text) {
    if (!text) {
      return null;
    }

    const match = String(text).match(/@([a-z\d](?:[a-z\d-]{0,38}))/i);
    if (!match || !isLikelyLogin(match[1])) {
      return null;
    }

    return normalizeLogin(match[1]);
  }

  function extractLoginFromPlainText(text) {
    const candidate = normalizeLogin(text);
    if (!candidate || RESERVED_SEGMENTS.has(candidate) || !isLikelyLogin(candidate)) {
      return null;
    }

    return candidate;
  }

  function extractLoginFromPath(pathname) {
    const cleanPath = pathname.replace(/\/+$/, "") || "/";

    let match = cleanPath.match(/^\/orgs\/[^/]+\/people\/([^/]+)$/i);
    if (match && isLikelyLogin(match[1])) {
      return normalizeLogin(match[1]);
    }

    match = cleanPath.match(/^\/organizations\/[^/]+\/people\/([^/]+)$/i);
    if (match && isLikelyLogin(match[1])) {
      return normalizeLogin(match[1]);
    }

    match = cleanPath.match(/^\/users\/([^/]+)$/i);
    if (match && isLikelyLogin(match[1])) {
      return normalizeLogin(match[1]);
    }

    return null;
  }

  function extractLoginFromSingleSegmentPath(pathname) {
    const cleanPath = pathname.replace(/\/+$/, "") || "/";
    const match = cleanPath.match(/^\/([^/]+)$/);
    if (!match) {
      return null;
    }

    const segment = normalizeLogin(match[1]);
    if (!segment || RESERVED_SEGMENTS.has(segment) || !isLikelyLogin(segment)) {
      return null;
    }

    return segment;
  }

  function isInOrgHeaderOrNav(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    return Boolean(
      element.closest(
        ".orghead, .UnderlineNav, [data-testid='organization-profile-header'], nav[aria-label*='Organization']"
      )
    );
  }

  function isInGlobalHeader(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    return Boolean(
      element.closest(
        "header, .Header, .AppHeader, [data-testid='AppHeader'], [aria-label='Global']"
      )
    );
  }

  function isInUserListContext(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    return Boolean(
      element.closest(
        "[login], [role='option'], [role='listbox'], [class*='user-group-module__'], [class*='slicer-items-module__'], .member-list-item, .js-member-list-item, .prc-ActionList-ActionListItem-So4vC"
      )
    );
  }

  function extractLoginFromHovercardUrl(rawUrl) {
    if (!rawUrl) {
      return null;
    }

    let parsed;
    try {
      parsed = new URL(rawUrl, window.location.origin);
    } catch (_error) {
      return null;
    }

    if (parsed.origin !== window.location.origin) {
      return null;
    }

    const path = parsed.pathname.replace(/\/+$/, "");
    const match = path.match(/^\/users\/([^/]+)\/hovercard$/i);
    if (!match || !isLikelyLogin(match[1])) {
      return null;
    }

    return normalizeLogin(match[1]);
  }

  function extractLoginFromElementData(element) {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const dataLogin = normalizeLogin(element.getAttribute("data-login") || "");
    if (dataLogin && isLikelyLogin(dataLogin)) {
      return dataLogin;
    }

    const rawLogin = normalizeLogin(element.getAttribute("login") || "");
    if (rawLogin && isLikelyLogin(rawLogin)) {
      return rawLogin;
    }

    const rawUrl = element.getAttribute("url") || "";
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl, window.location.origin);
        if (parsed.origin === window.location.origin) {
          const loginFromUrl = extractLoginFromPath(parsed.pathname);
          if (loginFromUrl) {
            return loginFromUrl;
          }
        }
      } catch (_error) {
        // Ignore malformed URL-like values.
      }
    }

    const hovercardType = element.getAttribute("data-hovercard-type");
    if (hovercardType && hovercardType !== "user") {
      return null;
    }

    const hovercardLogin = extractLoginFromHovercardUrl(element.getAttribute("data-hovercard-url") || "");
    if (hovercardLogin) {
      return hovercardLogin;
    }

    const loginFromAria = extractLoginFromAtText(element.getAttribute("aria-label") || "");
    if (loginFromAria) {
      return loginFromAria;
    }

    const className = element.getAttribute("class") || "";
    const isUserTextCell =
      className.includes("user-group-module__TextCell") ||
      className.includes("text-cell-module__SanitizedHtml") ||
      className.includes("sanitized-group-header-text-module__SanitizedHtml") ||
      className.includes("slicer-items-module__title");

    if (isUserTextCell) {
      if (isInOrgHeaderOrNav(element) || isInGlobalHeader(element) || !isInUserListContext(element)) {
        return null;
      }
      return extractLoginFromPlainText(element.textContent || "");
    }

    const loginContainer = element.closest("[login]");
    if (loginContainer instanceof HTMLElement) {
      const closestLogin = normalizeLogin(loginContainer.getAttribute("login") || "");
      if (closestLogin && isLikelyLogin(closestLogin)) {
        return closestLogin;
      }
    }

    return null;
  }

  function extractLoginFromAnchor(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return null;
    }

    const fromData = extractLoginFromElementData(anchor);
    if (fromData) {
      return fromData;
    }

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) {
      return null;
    }

    let parsed;
    try {
      parsed = new URL(anchor.href, window.location.origin);
    } catch (_error) {
      return null;
    }

    if (parsed.origin !== window.location.origin) {
      return null;
    }

    const loginFromKnownPath = extractLoginFromPath(parsed.pathname);
    if (loginFromKnownPath) {
      return loginFromKnownPath;
    }

    if (isInOrgHeaderOrNav(anchor) || isInGlobalHeader(anchor)) {
      return null;
    }

    const hovercardType = anchor.getAttribute("data-hovercard-type");
    if (hovercardType !== "user") {
      return null;
    }

    return extractLoginFromSingleSegmentPath(parsed.pathname);
  }

  function extractLoginFromImage(image) {
    if (!(image instanceof HTMLImageElement)) {
      return null;
    }

    const fromAlt = extractLoginFromAtText(image.getAttribute("alt") || "");
    if (fromAlt) {
      return fromAlt;
    }

    const parentWithData = image.closest("[data-login], [data-hovercard-url], [aria-label]");
    if (!(parentWithData instanceof HTMLElement)) {
      return null;
    }

    return extractLoginFromElementData(parentWithData);
  }

  function extractLoginFromSource(source) {
    if (source instanceof HTMLAnchorElement) {
      return extractLoginFromAnchor(source);
    }

    if (source instanceof HTMLImageElement) {
      return extractLoginFromImage(source);
    }

    return extractLoginFromElementData(source);
  }

  function chooseRenderNode(source) {
    if (!(source instanceof HTMLElement)) {
      return null;
    }

    if (source.hasAttribute("login")) {
      const descriptionWrapInItem = source.querySelector(".prc-ActionList-ItemDescriptionWrap-ujC8S");
      if (descriptionWrapInItem instanceof HTMLElement) {
        return descriptionWrapInItem;
      }

      const labelInItem = source.querySelector(
        ".prc-ActionList-ItemLabel-81ohH, [id$='--label'], [class*='slicer-items-module__title']"
      );
      if (labelInItem instanceof HTMLElement) {
        return labelInItem;
      }
    }

    if (source.matches("a, button, span, img, strong")) {
      return source;
    }

    const preferred = source.querySelector("a[href], button, span, img");
    if (preferred instanceof HTMLElement) {
      return preferred;
    }

    return source;
  }

  function getRenderScope(node) {
    if (!(node instanceof HTMLElement)) {
      return null;
    }

    return (
      node.closest(
        "li, tr, [role='row'], [role='option'], .Box-row, .member-list-item, .js-member-list-item"
      ) || node.parentElement
    );
  }

  function findBadge(node, login) {
    const next = node.nextElementSibling;
    if (!next || !next.classList.contains(BADGE_CLASS)) {
      return null;
    }

    if (next.getAttribute(BADGE_LOGIN_ATTR) !== login) {
      return null;
    }

    return next;
  }

  function removeBadge(node, login) {
    const badge = findBadge(node, login);
    if (badge) {
      badge.remove();
    }
  }

  function removeAdjacentForeignBadge(node, login) {
    const next = node.nextElementSibling;
    if (!next || !next.classList.contains(BADGE_CLASS)) {
      return;
    }

    if (next.getAttribute(BADGE_LOGIN_ATTR) !== login) {
      next.remove();
    }
  }

  function applyTitle(node, login, remark) {
    if (remark) {
      if (!node.hasAttribute(ORIGINAL_TITLE_ATTR)) {
        node.setAttribute(ORIGINAL_TITLE_ATTR, node.getAttribute("title") || "");
      }
      node.setAttribute("title", t("titleWithRemark", [login, remark]));
      return;
    }

    if (!node.hasAttribute(ORIGINAL_TITLE_ATTR)) {
      return;
    }

    const originalTitle = node.getAttribute(ORIGINAL_TITLE_ATTR) || "";
    if (originalTitle) {
      node.setAttribute("title", originalTitle);
    } else {
      node.setAttribute("title", t("titleWithoutRemark", [login]));
    }
    node.removeAttribute(ORIGINAL_TITLE_ATTR);
  }

  function renderRemark(node, login) {
    if (!(node instanceof HTMLElement) || !node.isConnected || !node.parentElement) {
      return;
    }

    removeAdjacentForeignBadge(node, login);

    let badge = findBadge(node, login);
    if (!badge) {
      badge = document.createElement("button");
      badge.type = "button";
      badge.className = BADGE_CLASS;
      badge.setAttribute(BADGE_LOGIN_ATTR, login);
      node.insertAdjacentElement("afterend", badge);
    }

    const remark = notes[login] || "";
    if (!remark) {
      badge.textContent = t("badgeAddRemark");
      badge.classList.add(BADGE_EMPTY_CLASS);
      badge.title = t("badgeAddTitle", [login]);
      applyTitle(node, login, "");
      return;
    }

    badge.classList.remove(BADGE_EMPTY_CLASS);
    badge.textContent = `(${remark})`;
    badge.title = t("badgeEditTitle", [login]);
    applyTitle(node, login, remark);
  }

  function scanAndRender() {
    if (!isSupportedPage()) {
      cleanupInjectedBadges();
      return;
    }

    const processedNodes = new WeakSet();
    const renderedByScope = new WeakMap();

    SOURCE_SELECTORS.forEach((selector) => {
      const sources = document.querySelectorAll(selector);
      sources.forEach((source) => {
        const login = extractLoginFromSource(source);
        if (!login) {
          return;
        }

        const node = chooseRenderNode(source);
        if (!(node instanceof HTMLElement) || processedNodes.has(node)) {
          return;
        }

        if (isInOrgHeaderOrNav(node) || isInGlobalHeader(node)) {
          removeBadge(node, login);
          applyTitle(node, login, "");
          return;
        }

        const scope = getRenderScope(node);
        if (scope) {
          const renderedLogins = renderedByScope.get(scope) || new Set();
          if (renderedLogins.has(login)) {
            removeBadge(node, login);
            applyTitle(node, login, "");
            return;
          }

          renderedLogins.add(login);
          renderedByScope.set(scope, renderedLogins);
        }

        processedNodes.add(node);
        renderRemark(node, login);
      });
    });
  }

  function scheduleScan() {
    if (scanScheduled) {
      return;
    }

    scanScheduled = true;
    window.requestAnimationFrame(() => {
      scanScheduled = false;
      scanAndRender();
    });
  }

  function getAllNotes() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ notes: {} }, (result) => {
        resolve(result.notes || {});
      });
    });
  }

  function setAllNotes(nextNotes) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ notes: nextNotes }, () => {
        resolve();
      });
    });
  }

  async function updateRemark(login, remark) {
    const normalized = normalizeLogin(login);
    if (!normalized) {
      return;
    }

    const nextNotes = { ...notes };
    if (!remark) {
      delete nextNotes[normalized];
    } else {
      nextNotes[normalized] = remark.trim();
    }

    notes = nextNotes;
    await setAllNotes(nextNotes);
    scheduleScan();
  }

  function bindBadgeClick() {
    document.addEventListener("click", async (event) => {
      if (!isSupportedPage()) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.classList.contains(BADGE_CLASS)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const login = target.getAttribute(BADGE_LOGIN_ATTR) || "";
      if (!login) {
        return;
      }

      const current = notes[login] || "";
      const promptTitle = current ? t("promptEditRemark", [login]) : t("promptAddRemark", [login]);
      const next = window.prompt(promptTitle, current);
      if (next === null) {
        return;
      }

      await updateRemark(login, next);
    });
  }

  function bindStorageSync() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      if (changes.notes) {
        notes = changes.notes.newValue || {};
      }

      if (changes.localeOverride) {
        localeOverride = changes.localeOverride.newValue || "en";
        void refreshLocaleResources().then(() => {
          scheduleScan();
        });
        return;
      }

      scheduleScan();
    });
  }

  function bindMutationObserver() {
    const observer = new MutationObserver(() => {
      scheduleScan();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "href",
        "data-login",
        "data-hovercard-type",
        "data-hovercard-url",
        "login",
        "url",
        "aria-label",
        "alt",
        "class"
      ]
    });
  }

  async function init() {
    if (!isSupportedPage()) {
      cleanupInjectedBadges();
      return;
    }

    const preference = await new Promise((resolve) => {
      chrome.storage.sync.get({ localeOverride: "en" }, (result) => {
        resolve(result.localeOverride || "en");
      });
    });
    localeOverride = preference;
    await refreshLocaleResources();
    notes = await getAllNotes();
    bindBadgeClick();
    bindStorageSync();
    bindMutationObserver();
    scheduleScan();
  }

  init();
})();
