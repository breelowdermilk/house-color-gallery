// Gallery + filtering module for House Color Gallery (vanilla JS, ESM).

const DEFAULTS = {
  dataUrl: new URL("../data/images.json", import.meta.url).toString(),
  selectors: {
    gallery: "#galleryGrid, .gallery-grid, #gallery",
    filterContainer: "#filterControls, .filter-controls, #filters",
    roomTabs: "#roomTabs, .room-tabs",
    roomTab: "[data-room]",
    activeRoomTab: "[data-room].active, [data-room][aria-selected='true']",
    filterSelect: "select[data-filter-key], select[data-filter]",
  },
};

const RESERVED_KEYS = new Set([
  "id",
  "room",
  "title",
  "caption",
  "description",
  "src",
  "url",
  "image",
  "full",
  "fullUrl",
  "full_url",
  "thumb",
  "thumbnail",
  "thumbnailUrl",
  "thumbnail_url",
  "path",
  "filename",
  "metadata",
]);

const state = {
  images: [],
  currentRoom: "all",
  filters: {},
  filterOptions: {},
  cleanupLazy: null,
  didInit: false,
};

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function getFilterablePairs(image) {
  const pairs = [];

  if (image && typeof image === "object") {
    for (const [key, value] of Object.entries(image)) {
      if (RESERVED_KEYS.has(key)) continue;
      if (value == null) continue;
      if (typeof value === "object" && !Array.isArray(value)) continue;
      pairs.push([key, value]);
    }

    const meta = image.metadata;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      for (const [key, value] of Object.entries(meta)) {
        if (value == null) continue;
        if (typeof value === "object" && !Array.isArray(value)) continue;
        pairs.push([key, value]);
      }
    }
  }

  return pairs;
}

function getImageRoom(image) {
  return normalizeText(image?.room || image?.metadata?.room || "all").toLowerCase();
}

function getThumbUrl(image) {
  return (
    image?.thumbnail ||
    image?.thumb ||
    image?.thumbnailUrl ||
    image?.thumbnail_url ||
    image?.url ||
    image?.src ||
    image?.image ||
    ""
  );
}

function getFullUrl(image) {
  return (
    image?.full ||
    image?.fullUrl ||
    image?.full_url ||
    image?.url ||
    image?.src ||
    image?.image ||
    getThumbUrl(image)
  );
}

function getTitle(image) {
  return normalizeText(image?.title || image?.caption || image?.description || image?.id || "");
}

function placeholderDataUrl() {
  // 1x1 transparent gif
  return "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
}

function getSelectedRoomFromDom() {
  const tabsRoot = $(DEFAULTS.selectors.roomTabs);
  if (!tabsRoot) return null;
  const active =
    $(DEFAULTS.selectors.activeRoomTab, tabsRoot) || $(DEFAULTS.selectors.roomTab, tabsRoot);
  if (!active) return null;
  const room = active.getAttribute("data-room");
  return room ? normalizeText(room) : null;
}

function readFiltersFromDom() {
  const selects = $all(DEFAULTS.selectors.filterSelect);
  const filters = {};
  for (const select of selects) {
    const key = normalizeText(select.getAttribute("data-filter-key") || select.getAttribute("data-filter"));
    if (!key) continue;
    const value = normalizeText(select.value);
    if (value) filters[key] = value;
  }
  return filters;
}

