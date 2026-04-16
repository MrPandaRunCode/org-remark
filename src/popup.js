const form = document.getElementById("remark-form");
const loginInput = document.getElementById("login");
const remarkInput = document.getElementById("remark");
const clearBtn = document.getElementById("clear-btn");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFileInput = document.getElementById("import-file");
const noteList = document.getElementById("note-list");
const statusEl = document.getElementById("status");
const localeToggleBtn = document.getElementById("locale-toggle-btn");
const localeToggleText = document.getElementById("locale-toggle-text");

const RESERVED_SEGMENTS = new Set([
  "about",
  "account",
  "apps",
  "blog",
  "collections",
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
  "orgs",
  "organizations",
  "pricing",
  "projects",
  "pulls",
  "readme",
  "search",
  "security",
  "settings",
  "site",
  "sponsors",
  "support",
  "topics",
  "trending",
  "users"
]);

let localeOverride = "en";
let localeMessages = null;

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
  document.documentElement.lang = resolvedLocale === "zh_CN" ? "zh-CN" : "en";
}

function t(key, substitutions = []) {
  const fromForced = localeMessages && localeMessages[key] ? formatMessageFromEntry(localeMessages[key], substitutions) : "";
  if (fromForced) {
    return fromForced;
  }

  const fromChrome = chrome.i18n.getMessage(key, substitutions);
  if (fromChrome) {
    return fromChrome;
  }

  return key;
}

function applyI18nToDom() {
  const i18nNodes = document.querySelectorAll("[data-i18n]");
  i18nNodes.forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (!key) {
      return;
    }

    node.textContent = t(key);
  });

  const i18nPlaceholderNodes = document.querySelectorAll("[data-i18n-placeholder]");
  i18nPlaceholderNodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    const key = node.getAttribute("data-i18n-placeholder");
    if (!key) {
      return;
    }

    node.setAttribute("placeholder", t(key));
  });

  if (localeToggleText) {
    localeToggleText.textContent = localeOverride === "zh_CN" ? "中" : "EN";
  }

  if (localeToggleBtn) {
    const nextLangLabel = localeOverride === "zh_CN" ? t("languageEnglish") : t("languageChinese");
    localeToggleBtn.title = `${t("languageLabel")}: ${nextLangLabel}`;
  }
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

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#cf222e" : "#1f883d";
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

function parseLoginFromUrl(rawUrl) {
  if (!rawUrl) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    if (url.origin !== "https://github.com") {
      return "";
    }

    const path = url.pathname.replace(/\/+$/, "");
    const directMatch = path.match(/^\/([a-z\d](?:[a-z\d-]{0,38}))$/i);
    if (directMatch && !RESERVED_SEGMENTS.has(normalizeLogin(directMatch[1]))) {
      return normalizeLogin(directMatch[1]);
    }

    const peopleMatch = path.match(/^\/orgs\/[^/]+\/people\/([a-z\d](?:[a-z\d-]{0,38}))$/i);
    if (peopleMatch) {
      return normalizeLogin(peopleMatch[1]);
    }

    const usersMatch = path.match(/^\/users\/([a-z\d](?:[a-z\d-]{0,38}))$/i);
    if (usersMatch) {
      return normalizeLogin(usersMatch[1]);
    }
  } catch (_error) {
    return "";
  }

  return "";
}

function sanitizeNotesMap(rawNotes) {
  if (!rawNotes || typeof rawNotes !== "object" || Array.isArray(rawNotes)) {
    return {};
  }

  const normalizedNotes = {};
  Object.entries(rawNotes).forEach(([rawLogin, rawRemark]) => {
    const login = normalizeLogin(rawLogin);
    const remark = String(rawRemark || "").trim();
    if (!login || RESERVED_SEGMENTS.has(login) || !isLikelyLogin(login) || !remark) {
      return;
    }

    normalizedNotes[login] = remark;
  });

  return normalizedNotes;
}

