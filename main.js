import "./helpers/helpers.js";

const GOLINKS_TEMPLATE = { "gh": "https://github.com" };
const INDEX_GOLINK_NAMES = ["links", "/"];
const SHARED_REFRESH_ALARM = "refreshSharedGolinks";
const SHARED_REFRESH_MINUTES = 60;
const SHARED_FETCH_TIMEOUT_MS = 2000;
const TRAILING_SLASHES = /\/+$/;
const XML_SPECIAL_CHARS = /[&<>"']/g;

chrome.runtime.onInstalled.addListener(async () => {
  await syncManagedSettings();
  startSharedRefresh();
  const { golinks } = await chrome.storage.local.get("golinks");
  if (golinks) {
    return;
  }
  await chrome.storage.local.set({ golinks: GOLINKS_TEMPLATE });
  await chrome.tabs.update({ url: '/pages/help.html' });
});


chrome.runtime.onStartup.addListener(async () => {
  await syncManagedSettings();
  startSharedRefresh();
});


chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SHARED_REFRESH_ALARM) {
    refreshSharedGolinks();
  }
});


chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "managed") {
    return syncManagedSettings();
  }
  if (areaName !== "local") {
    return;
  }
  if ((changes.sharedGolinksSkipHeader || changes.sharedGolinksNoCache) && !changes.sharedGolinksURL) {
    const { sharedGolinksNoCache = false } = await chrome.storage.local.get("sharedGolinksNoCache");
    if (changes.sharedGolinksSkipHeader) {
      globalThis.__golinksPlusSharedFetch = undefined;
    }
    if (sharedGolinksNoCache) {
      globalThis.__golinksPlusSharedCache = undefined;
    }
    return refreshSharedGolinks();
  }
  if (!changes.sharedGolinksURL) {
    if (changes.sharedGolinksNoCache) {
      globalThis.__golinksPlusSharedCache = undefined;
      refreshSharedGolinks();
    }
    return;
  }
  // Drops the previous URL's golinks so they don't linger if the new URL fails
  await chrome.storage.local.remove(["sharedGolinks", "sharedGolinksError"]);
  globalThis.__golinksPlusSharedCache = undefined;
  globalThis.__golinksPlusSharedFetch = undefined;
  refreshSharedGolinks();
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "refreshSharedGolinks") {
    refreshSharedGolinks().then(() => sendResponse());
    // Keeps the message channel open until sendResponse is called
    return true;
  }
  if (message?.type === "retryGolink") {
    openGolink(message.text ?? "", "currentTab", { forceSharedRefresh: true })
      .then(() => sendResponse())
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
});


// Suggestions can only be supplied after the first keystroke; until then only the default suggestion shows
chrome.omnibox.onInputStarted.addListener(() => {
  chrome.omnibox.setDefaultSuggestion({ description: getDefaultDescription("", {}) });
});


chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const query = __helpers.sanitizeGolinkName(text);
  const golinks = await getGolinks();
  chrome.omnibox.setDefaultSuggestion({ description: getDefaultDescription(text, golinks) });
  const matches = Object.entries(golinks)
    .map(([name, url]) => ({ name, url, match: fuzzyMatch(query, name) }))
    .filter(({ match }) => match)
    .sort(compareMatches);
  suggest(matches.map(({ name, url, match }) => ({
    content: name,
    description: describeLink(highlightMatches(name, match.indices), url),
  })));
});


// Receives the selected suggestion's content, or the raw input when no suggestion is selected
chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  openGolink(text, disposition);
});


// region Helpers

function compareMatches(a, b) {
  return b.match.score - a.match.score || a.name.length - b.name.length || a.name.localeCompare(b.name);
}

function describeLink(nameMarkup, url) {
  return `${nameMarkup} <dim>-</dim> <url>${escapeXML(url)}</url>`;
}

function escapeXML(str) {
  return str.replace(XML_SPECIAL_CHARS, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  }[char]));
}

