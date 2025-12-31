/**
 * Swatches module for House Color Gallery
 * Displays wallpaper swatches organized by category
 */

const Swatches = (function () {
  const DATA_URL = "data/swatches.json";

  const SELECTORS = {
    section: "#swatches-section",
    gallerySection: "section[aria-label='Gallery']",
    categoryFilter: "#swatch-category-filter",
    grid: "#swatches-grid",
    count: "#swatches-count",
  };

  let allSwatches = [];
  let categories = [];
  let currentCategory = "all";

  function $(selector) {
    return document.querySelector(selector);
  }

  async function loadSwatches() {
    try {
      const response = await fetch(DATA_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Failed to load ${DATA_URL}`);
      const data = await response.json();
      allSwatches = data.swatches || [];

      // Extract unique categories
      const catSet = new Set();
      for (const s of allSwatches) {
        if (s.category) catSet.add(s.category);
      }
      categories = Array.from(catSet).sort();

      return allSwatches;
    } catch (error) {
      console.error("Swatches: load failed", error);
      return [];
    }
  }

  function getFilteredSwatches() {
    if (currentCategory === "all") return allSwatches;
    return allSwatches.filter(s => s.category === currentCategory);
  }

  function createSwatchCard(swatch) {
    const card = document.createElement("div");
    card.className = "group relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer";
    card.dataset.swatchId = swatch.id;

    const img = document.createElement("img");
    img.className = "h-40 w-full object-cover bg-slate-100";
    img.loading = "lazy";
    img.alt = swatch.name || "Wallpaper swatch";
    img.src = swatch.thumbnail || swatch.url;

    const overlay = document.createElement("div");
    overlay.className = "absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity";

    const info = document.createElement("div");
    info.className = "absolute bottom-0 left-0 right-0 p-3";

    const name = document.createElement("p");
    name.className = "text-sm font-medium text-white line-clamp-2";
    name.textContent = swatch.name || swatch.id;

    const category = document.createElement("p");
    category.className = "text-xs text-white/70 mt-0.5";
    category.textContent = swatch.category || "";

    info.appendChild(name);
    info.appendChild(category);
    overlay.appendChild(info);
    card.appendChild(img);
    card.appendChild(overlay);

    // Click to view full size
    card.addEventListener("click", () => {
      openSwatchLightbox(swatch);
    });

    return card;
  }

  function openSwatchLightbox(swatch) {
    // Create a simple lightbox for swatches
    let lightbox = document.getElementById("swatch-lightbox");
    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.id = "swatch-lightbox";
      lightbox.className = "fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4";
      lightbox.innerHTML = `
        <button class="absolute top-4 right-4 text-white text-3xl hover:text-slate-300">&times;</button>
        <div class="max-w-4xl max-h-[90vh] flex flex-col items-center">
          <img class="max-h-[70vh] object-contain rounded-lg" src="" alt="">
          <p class="text-white text-lg font-medium mt-4 text-center"></p>
          <p class="text-white/70 text-sm mt-1"></p>
        </div>
      `;
      document.body.appendChild(lightbox);

      // Close handlers
      lightbox.querySelector("button").addEventListener("click", () => {
        lightbox.classList.add("hidden");
      });
      lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox) lightbox.classList.add("hidden");
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !lightbox.classList.contains("hidden")) {
          lightbox.classList.add("hidden");
        }
      });
    }

    const img = lightbox.querySelector("img");
    const title = lightbox.querySelector("p");
    const cat = lightbox.querySelectorAll("p")[1];

    img.src = swatch.url;
    img.alt = swatch.name;
    title.textContent = swatch.name;
    cat.textContent = swatch.category || "";

    lightbox.classList.remove("hidden");
  }

  function renderSwatches() {
    const grid = $(SELECTORS.grid);
    const countEl = $(SELECTORS.count);
    if (!grid) return;

    const filtered = getFilteredSwatches();
    grid.innerHTML = "";

    if (countEl) {
      countEl.textContent = `${filtered.length} swatch${filtered.length === 1 ? "" : "es"}`;
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="col-span-full text-center text-slate-500 py-8">No swatches found</p>';
      return;
    }

    // Group by category if showing all
    if (currentCategory === "all") {
      const grouped = {};
      for (const s of filtered) {
        const cat = s.category || "Uncategorized";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(s);
      }

      for (const cat of Object.keys(grouped).sort()) {
        const header = document.createElement("h3");
        header.className = "col-span-full text-base font-semibold text-slate-900 mt-6 mb-2 first:mt-0";
        header.textContent = `${cat} (${grouped[cat].length})`;
        grid.appendChild(header);

        for (const swatch of grouped[cat]) {
          grid.appendChild(createSwatchCard(swatch));
        }
      }
    } else {
      for (const swatch of filtered) {
        grid.appendChild(createSwatchCard(swatch));
      }
    }
  }

  function updateCategoryFilter() {
    const select = $(SELECTORS.categoryFilter);
    if (!select) return;

    select.innerHTML = '<option value="all">All Categories</option>';
    for (const cat of categories) {
      const count = allSwatches.filter(s => s.category === cat).length;
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = `${cat} (${count})`;
      select.appendChild(option);
    }
  }

  function show() {
    const section = $(SELECTORS.section);
    const gallery = $(SELECTORS.gallerySection);

    if (section) section.classList.remove("hidden");
    if (gallery) gallery.classList.add("hidden");

    // Hide results section too
    const results = document.getElementById("results-section");
    if (results) results.classList.add("hidden");

    if (allSwatches.length === 0) {
      loadSwatches().then(() => {
        updateCategoryFilter();
        renderSwatches();
      });
    } else {
      renderSwatches();
    }
  }

  function hide() {
    const section = $(SELECTORS.section);
    const gallery = $(SELECTORS.gallerySection);

    if (section) section.classList.add("hidden");
    if (gallery) gallery.classList.remove("hidden");
  }

  function init() {
    const select = $(SELECTORS.categoryFilter);
    if (select) {
      select.addEventListener("change", (e) => {
        currentCategory = e.target.value;
        renderSwatches();
      });
    }
  }

  return {
    init,
    show,
    hide,
    loadSwatches,
  };
})();

if (typeof window !== "undefined") {
  window.Swatches = Swatches;
}