function setStatusMessage(message) {
  const root = $(DEFAULTS.selectors.gallery);
  if (!root) return;
  root.innerHTML = "";
  const div = document.createElement("div");
  div.className = "gallery-status";
  div.textContent = message;
  root.appendChild(div);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Load images from `data/images.json` and cache them in module state.
 * Returns the loaded array.
 */
export async function loadImages() {
  const dataUrl = DEFAULTS.dataUrl;
  try {
    const json = await fetchJson(dataUrl);
    const images = Array.isArray(json) ? json : Array.isArray(json?.images) ? json.images : [];
    state.images = images;
    return images;
  } catch (error) {
    console.error(error);
    state.images = [];
    setStatusMessage("Could not load images. Check `data/images.json`.");
    return [];
  }
}

/**
 * Extract filter options from images + populate filter dropdowns (if present).
 * Returns a map: { [filterKey]: string[] }.
 */
export function populateFilters(images) {
  const optionsByKey = new Map();

  for (const image of images || []) {
    for (const [key, rawValue] of getFilterablePairs(image)) {
      if (!optionsByKey.has(key)) optionsByKey.set(key, new Set());
      const set = optionsByKey.get(key);

      if (Array.isArray(rawValue)) {
        for (const v of rawValue) {
          const text = normalizeText(v);
          if (text) set.add(text);
        }
      } else {
        const text = normalizeText(rawValue);
        if (text) set.add(text);
      }
    }
  }

  const normalized = {};
  for (const [key, values] of optionsByKey.entries()) {
    normalized[key] = Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  state.filterOptions = normalized;

  const container = $(DEFAULTS.selectors.filterContainer);
  const existingSelects = $all(DEFAULTS.selectors.filterSelect, container || document);

  // If there are existing selects with data-filter keys, populate them in-place.
  if (existingSelects.length) {
    for (const select of existingSelects) {
      const key = normalizeText(select.getAttribute("data-filter-key") || select.getAttribute("data-filter"));
      if (!key || !normalized[key]) continue;
      populateSelect(select, normalized[key], state.filters[key] || "");
    }
    return normalized;
  }

  // Otherwise, create selects for each filter key inside the container (if present).
  if (!container) return normalized;

  container.innerHTML = "";
  const keys = Object.keys(normalized).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    const wrapper = document.createElement("label");
    wrapper.className = "filter-control";

    const label = document.createElement("span");
    label.className = "filter-label";
    label.textContent = key;

    const select = document.createElement("select");
    select.setAttribute("data-filter-key", key);
    populateSelect(select, normalized[key], state.filters[key] || "");

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    container.appendChild(wrapper);
  }

  return normalized;
}

function populateSelect(select, values, selectedValue) {
  const current = normalizeText(selectedValue) || "";
  select.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All";
  select.appendChild(allOpt);

  for (const value of values || []) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }

  select.value = current;
}

/**
 * Apply AND-logic filters to an image set.
 * `filters` is a map of { key: selectedValue }, where empty/undefined means "no filter".
 */
export function filterImages(images, filters = {}) {
  const active = {};
  for (const [key, value] of Object.entries(filters || {})) {
    const v = normalizeText(value);
    if (v) active[key] = v;
  }

  const roomFilter = normalizeText(active.room).toLowerCase();
  if (roomFilter) delete active.room;

  const entries = Object.entries(active);
  const wantsRoom = Boolean(roomFilter) && roomFilter !== "all";

  return (images || []).filter((image) => {
    if (wantsRoom && getImageRoom(image) !== roomFilter) return false;
    for (const [key, selected] of entries) {
      const selectedText = normalizeText(selected);
      const raw =
        image?.[key] ??
        image?.metadata?.[key];

      if (raw == null) return false;

      if (Array.isArray(raw)) {
        const matches = raw.some((v) => normalizeText(v) === selectedText);
        if (!matches) return false;
      } else {
        if (normalizeText(raw) !== selectedText) return false;
      }
    }
    return true;
  });
}

/**
 * Render the gallery grid for a room + filters.
 * If `room` is falsy, uses module state/current tab.
 */