// Subsequence match. Scores consecutive characters and segment starts higher, gaps lower.
// An empty query matches every name with score 0.
function fuzzyMatch(query, name) {
  const indices = [];
  let score = 0;
  let nameIndex = 0;

  for (const char of query) {
    const found = name.indexOf(char, nameIndex);

    if (found === -1) {
      return null;
    }
    if (found === 0 || name[found - 1] === "/") {
      score += 3;
    }
    if (indices.length > 0 && found === nameIndex) {
      score += 2;
    }

    score -= (found - nameIndex);
    indices.push(found);
    nameIndex = (found + 1);
  }

  return { score, indices };
}

// Reuses the fetch already in progress so callers wait for the same shared CSV request
function fetchSharedGolinks() {
  if (!globalThis.__golinksPlusSharedFetch) {
    const request = (async () => {
      const { sharedGolinksURL, sharedGolinksSkipHeader = false } = await chrome.storage.local.get(["sharedGolinksURL", "sharedGolinksSkipHeader"]);
      if (!sharedGolinksURL) {
        return null;
      }
      // Credentials are only sent with host permission; without it CORS applies, and servers that
      // allow any origin ("*") reject credentialed requests
      const hasHostPermission = await chrome.permissions.contains(__helpers.toHostPermission(sharedGolinksURL));
      const response = await fetch(sharedGolinksURL, { credentials: hasHostPermission ? "include" : "same-origin" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return __helpers.parseGolinksCSV(await response.text(), sharedGolinksSkipHeader);
    })();
    const pending = request.finally(() => {
      // A newer fetch may have replaced this one, so only clear our own promise
      if (globalThis.__golinksPlusSharedFetch === pending) {
        globalThis.__golinksPlusSharedFetch = undefined;
      }
    });
    globalThis.__golinksPlusSharedFetch = pending;
  }
  return globalThis.__golinksPlusSharedFetch;
}

// Rejects when the promise takes too long, so an unavailable shared CSV can't block golinks
function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("Timed out loading shared golinks");
      error.name = "SharedGolinksTimeoutError";
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

// A refresh may already be fetching the CSV. Wait for it (briefly) so golinks resolve
// against the current shared links instead of stale or missing data. forceRefresh skips
// the in-memory cache so a retry starts a new request.
async function loadSharedGolinks({ forceRefresh = false } = {}) {
  const pendingFetch = globalThis.__golinksPlusSharedFetch;
  if (!forceRefresh && !pendingFetch && globalThis.__golinksPlusSharedCache && Object.keys(globalThis.__golinksPlusSharedCache).length > 0) {
    return { golinks: globalThis.__golinksPlusSharedCache, timedOut: false, error: null };
  }
  const request = pendingFetch || fetchSharedGolinks();
  try {
    const fetched = await withTimeout(request, SHARED_FETCH_TIMEOUT_MS);
    if (fetched) {
      globalThis.__golinksPlusSharedCache = fetched;
    }
    return { golinks: fetched ?? {}, timedOut: false, error: null };
  } catch (error) {
    const timedOut = error?.name === "SharedGolinksTimeoutError"
      || error?.name === "TimeoutError"
      || error?.message === "Timed out loading shared golinks";
    // Let the next attempt start a fresh request instead of waiting on the one that timed out
    if (timedOut && globalThis.__golinksPlusSharedFetch === request) {
      globalThis.__golinksPlusSharedFetch = undefined;
    }
    // Timeouts and failed fetches keep the previously loaded shared golinks, if any
    return {
      golinks: globalThis.__golinksPlusSharedCache || {},
      timedOut,
      error: timedOut ? null : (error?.message || String(error)),
    };
  }
}

// Local golinks win over shared golinks with the same name
async function getGolinks() {
  const { golinks = {}, sharedGolinks = {}, sharedGolinksURL, sharedGolinksNoCache = false } = await chrome.storage.local.get(["golinks", "sharedGolinks", "sharedGolinksURL", "sharedGolinksNoCache"]);
  const sharedGolinksData = (sharedGolinksNoCache && sharedGolinksURL)
    ? (await loadSharedGolinks()).golinks
    : (sharedGolinks || {});
  return { ...sharedGolinksData, ...golinks };
}

// Shared links could not be fetched in time, so the requested golink may still exist
function getSharedTimeoutURL(name, text) {
  return `${chrome.runtime.getURL("pages/shared-timeout.html")}?name=${encodeURIComponent(name)}&text=${encodeURIComponent(text)}`;
}

// Shared links could not be fetched, so the requested golink may still exist
function getSharedErrorURL(name, text, error) {
  const errorParam = error ? `&error=${encodeURIComponent(error)}` : "";
  return `${chrome.runtime.getURL("pages/shared-error.html")}?name=${encodeURIComponent(name)}&text=${encodeURIComponent(text)}${errorParam}`;
}

async function openGolink(text, disposition, { forceSharedRefresh = false } = {}) {
  const { golinks = {}, sharedGolinks = {}, sharedGolinksURL, sharedGolinksNoCache = false, sharedGolinksError } = await chrome.storage.local.get(["golinks", "sharedGolinks", "sharedGolinksURL", "sharedGolinksNoCache", "sharedGolinksError"]);

  // Personal golinks resolve right away, even if the shared CSV has not loaded yet
  const localURL = resolveGolinkURL(text, golinks);
  if (localURL) {
    return navigate(localURL, disposition);
  }

  let sharedGolinksData = sharedGolinks || {};
  let sharedGolinksTimedOut = false;
  let sharedGolinksLoadError = sharedGolinksURL ? (sharedGolinksError || null) : null;
  if (sharedGolinksURL && (sharedGolinksNoCache || forceSharedRefresh)) {
    const shared = await loadSharedGolinks({ forceRefresh: forceSharedRefresh });
    // Cached mode already has links in storage, so keep them when a forced refresh fails
    if (sharedGolinksNoCache || (!shared.error && !shared.timedOut)) {
      sharedGolinksData = shared.golinks;
    }
    sharedGolinksTimedOut = shared.timedOut;
    sharedGolinksLoadError = shared.error;
    // A retry in cached mode fetched the shared links directly, so persist the result
    if (forceSharedRefresh && !sharedGolinksNoCache) {
      if (sharedGolinksLoadError) {
        await chrome.storage.local.set({ sharedGolinksError: sharedGolinksLoadError });
      } else if (!sharedGolinksTimedOut) {
        await chrome.storage.local.set({ sharedGolinks: sharedGolinksData });
        await chrome.storage.local.remove("sharedGolinksError");
      }
    }
  }
  const url = resolveGolinkURL(text, { ...sharedGolinksData, ...golinks });
  if (url) {
    return navigate(url, disposition);
  }
  const name = __helpers.sanitizeGolinkName(text);
  if (!name || INDEX_GOLINK_NAMES.includes(name)) {
    return navigate(chrome.runtime.getURL("pages/index.html"), disposition);
  }
  // Don't send the user to the create page or creation URL when the link may already exist
  if (sharedGolinksTimedOut) {
    return navigate(getSharedTimeoutURL(name, text), disposition);
  }
  if (sharedGolinksLoadError) {
    return navigate(getSharedErrorURL(name, text, sharedGolinksLoadError), disposition);
  }
  const sharedCreateURL = await getSharedCreateURL(name);
  return navigate(sharedCreateURL || chrome.runtime.getURL(`pages/create.html?name=${encodeURIComponent(name)}`), disposition);
}

// Matches the create page, which only allows shared link creation when a shared CSV URL is also set
async function getSharedCreateURL(name) {
  const { sharedGolinksURL, sharedGolinksCreateURLTemplate, sharedGolinksCreateOnUnknown } = await chrome.storage.local.get(["sharedGolinksURL", "sharedGolinksCreateURLTemplate", "sharedGolinksCreateOnUnknown"]);
  if (!sharedGolinksURL || !sharedGolinksCreateURLTemplate || !sharedGolinksCreateOnUnknown) {
    return null;
  }
  return __helpers.fillURLTemplate(sharedGolinksCreateURLTemplate, name, '');
}

function getDefaultDescription(text, golinks) {
  const url = resolveGolinkURL(text, golinks);
  if (url) {
    return describeLink(`<match>go ${escapeXML(text.trim())}</match>`, url);
  }

  const name = __helpers.sanitizeGolinkName(text);
  if (!name) {
    return "Open golinks index, or type to search";
  }
  if (INDEX_GOLINK_NAMES.includes(name)) {
    return "Open golinks index";
  }

  return `Create <match>go ${escapeXML(name)}</match>`;
}

function highlightMatches(name, indices) {
  const matched = new Set(indices);
  let result = "";
  let inMatch = false;
  for (let i = 0; i < name.length; i++) {
    const isMatch = matched.has(i);
    if (isMatch !== inMatch) {
      result += isMatch ? "<match>" : "</match>";
      inMatch = isMatch;
    }
    result += escapeXML(name[i]);
  }
  return inMatch ? `${result}</match>` : result;
}

function navigate(url, disposition) {
  if (disposition === "newForegroundTab") {
    return chrome.tabs.create({ url });
  }
  if (disposition === "newBackgroundTab") {
    return chrome.tabs.create({ url, active: false });
  }
  return chrome.tabs.update({ url });
}

// Failed fetches keep the cached shared golinks and record the error for the options page
async function refreshSharedGolinks() {
  const { sharedGolinksURL, sharedGolinksNoCache = false } = await chrome.storage.local.get(["sharedGolinksURL", "sharedGolinksNoCache"]);
  if (!sharedGolinksURL) {
    return;
  }

  try {
    const sharedGolinks = await fetchSharedGolinks();
    if (!sharedGolinks) {
      return;
    }
    if (sharedGolinksNoCache) {
      await chrome.storage.local.remove(["sharedGolinks"]);
      await chrome.storage.local.remove("sharedGolinksError");
      globalThis.__golinksPlusSharedCache = sharedGolinks;
      return;
    }
    await chrome.storage.local.set({ sharedGolinks });
    await chrome.storage.local.remove("sharedGolinksError");
  } catch (error) {
    await chrome.storage.local.set({ sharedGolinksError: error.message });
  }
}

// The longest "/"-separated prefix of the input that names a golink wins. The rest of the
// input, from its leading slash on, is appended to that golink's URL as typed.
function resolveGolinkURL(text, golinks) {
  const segments = text.trim().split("/");

  for (let i = segments.length; i > 0; i--) {
    const name = __helpers.sanitizeGolinkName(segments.slice(0, i).join("/"));

    if (!Object.hasOwn(golinks, name)) {
      continue;
    }
    if (i === segments.length) {
      return golinks[name];
    }

    return `${golinks[name].replace(TRAILING_SLASHES, "")}/${segments.slice(i).join("/")}`;
  }

  return null;
}

// Copies policy values over local ones; readers only use local storage. Invalid URLs are skipped.
// A value later removed from policy stays in local storage, where the user can edit it again.
// sharedGolinksCreateOnUnknown is only a default, used when the user has no value of their own.
async function syncManagedSettings() {
  const { sharedGolinksCreateOnUnknown, ...managed } = await chrome.storage.managed.get(null);
  if (sharedGolinksCreateOnUnknown !== undefined) {
    const local = await chrome.storage.local.get("sharedGolinksCreateOnUnknown");
    if (local.sharedGolinksCreateOnUnknown === undefined) {
      managed.sharedGolinksCreateOnUnknown = sharedGolinksCreateOnUnknown;
    }
  }
  if (managed.sharedGolinksURL !== undefined && !__helpers.isValidURL(managed.sharedGolinksURL)) {
    delete managed.sharedGolinksURL;
  }
  if (managed.sharedGolinksCreateURLTemplate !== undefined
    && !__helpers.isValidURL(__helpers.fillURLTemplate(managed.sharedGolinksCreateURLTemplate, "name", "https://example.com"))) {
    delete managed.sharedGolinksCreateURLTemplate;
  }
  await chrome.storage.local.set(managed);
}

// Fires right away, then on an interval. Re-created on each start because Chrome may clear alarms on restart.
function startSharedRefresh() {
  chrome.alarms.create(SHARED_REFRESH_ALARM, { when: Date.now(), periodInMinutes: SHARED_REFRESH_MINUTES });
}

// endregion
