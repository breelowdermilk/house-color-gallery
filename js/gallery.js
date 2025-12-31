/**
 * Gallery + filtering module for House Color Gallery (classic script).
 *
 * - Loads `data/images.json`
 * - Renders into `#image-grid`
 * - Populates filters into `#filter-dropdowns`
 * - Room switching via `.room-tab[data-room]`
 *
 * Public API: `window.Gallery`
 */

const Gallery = (function () {
  const DATA_URL = "data/images.json";

  const FILTER_KEYS = ["walls", "trim", "feature", "pattern", "wainscoting", "type"];

  const SELECTORS = {
    grid: "#image-grid",
    results: "#results-summary",
    empty: "#empty-state",
    filterContainer: "#filter-dropdowns",
    roomTab: ".room-tab[data-room]",
    activeRoomTab: ".room-tab[data-room][aria-selected='true']",
    clearFilters: "#clear-filters",
  };

  const state = {
    allImages: [],
    currentRoom: "parlor",
    filters: {},
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

  function titleCase(key) {
    return normalizeText(key)
      .split(/[-_\s]+/g)
      .filter(Boolean)
      .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
      .join(" ");
  }

  function placeholderDataUrl() {
    return "data:image/gif;base64,R0lGODlhAQABAAAAACw="; // 1x1 transparent gif
  }

  function setResultsSummary(text) {
    const el = $(SELECTORS.results);
    if (!el) return;
    el.textContent = text;
  }

  function setEmptyState(isEmpty) {
    const el = $(SELECTORS.empty);
    if (!el) return;
    el.classList.toggle("hidden", !isEmpty);
  }

  function getSelectedRoomFromDom() {
    const active = $(SELECTORS.activeRoomTab) || $(SELECTORS.roomTab);
    const room = active?.getAttribute("data-room");
    return normalizeText(room).toLowerCase() || null;
  }

  function setActiveRoomTab(room) {
    const normalizedRoom = normalizeText(room).toLowerCase();
    for (const tab of $all(SELECTORS.roomTab)) {
      const tabRoom = normalizeText(tab.getAttribute("data-room")).toLowerCase();
      const isActive = tabRoom === normalizedRoom;
      tab.setAttribute("aria-selected", isActive ? "true" : "false");

      // Keep visual styles consistent with the initial Tailwind markup.
      if (isActive) {
        tab.classList.add("bg-slate-900", "text-white");
        tab.classList.remove("border", "border-slate-200", "bg-white", "text-slate-700", "hover:bg-slate-50");
      } else {
        tab.classList.remove("bg-slate-900", "text-white");
        tab.classList.add("border", "border-slate-200", "bg-white", "text-slate-700", "hover:bg-slate-50");
      }
    }
  }

  function flattenImages(json) {
    if (Array.isArray(json)) return json;
    if (json && typeof json === "object") {
      if (Array.isArray(json.images)) return json.images;

      const flattened = [];
      for (const [room, items] of Object.entries(json)) {
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          flattened.push({ ...item, room });
        }
      }
      return flattened;
    }
    return [];
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async function loadImages() {
    try {
      const json = await fetchJson(DATA_URL);
      state.allImages = flattenImages(json);
      return state.allImages;
    } catch (error) {
      console.error(error);
      state.allImages = [];
      setResultsSummary("Could not load images. Check `data/images.json`.");
      return [];
    }
  }

  function getRoomImages(room) {
    const normalizedRoom = normalizeText(room).toLowerCase();
    if (!normalizedRoom || normalizedRoom === "all") return state.allImages;
    return state.allImages.filter((img) => normalizeText(img.room).toLowerCase() === normalizedRoom);
  }

  function readFiltersFromDom() {
    const container = $(SELECTORS.filterContainer);
    if (!container) return {};
    const selects = $all("select[data-filter-key]", container);
    const filters = {};
    for (const select of selects) {
      const key = normalizeText(select.getAttribute("data-filter-key"));
      const value = normalizeText(select.value);
      if (key && value) filters[key] = value;
    }
    return filters;
  }

  function populateSelect(select, values, selectedValue) {
    const current = normalizeText(selectedValue);
    select.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All";
    select.appendChild(allOpt);

    for (const value of values) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    }

    if (current && values.includes(current)) {
      select.value = current;
    } else {
      select.value = "";
    }
  }

  function populateFilters(images) {
    const optionsByKey = {};
    for (const key of FILTER_KEYS) optionsByKey[key] = new Set();

    for (const image of images || []) {
      for (const key of FILTER_KEYS) {
        const raw = image?.[key];
        if (raw == null) continue;
        if (Array.isArray(raw)) {
          for (const v of raw) {
            const text = normalizeText(v);
            if (text) optionsByKey[key].add(text);
          }
        } else {
          const text = normalizeText(raw);
          if (text) optionsByKey[key].add(text);
        }
      }
    }

    const container = $(SELECTORS.filterContainer);
    if (!container) return {};

    const normalized = {};
    for (const key of FILTER_KEYS) {
      normalized[key] = Array.from(optionsByKey[key]).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      );
    }

    container.innerHTML = "";
    for (const key of FILTER_KEYS) {
      const values = normalized[key];
      if (!values.length) continue;

      const wrapper = document.createElement("div");
      wrapper.className = "col-span-1";

      const label = document.createElement("label");
      const id = `filter-${key}`;
      label.className = "block text-xs font-medium text-slate-700";
      label.setAttribute("for", id);
      label.textContent = titleCase(key);

      const select = document.createElement("select");
      select.id = id;
      select.className =
        "mt-1 block w-full rounded-md border-slate-200 bg-white text-sm shadow-sm focus:border-slate-400 focus:ring-slate-400";
      select.setAttribute("data-filter-key", key);

      populateSelect(select, values, state.filters[key] || "");

      wrapper.appendChild(label);
      wrapper.appendChild(select);
      container.appendChild(wrapper);
    }

    // Make container layout match the old form.
    container.classList.add("grid", "grid-cols-2", "gap-3", "sm:grid-cols-4");

    return normalized;
  }

  function filterImages(images, filters) {
    const entries = Object.entries(filters || {}).filter(([, v]) => normalizeText(v));
    if (!entries.length) return images || [];

    return (images || []).filter((image) => {
      for (const [key, selected] of entries) {
        const wanted = normalizeText(selected);
        const raw = image?.[key];
        if (raw == null) return false;
        if (Array.isArray(raw)) {
          if (!raw.some((v) => normalizeText(v) === wanted)) return false;
        } else {
          if (normalizeText(raw) !== wanted) return false;
        }
      }
      return true;
    });
  }

  function getThumbUrl(image) {
    return normalizeText(image?.thumbnail || image?.thumb || image?.url || image?.src || "");
  }

  function getFullUrl(image) {
    return normalizeText(image?.url || image?.src || getThumbUrl(image));
  }

  function getTitle(image) {
    return normalizeText(image?.pattern || image?.walls || image?.feature || image?.id || "");
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

  function renderGallery(room, filters) {
    const grid = $(SELECTORS.grid);
    if (!grid) return;

    if (typeof state.cleanupLazy === "function") {
      state.cleanupLazy();
      state.cleanupLazy = null;
    }

    const roomValue = normalizeText(room || state.currentRoom).toLowerCase();
    state.currentRoom = roomValue || state.currentRoom;
    state.filters = { ...(filters || {}) };

    const roomImages = getRoomImages(state.currentRoom);
    const filtered = filterImages(roomImages, state.filters);

    grid.innerHTML = "";
    setEmptyState(filtered.length === 0);
    setResultsSummary(`${filtered.length} photo${filtered.length === 1 ? "" : "s"}`);

    const frag = document.createDocumentFragment();
    for (const image of filtered) {
      const card = document.createElement("div");
      card.className =
        "group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow";

      const link = document.createElement("a");
      link.href = getFullUrl(image) || "#";
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.className = "block";

      const img = document.createElement("img");
      img.className = "h-40 w-full object-cover bg-slate-100";
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = getTitle(image) || "Gallery image";
      img.src = placeholderDataUrl();
      img.dataset.src = getThumbUrl(image);

      link.appendChild(img);

      const meta = document.createElement("div");
      meta.className = "p-3";

      const title = document.createElement("p");
      title.className = "text-sm font-medium text-slate-900 line-clamp-2";
      title.textContent = getTitle(image) || image.id || "";

      const subtitle = document.createElement("p");
      subtitle.className = "mt-1 text-xs text-slate-600";
      subtitle.textContent = titleCase(normalizeText(image.room || "")) || "";

      meta.appendChild(title);
      meta.appendChild(subtitle);

      card.appendChild(link);
      card.appendChild(meta);
      frag.appendChild(card);
    }

    grid.appendChild(frag);
    state.cleanupLazy = setupLazyLoading(grid);
  }

  function clearFilters() {
    const container = $(SELECTORS.filterContainer);
    if (container) {
      for (const select of $all("select[data-filter-key]", container)) {
        select.value = "";
      }
    }
    state.filters = {};
  }

  function onRoomTabClick(event) {
    const tab = event.target instanceof Element ? event.target.closest(SELECTORS.roomTab) : null;
    if (!tab) return;
    event.preventDefault();

    const room = normalizeText(tab.getAttribute("data-room")).toLowerCase();
    if (!room) return;

    state.currentRoom = room;
    setActiveRoomTab(room);

    // Reset filters when switching rooms, then rebuild options for that room.
    clearFilters();
    populateFilters(getRoomImages(state.currentRoom));
    renderGallery(state.currentRoom, state.filters);
  }

  function onFilterChange(event) {
    const container = $(SELECTORS.filterContainer);
    if (!container) return;

    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (!container.contains(target)) return;

    state.filters = readFiltersFromDom();
    renderGallery(state.currentRoom, state.filters);
  }

  function onClearFiltersClick(event) {
    const btn = $(SELECTORS.clearFilters);
    if (!btn) return;
    if (event.target !== btn) return;

    clearFilters();
    renderGallery(state.currentRoom, state.filters);
  }

  async function init() {
    if (state.didInit) return;
    const grid = $(SELECTORS.grid);
    if (!grid) return;
    state.didInit = true;

    const roomFromDom = getSelectedRoomFromDom();
    if (roomFromDom) state.currentRoom = roomFromDom;
    setActiveRoomTab(state.currentRoom);

    grid.setAttribute("aria-busy", "true");
    await loadImages();
    grid.setAttribute("aria-busy", "false");

    populateFilters(getRoomImages(state.currentRoom));
    state.filters = readFiltersFromDom();
    renderGallery(state.currentRoom, state.filters);

    document.addEventListener("click", onRoomTabClick);
    document.addEventListener("change", onFilterChange);
    document.addEventListener("click", onClearFiltersClick);
  }

  return {
    init,
    loadImages,
    renderGallery,
    populateFilters,
    filterImages,
  };
})();

if (typeof window !== "undefined") {
  window.Gallery = Gallery;
}