export function renderGallery(room, filters = {}) {
  const root = $(DEFAULTS.selectors.gallery);
  if (!root) return;

  if (typeof state.cleanupLazy === "function") {
    state.cleanupLazy();
    state.cleanupLazy = null;
  }

  const roomValue = normalizeText(room || state.currentRoom || "all").toLowerCase();
  state.currentRoom = roomValue || "all";
  state.filters = { ...filters };

  const filtered = filterImages(state.images, { ...filters, room: roomValue });

  root.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "gallery-empty";
    empty.textContent = "No images match these filters.";
    root.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const image of filtered) {
    const figure = document.createElement("figure");
    figure.className = "gallery-item";

    const a = document.createElement("a");
    a.className = "gallery-link";
    a.href = getFullUrl(image);
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const img = document.createElement("img");
    img.className = "gallery-thumb";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = getTitle(image) || "Gallery image";

    const thumb = getThumbUrl(image);
    img.src = placeholderDataUrl();
    img.dataset.src = thumb;

    a.appendChild(img);
    figure.appendChild(a);

    const title = getTitle(image);
    if (title) {
      const cap = document.createElement("figcaption");
      cap.className = "gallery-caption";
      cap.textContent = title;
      figure.appendChild(cap);
    }

    frag.appendChild(figure);
  }

  root.appendChild(frag);
  state.cleanupLazy = setupLazyLoading(root);
}

function setupLazyLoading(root) {
  const imgs = $all("img[data-src]", root);
  if (!imgs.length) return null;

  const load = (img) => {
    const src = normalizeText(img.dataset.src);
    if (!src) return;
    img.src = src;
    img.removeAttribute("data-src");
  };

  if (!("IntersectionObserver" in window)) {
    for (const img of imgs) load(img);
    return null;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        observer.unobserve(img);
        load(img);
      }
    },
    { root: null, rootMargin: "200px 0px", threshold: 0.01 }
  );

  for (const img of imgs) observer.observe(img);
  return () => observer.disconnect();
}

function setActiveRoomTab(room) {
  const tabsRoot = $(DEFAULTS.selectors.roomTabs);
  if (!tabsRoot) return;
  const normalizedRoom = normalizeText(room).toLowerCase();
  for (const tab of $all(DEFAULTS.selectors.roomTab, tabsRoot)) {
    const tabRoom = normalizeText(tab.getAttribute("data-room")).toLowerCase();
    const isActive = tabRoom === normalizedRoom;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  }
}

function onRoomTabClick(event) {
  const tabsRoot = $(DEFAULTS.selectors.roomTabs);
  if (!tabsRoot) return;
  const target = event.target instanceof Element ? event.target.closest(DEFAULTS.selectors.roomTab) : null;
  if (!target || !tabsRoot.contains(target)) return;
  event.preventDefault();

  const room = normalizeText(target.getAttribute("data-room")).toLowerCase() || "all";
  state.currentRoom = room;
  setActiveRoomTab(room);

  const filters = readFiltersFromDom();
  state.filters = filters;
  renderGallery(room, filters);
}

function onFilterChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  const key = normalizeText(target.getAttribute("data-filter-key") || target.getAttribute("data-filter"));
  if (!key) return;

  state.filters = readFiltersFromDom();
  renderGallery(state.currentRoom, state.filters);
}

async function initGallery() {
  if (state.didInit) return;
  const galleryRoot = $(DEFAULTS.selectors.gallery);
  if (!galleryRoot) return;
  state.didInit = true;

  const roomFromDom = getSelectedRoomFromDom();
  if (roomFromDom) state.currentRoom = normalizeText(roomFromDom).toLowerCase();

  setStatusMessage("Loading images…");
  const images = await loadImages();
  populateFilters(images);

  document.addEventListener("click", onRoomTabClick);
  document.addEventListener("change", onFilterChange);

  state.filters = readFiltersFromDom();
  renderGallery(state.currentRoom, state.filters);
}

// Auto-init on load.
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGallery, { once: true });
  } else {
    initGallery();
  }
}

// Optional global export (handy even when using ESM).
if (typeof window !== "undefined") {
  window.HouseColorGallery = {
    loadImages,
    renderGallery,
    populateFilters,
    filterImages,
    initGallery,
  };
}

export { initGallery };
