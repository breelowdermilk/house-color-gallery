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
    ratingFilter: "#swatch-rating-filter",
    grid: "#swatches-grid",
    count: "#swatches-count",
  };

  let allSwatches = [];
  let categories = [];
  let currentCategory = "all";
  let currentRatingFilter = "all";
  let ratingsCache = {};
  let unsubscribers = [];

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

  function cleanupSubscriptions() {
    for (const unsub of unsubscribers) {
      try {
        if (typeof unsub === "function") unsub();
      } catch (e) {}
    }
    unsubscribers = [];
  }

  function $(selector) {
    return document.querySelector(selector);
  }

  // Filter using pre-computed SCORE field (like=2, unsure=1, dislike=0)
  // So "1 like + 2 unsures" (score 4) is Strong, not Controversial
  function applyLikesFilter(swatches, filter) {
    let result;
    switch (filter) {
      case "favorites":
        result = swatches.filter(s => (s.score || 0) >= 5);
        break;
      case "strong":
        result = swatches.filter(s => (s.score || 0) >= 4);
        break;
      case "promising":
        result = swatches.filter(s => (s.score || 0) >= 3);
        break;
      case "controversial":
        result = swatches.filter(s => (s.score || 0) <= 2);
        break;
      case "all":
      default:
        result = [...swatches];
    }
    // Sort by score (highest first), then by likes
    return result.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.likes || 0) - (a.likes || 0));
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
    card.className = "group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow";
    card.dataset.swatchId = swatch.id;
    card.dataset.imageId = swatch.id; // For Ratings module compatibility

    // Image container (clickable)
    const imgContainer = document.createElement("div");
    imgContainer.className = "cursor-pointer";
    imgContainer.addEventListener("click", () => {
      openSwatchLightbox(swatch);
    });

    const img = document.createElement("img");
    img.className = "h-40 w-full object-cover bg-slate-100";
    img.loading = "lazy";
    img.alt = swatch.name || "Wallpaper swatch";
    img.src = swatch.thumbnail || swatch.url;

    imgContainer.appendChild(img);

    // Meta section with name and rating buttons
    const meta = document.createElement("div");
    meta.className = "p-3";

    const name = document.createElement("p");
    name.className = "text-sm font-medium text-slate-900 line-clamp-2";
    name.textContent = swatch.name || swatch.id;

    const category = document.createElement("p");
    category.className = "text-xs text-slate-600 mt-0.5";
    category.textContent = swatch.category || "";

    const footer = document.createElement("div");
    footer.className = "mt-3 flex items-start justify-between gap-2";

    // Rating buttons
    const buttons = document.createElement("div");
    buttons.className = "flex items-center gap-1";
    buttons.setAttribute("role", "group");
    buttons.setAttribute("aria-label", "Rate this swatch");

    const likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = ratingButtonClass("like");
    likeBtn.textContent = "👍";
    likeBtn.setAttribute("data-image-id", swatch.id);
    likeBtn.setAttribute("data-rating", "like");

    const unsureBtn = document.createElement("button");
    unsureBtn.type = "button";
    unsureBtn.className = ratingButtonClass("unsure");
    unsureBtn.textContent = "❓";
    unsureBtn.setAttribute("data-image-id", swatch.id);
    unsureBtn.setAttribute("data-rating", "unsure");

    const dislikeBtn = document.createElement("button");
    dislikeBtn.type = "button";
    dislikeBtn.className = ratingButtonClass("dislike");
    dislikeBtn.textContent = "✖️";
    dislikeBtn.setAttribute("data-image-id", swatch.id);
    dislikeBtn.setAttribute("data-rating", "dislike");

    buttons.appendChild(likeBtn);
    buttons.appendChild(unsureBtn);
    buttons.appendChild(dislikeBtn);

    // Rating summary
    const summary = document.createElement("div");
    summary.className = "rating-summary flex items-center justify-end gap-1";
    summary.setAttribute("data-rating-summary", "");
    summary.setAttribute("data-image-id", swatch.id);

    footer.appendChild(buttons);
    footer.appendChild(summary);

    meta.appendChild(name);
    meta.appendChild(category);
    meta.appendChild(footer);

    card.appendChild(imgContainer);
    card.appendChild(meta);

    // Mount ratings if available
    if (typeof Ratings !== "undefined" && Ratings.mountCard) {
      const unsub = Ratings.mountCard(card, swatch.id);
      if (typeof unsub === "function") unsubscribers.push(unsub);
    }

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
        <button class="lightbox-close absolute top-4 right-4 text-white text-3xl hover:text-slate-300">&times;</button>
        <div class="max-w-4xl max-h-[90vh] flex flex-col items-center overflow-y-auto">
          <img class="max-h-[50vh] object-contain rounded-lg" src="" alt="">
          <p class="swatch-title text-white text-lg font-medium mt-4 text-center"></p>
          <p class="swatch-category text-white/70 text-sm mt-1"></p>
          <div class="swatch-rating-bar flex items-center gap-3 mt-4">
            <button class="rating-btn rating-like px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium" data-rating="like">👍 Like</button>
            <button class="rating-btn rating-unsure px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium" data-rating="unsure">❓ Unsure</button>
            <button class="rating-btn rating-dislike px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium" data-rating="dislike">✖️ Dislike</button>
          </div>
          <div class="swatch-votes flex items-center gap-2 mt-3"></div>
          <div class="swatch-comments w-full max-w-md mt-4 bg-white/10 rounded-lg p-3">
            <h4 class="text-white text-sm font-medium mb-2">Comments</h4>
            <div class="swatch-comments-list text-white/80 text-sm space-y-2 max-h-32 overflow-y-auto"></div>
            <form class="swatch-comment-form flex gap-2 mt-3">
              <input type="text" class="swatch-comment-input flex-1 px-3 py-2 rounded-lg bg-white/20 text-white placeholder-white/50 text-sm border-0 focus:ring-2 focus:ring-white/50" placeholder="Add a comment..." maxlength="200">
              <button type="submit" class="px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium">Post</button>
            </form>
          </div>
        </div>
      `;
      document.body.appendChild(lightbox);

      // Close handlers
      lightbox.querySelector(".lightbox-close").addEventListener("click", () => {
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
    const title = lightbox.querySelector(".swatch-title");
    const cat = lightbox.querySelector(".swatch-category");
    const ratingBar = lightbox.querySelector(".swatch-rating-bar");
    const votesDisplay = lightbox.querySelector(".swatch-votes");
    const commentsList = lightbox.querySelector(".swatch-comments-list");
    const commentForm = lightbox.querySelector(".swatch-comment-form");
    const commentInput = lightbox.querySelector(".swatch-comment-input");

    img.src = swatch.url;
    img.alt = swatch.name;
    title.textContent = swatch.name;
    cat.textContent = swatch.category || "";

    // Store current swatch ID for rating
    lightbox.dataset.swatchId = swatch.id;

    // Bind rating buttons
    ratingBar.querySelectorAll(".rating-btn").forEach(btn => {
      btn.onclick = async () => {
        const rating = btn.dataset.rating;
        if (typeof Ratings !== "undefined" && Ratings.setRating) {
          await Ratings.setRating(swatch.id, rating);
          updateLightboxVotes(swatch.id, votesDisplay, ratingBar);
        }
      };
    });

    // Bind comment form
    commentForm.onsubmit = async (e) => {
      e.preventDefault();
      const text = commentInput.value.trim();
      if (!text) return;

      const user = (typeof App !== "undefined" && App.getUser?.()) || localStorage.getItem("houseColorUser") || "Guest";

      if (typeof firebase !== "undefined" && firebase.firestore) {
        try {
          const db = firebase.firestore();
          await db.collection("images").doc(swatch.id).collection("comments").add({
            user,
            text,
            timestamp: Date.now()
          });
          commentInput.value = "";
          loadSwatchComments(swatch.id, commentsList);
        } catch (e) {
          console.warn("Failed to save comment", e);
        }
      }
    };

    // Load and display votes and comments
    updateLightboxVotes(swatch.id, votesDisplay, ratingBar);
    loadSwatchComments(swatch.id, commentsList);

    lightbox.classList.remove("hidden");
  }

  async function loadSwatchComments(swatchId, container) {
    container.innerHTML = '<span class="text-white/50">Loading...</span>';

    if (typeof firebase !== "undefined" && firebase.firestore) {
      try {
        const db = firebase.firestore();
        const snapshot = await db.collection("images").doc(swatchId)
          .collection("comments")
          .orderBy("timestamp", "desc")
          .limit(20)
          .get();

        if (snapshot.empty) {
          container.innerHTML = '<span class="text-white/50">No comments yet</span>';
          return;
        }

        container.innerHTML = "";
        snapshot.forEach(doc => {
          const data = doc.data();
          const div = document.createElement("div");
          div.className = "bg-white/10 rounded px-2 py-1";
          div.innerHTML = `<span class="font-medium">${escapeHtml(data.user)}:</span> ${escapeHtml(data.text)}`;
          container.appendChild(div);
        });
      } catch (e) {
        container.innerHTML = '<span class="text-white/50">Could not load comments</span>';
      }
    } else {
      container.innerHTML = '<span class="text-white/50">Comments unavailable</span>';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function updateLightboxVotes(swatchId, votesDisplay, ratingBar) {
    let ratings = {};
    if (typeof Ratings !== "undefined" && Ratings.getRatings) {
      ratings = await Ratings.getRatings(swatchId);
    }

    const currentUser = (typeof App !== "undefined" && App.getUser?.()) || localStorage.getItem("houseColorUser") || "Guest";
    const userRating = ratings[currentUser];

    // Highlight active button
    ratingBar.querySelectorAll(".rating-btn").forEach(btn => {
      const rating = btn.dataset.rating;
      if (rating === userRating) {
        btn.classList.add("ring-2", "ring-white", "ring-offset-2", "ring-offset-black");
      } else {
        btn.classList.remove("ring-2", "ring-white", "ring-offset-2", "ring-offset-black");
      }
    });

    // Show votes
    const votes = Object.entries(ratings);
    if (votes.length === 0) {
      votesDisplay.innerHTML = '<span class="text-white/50">No votes yet</span>';
    } else {
      votesDisplay.innerHTML = votes.map(([user, rating]) => {
        const emoji = rating === "like" ? "👍" : rating === "unsure" ? "❓" : "✖️";
        return `<span class="px-2 py-1 rounded bg-white/20 text-white text-sm">${user} ${emoji}</span>`;
      }).join("");
    }
  }

  function renderSwatches() {
    const grid = $(SELECTORS.grid);
    const countEl = $(SELECTORS.count);
    if (!grid) return;

    // Cleanup previous subscriptions
    cleanupSubscriptions();

    const categoryFiltered = getFilteredSwatches();
    const filtered = applyLikesFilter(categoryFiltered, currentRatingFilter);

    grid.innerHTML = "";

    if (countEl) {
      countEl.textContent = `${filtered.length} swatch${filtered.length === 1 ? "" : "es"}`;
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="col-span-full text-center text-slate-500 py-8">No swatches found</p>';
      return;
    }

    // For "all" view, group by tier with headers based on SCORE (like=2, unsure=1)
    // So "1 like + 2 unsures" (score 4) ranks with Strong, not Controversial
    if (currentRatingFilter === "all") {
      const tiers = [
        { min: 5, label: "⭐ Favorites", sublabel: "score 5-6" },
        { min: 4, max: 4, label: "👍 Strong", sublabel: "score 4" },
        { min: 3, max: 3, label: "👀 Promising", sublabel: "score 3" },
        { min: 1, max: 2, label: "🤔 Controversial", sublabel: "score 1-2" },
      ];

      for (const tier of tiers) {
        const tierSwatches = filtered.filter(s => {
          const score = s.score || 0;
          if (tier.max !== undefined) return score >= tier.min && score <= tier.max;
          return score >= tier.min;
        });
        if (tierSwatches.length === 0) continue;

        const header = document.createElement("div");
        header.className = "col-span-full flex items-center gap-2 mt-6 mb-3 first:mt-0";
        header.innerHTML = `<span class="text-base font-semibold text-slate-800">${tier.label}</span><span class="text-sm text-slate-500">(${tier.sublabel}) — ${tierSwatches.length} item${tierSwatches.length !== 1 ? "s" : ""}</span>`;
        grid.appendChild(header);

        for (const swatch of tierSwatches) {
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
    const categorySelect = $(SELECTORS.categoryFilter);
    if (categorySelect) {
      categorySelect.addEventListener("change", (e) => {
        currentCategory = e.target.value;
        ratingsCache = {}; // Clear cache
        renderSwatches();
      });
    }

    const ratingSelect = $(SELECTORS.ratingFilter);
    if (ratingSelect) {
      ratingSelect.addEventListener("change", (e) => {
        currentRatingFilter = e.target.value;
        ratingsCache = {}; // Clear cache
        renderSwatches();
      });
    }

    // Listen for rating changes to update if filter is active
    window.addEventListener("ratingChanged", (e) => {
      const imageId = e.detail?.imageId;
      if (imageId) {
        delete ratingsCache[imageId];
      }
      // Re-render if not showing "all"
      if (currentRatingFilter !== "all") {
        ratingsCache = {};
        renderSwatches();
      }
    });
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
