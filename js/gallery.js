/**
 * Gallery + filtering module for House Color Gallery (classic script).
 *
 * - Loads `data/images.json`
 * - Renders into `#image-grid`
 * - Room switching via `.room-tab[data-room]`
 *
 * Public API: `window.Gallery`
 */

const Gallery = (function () {
  const DATA_URL = "data/images.json";

  const SELECTORS = {
    grid: "#image-grid",
    results: "#results-summary",
    empty: "#empty-state",
    roomTab: ".room-tab[data-room]",
    activeRoomTab: ".room-tab[data-room][aria-selected='true']",
  };

  const TIERS = [
    { likeCount: 3, name: "Favorites", emoji: "⭐", defaultOpen: true },
    { likeCount: 2, name: "Strong", emoji: "👍", defaultOpen: true },
    { likeCount: 1, name: "Maybe", emoji: "🤔", defaultOpen: true },
    { likeCount: 0, name: "Rejected", emoji: "❌", defaultOpen: false },
  ];

  const TIER_STORAGE_KEY = "galleryTierState";

  const state = {
    allImages: [],
    currentRoom: "parlor",
    currentFilter: "tiered",
    ratingsCache: {},
    cleanupLazy: null,
    unsubscribers: [],
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

  function cleanupSubscriptions() {
    for (const unsub of state.unsubscribers) {
      try {
        if (typeof unsub === "function") unsub();
      } catch (e) {
        console.warn("Gallery: rating unsubscribe failed", e);
      }
    }
    state.unsubscribers = [];
  }

  function ratingButtonClass(rating) {
    const base =
      "rating-btn inline-flex h-8 w-9 items-center justify-center rounded-md border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2";
    const variants = {
      like: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
      unsure: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
      dislike: "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
    };
    return `${base} ${variants[rating] || "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
  }

  function getCurrentUser() {
    return (typeof App !== "undefined" && App.getUser?.()) || localStorage.getItem("houseColorUser") || "Guest";
  }

  async function getRatingsForImage(imageId) {
    if (state.ratingsCache[imageId]) return state.ratingsCache[imageId];

    let ratings = {};
    if (typeof Ratings !== "undefined" && Ratings.getRatings) {
      ratings = await Ratings.getRatings(imageId);
    } else {
      const stored = JSON.parse(localStorage.getItem("houseRatings") || "{}");
      ratings = stored[imageId] || {};
    }
    state.ratingsCache[imageId] = ratings;
    return ratings;
  }

  function getTierState() {
    try {
      return JSON.parse(localStorage.getItem(TIER_STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveTierState(tierState) {
    localStorage.setItem(TIER_STORAGE_KEY, JSON.stringify(tierState));
  }

  function isTierOpen(tierName, defaultOpen) {
    const tierState = getTierState();
    return tierState[tierName] !== undefined ? tierState[tierName] : defaultOpen;
  }

  function createTierSection(tier, images, createCardFn) {
    const section = document.createElement("details");
    section.className = "tier-section col-span-full mb-6";
    section.open = isTierOpen(tier.name, tier.defaultOpen);

    const summary = document.createElement("summary");
    summary.className = "tier-header cursor-pointer select-none rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-2";
    summary.innerHTML = `<span class="text-lg">${tier.emoji}</span> ${tier.name} (${tier.likeCount} like${tier.likeCount !== 1 ? "s" : ""}) — <span class="font-normal text-slate-500">${images.length} item${images.length !== 1 ? "s" : ""}</span>`;

    section.appendChild(summary);

    const content = document.createElement("div");
    content.className = "tier-content mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

    for (const image of images) {
      const card = createCardFn(image);
      if (card) content.appendChild(card);
    }

    section.appendChild(content);

    // Save open/closed state when toggled
    section.addEventListener("toggle", () => {
      const tierState = getTierState();
      tierState[tier.name] = section.open;
      saveTierState(tierState);
    });

    return section;
  }

  async function groupImagesByLikes(images) {
    const groups = { 3: [], 2: [], 1: [], 0: [] };

    for (const image of images) {
      const ratings = await getRatingsForImage(image.id);
      const likeCount = typeof Ratings !== "undefined" && Ratings.getLikeCount
        ? Ratings.getLikeCount(ratings)
        : Object.values(ratings).filter(v => v === "like").length;

      // Clamp to 0-3
      const key = Math.min(3, Math.max(0, likeCount));
      groups[key].push(image);
    }

    return groups;
  }

  async function applyRatingFilter(images, filter) {
    if (filter === "all") return images;

    const user = getCurrentUser();
    const results = [];

    for (const image of images) {
      const ratings = await getRatingsForImage(image.id);
      const myRating = ratings[user];
      const votes = Object.values(ratings);
      const likes = votes.filter(v => v === "like").length;
      const dislikes = votes.filter(v => v === "dislike").length;

      switch (filter) {
        case "unrated":
          if (!myRating) results.push(image);
          break;
        case "my-likes":
          if (myRating === "like") results.push(image);
          break;
        case "my-dislikes":
          if (myRating === "dislike") results.push(image);
          break;
        case "popular":
          if (likes >= 2) results.push(image);
          break;
        case "controversial":
          if (likes > 0 && dislikes > 0) results.push(image);
          break;
        default:
          results.push(image);
      }
    }

    return results;
  }

  function bindFilterSelect() {
    const select = document.getElementById("rating-filter");
    if (!select) return;

    select.addEventListener("change", (e) => {
      state.currentFilter = e.target.value;
      state.ratingsCache = {}; // Clear cache to get fresh data
      renderGallery(state.currentRoom);
    });

    // Listen for rating changes to update cache and re-render if filtered
    window.addEventListener("ratingChanged", (e) => {
      const imageId = e.detail?.imageId;
      if (imageId) {
        delete state.ratingsCache[imageId];
      }
      // Re-render if a filter is active (not "all")
      if (state.currentFilter !== "all") {
        state.ratingsCache = {}; // Clear entire cache for fresh data
        renderGallery(state.currentRoom);
      }
    });
  }

  function createImageCard(image) {
    const imageId = normalizeText(image?.id);
    if (!imageId) return null;

    const card = document.createElement("div");
    card.className =
      "group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow";
    card.dataset.imageId = imageId;

    const link = document.createElement("div");
    link.className = "block cursor-pointer";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof Lightbox !== "undefined" && Lightbox.openLightbox) {
        Lightbox.openLightbox(imageId);
      }
    });

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

    const footer = document.createElement("div");
    footer.className = "mt-3 flex items-start justify-between gap-2";

    const buttons = document.createElement("div");
    buttons.className = "flex items-center gap-1";
    buttons.setAttribute("role", "group");
    buttons.setAttribute("aria-label", "Rate this photo");

    const likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = ratingButtonClass("like");
    likeBtn.textContent = "👍";
    likeBtn.setAttribute("data-image-id", imageId);
    likeBtn.setAttribute("data-rating", "like");

    const unsureBtn = document.createElement("button");
    unsureBtn.type = "button";
    unsureBtn.className = ratingButtonClass("unsure");
    unsureBtn.textContent = "❓";
    unsureBtn.setAttribute("data-image-id", imageId);
    unsureBtn.setAttribute("data-rating", "unsure");

    const dislikeBtn = document.createElement("button");
    dislikeBtn.type = "button";
    dislikeBtn.className = ratingButtonClass("dislike");
    dislikeBtn.textContent = "✖️";
    dislikeBtn.setAttribute("data-image-id", imageId);
    dislikeBtn.setAttribute("data-rating", "dislike");

    buttons.appendChild(likeBtn);
    buttons.appendChild(unsureBtn);
    buttons.appendChild(dislikeBtn);

    const summary = document.createElement("div");
    summary.className = "rating-summary flex items-center justify-end gap-1";
    summary.setAttribute("data-rating-summary", "");
    summary.setAttribute("data-image-id", imageId);

    footer.appendChild(buttons);
    footer.appendChild(summary);

    meta.appendChild(title);
    meta.appendChild(subtitle);
    meta.appendChild(footer);

    card.appendChild(link);
    card.appendChild(meta);

    if (typeof window !== "undefined" && window.Ratings?.mountCard) {
      const unsub = window.Ratings.mountCard(card, imageId);
      if (typeof unsub === "function") state.unsubscribers.push(unsub);
    }

    return card;
  }

  async function renderGallery(room) {
    const grid = $(SELECTORS.grid);
    if (!grid) return;

    if (typeof state.cleanupLazy === "function") {
      state.cleanupLazy();
      state.cleanupLazy = null;
    }
    cleanupSubscriptions();

    const roomValue = normalizeText(room || state.currentRoom).toLowerCase();
    state.currentRoom = roomValue || state.currentRoom;

    const roomImages = getRoomImages(state.currentRoom);

    grid.innerHTML = "";

    // Handle tiered view specially
    if (state.currentFilter === "tiered") {
      const groups = await groupImagesByLikes(roomImages);
      const totalCount = roomImages.length;
      const nonRejectedCount = groups[3].length + groups[2].length + groups[1].length;

      setEmptyState(totalCount === 0);
      setResultsSummary(`${nonRejectedCount} of ${totalCount} photo${totalCount !== 1 ? "s" : ""} (${groups[0].length} rejected)`);

      const frag = document.createDocumentFragment();

      for (const tier of TIERS) {
        const tierImages = groups[tier.likeCount];
        if (tierImages.length === 0) continue;

        const section = createTierSection(tier, tierImages, createImageCard);
        frag.appendChild(section);
      }

      grid.appendChild(frag);
      state.cleanupLazy = setupLazyLoading(grid);
      return;
    }

    // Regular (non-tiered) rendering
    const filtered = await applyRatingFilter(roomImages, state.currentFilter);

    setEmptyState(filtered.length === 0);
    setResultsSummary(`${filtered.length} photo${filtered.length === 1 ? "" : "s"}`);

    const frag = document.createDocumentFragment();
    for (const image of filtered) {
      const card = createImageCard(image);
      if (card) frag.appendChild(card);
    }

    grid.appendChild(frag);
    state.cleanupLazy = setupLazyLoading(grid);
  }

  function onRoomTabClick(event) {
    const tab = event.target instanceof Element ? event.target.closest(SELECTORS.roomTab) : null;
    if (!tab) return;
    event.preventDefault();

    const room = normalizeText(tab.getAttribute("data-room")).toLowerCase();
    if (!room) return;

    // Handle Results tab specially
    if (room === "results") {
      state.currentRoom = room;
      setActiveRoomTab(room);
      if (typeof Swatches !== "undefined" && Swatches.hide) Swatches.hide();
      if (typeof Results !== "undefined" && Results.show) Results.show();
      return;
    }

    // Handle Swatches tab specially
    if (room === "swatches") {
      state.currentRoom = room;
      setActiveRoomTab(room);
      if (typeof Results !== "undefined" && Results.hide) Results.hide();
      if (typeof Swatches !== "undefined" && Swatches.show) Swatches.show();
      return;
    }

    // Hide results and swatches if switching to a room
    if (typeof Results !== "undefined" && Results.hide) Results.hide();
    if (typeof Swatches !== "undefined" && Swatches.hide) Swatches.hide();

    state.currentRoom = room;
    setActiveRoomTab(room);
    renderGallery(state.currentRoom);
  }

  /**
   * Get all images (for Results module)
   */
  function getAllImages() {
    return [...state.allImages];
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

    // Initialize Lightbox with all images
    if (typeof Lightbox !== "undefined" && Lightbox.init) {
      const allImages = state.allImages.map((img) => ({
        id: img.id,
        src: getFullUrl(img),
        thumbnail: getThumbUrl(img),
        title: getTitle(img),
        room: img.room,
        filename: img.filename,
        url: img.url,
      }));
      Lightbox.init(allImages, typeof App !== "undefined" && typeof App.getUser === "function" ? App.getUser() : null);
    }

    renderGallery(state.currentRoom);

    document.addEventListener("click", onRoomTabClick);
    bindFilterSelect();
  }

  return {
    init,
    loadImages,
    renderGallery,
    getAllImages,
  };
})();

if (typeof window !== "undefined") {
  window.Gallery = Gallery;
}