function renderNoteList(notes) {
  const entries = Object.entries(notes).sort((a, b) => a[0].localeCompare(b[0]));
  noteList.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = t("noNotesYet");
    noteList.appendChild(empty);
    return;
  }

  entries.forEach(([login, remark]) => {
    const item = document.createElement("li");
    item.className = "note-item";
    item.dataset.login = login;

    const main = document.createElement("div");
    main.className = "note-main";

    const loginEl = document.createElement("div");
    loginEl.className = "note-login";
    loginEl.textContent = `@${login}`;

    const remarkEl = document.createElement("div");
    remarkEl.className = "note-remark";
    remarkEl.textContent = String(remark);
    remarkEl.title = String(remark);

    const actions = document.createElement("div");
    actions.className = "note-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.dataset.action = "edit";
    editBtn.textContent = t("edit");

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.dataset.action = "delete";
    deleteBtn.textContent = t("delete");

    main.appendChild(loginEl);
    main.appendChild(remarkEl);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(main);
    item.appendChild(actions);
    noteList.appendChild(item);
  });
}

async function saveNote(login, remark) {
  const normalized = normalizeLogin(login);
  if (!normalized) {
    setStatus(t("invalidLogin"), true);
    return;
  }

  const value = String(remark || "").trim();
  if (!value) {
    setStatus(t("requiredRemark"), true);
    return;
  }

  const notes = await getAllNotes();
  notes[normalized] = value;
  await setAllNotes(notes);
  renderNoteList(notes);
  setStatus(t("savedStatus", [normalized]));
}

async function deleteNote(login) {
  const normalized = normalizeLogin(login);
  if (!normalized) {
    return;
  }

  const notes = await getAllNotes();
  if (!(normalized in notes)) {
    return;
  }

  delete notes[normalized];
  await setAllNotes(notes);
  renderNoteList(notes);
  setStatus(t("deletedStatus", [normalized]));
}

async function exportNotesAsJson() {
  const notes = await getAllNotes();
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    notes
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `github-remark-notes-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus(t("exportedStatus", [String(Object.keys(notes).length)]));
}

async function importNotesFromFile(file) {
  if (!file) {
    return;
  }

  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch (_error) {
    setStatus(t("importInvalidJson"), true);
    return;
  }

  const rawNotes =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.notes
      ? parsed.notes
      : parsed;

  const importedNotes = sanitizeNotesMap(rawNotes);
  const importedCount = Object.keys(importedNotes).length;
  if (!importedCount) {
    setStatus(t("importNoValidData"), true);
    return;
  }

  const current = await getAllNotes();
  const merged = { ...current, ...importedNotes };
  await setAllNotes(merged);
  renderNoteList(merged);
  setStatus(t("importedStatus", [String(importedCount)]));
}

async function prefillLoginFromCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  const autoLogin = parseLoginFromUrl(activeTab && activeTab.url ? activeTab.url : "");
  if (autoLogin) {
    loginInput.value = autoLogin;
  }
}

function bindEvents() {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveNote(loginInput.value, remarkInput.value);
    remarkInput.value = "";
  });

  clearBtn.addEventListener("click", () => {
    loginInput.value = "";
    remarkInput.value = "";
    setStatus("");
  });

  exportBtn.addEventListener("click", async () => {
    await exportNotesAsJson();
  });

  importBtn.addEventListener("click", () => {
    importFileInput.click();
  });

  importFileInput.addEventListener("change", async () => {
    const file = importFileInput.files && importFileInput.files[0] ? importFileInput.files[0] : null;
    await importNotesFromFile(file);
    importFileInput.value = "";
  });

  if (localeToggleBtn) {
    localeToggleBtn.addEventListener("click", async () => {
      localeOverride = localeOverride === "zh_CN" ? "en" : "zh_CN";
      await new Promise((resolve) => {
        chrome.storage.sync.set({ localeOverride }, () => resolve());
      });
      await refreshLocaleResources();
      applyI18nToDom();
      renderNoteList(await getAllNotes());
      setStatus("");
    });
  }

  noteList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const item = target.closest(".note-item");
    if (!(item instanceof HTMLElement)) {
      return;
    }

    const login = item.dataset.login || "";
    const action = target.dataset.action;

    if (action === "edit") {
      const notes = await getAllNotes();
      loginInput.value = login;
      remarkInput.value = notes[login] || "";
      remarkInput.focus();
      return;
    }

    if (action === "delete") {
      await deleteNote(login);
    }
  });
}

async function init() {
  const preference = await new Promise((resolve) => {
    chrome.storage.sync.get({ localeOverride: "en" }, (result) => {
      resolve(result.localeOverride || "en");
    });
  });

  localeOverride = preference;
  await refreshLocaleResources();
  applyI18nToDom();
  bindEvents();
  const notes = await getAllNotes();
  renderNoteList(notes);
  await prefillLoginFromCurrentTab();
}

init();
