/**
 * Results/Summary module for House Color Gallery
 *
 * Aggregates ratings across all images and categorizes them:
 * - Consensus: everyone voted "like"
 * - Controversial: mixed votes (some like, some dislike)
 * - Rejected: mostly dislikes
 * - Unrated: no votes or insufficient votes
 *
 * Public API: `window.Results`
 */

const Results = (function () {
  const SELECTORS = {
    section: "#results-section",
    gallerySection: "section[aria-label='Gallery']",
    filterUser: "#results-filter-user",
    consensusGrid: "#consensus-grid",
    consensusEmpty: "#consensus-empty",
    consensusCount: "#consensus-count",
    controversialGrid: "#controversial-grid",
    controversialEmpty: "#controversial-empty",
    controversialCount: "#controversial-count",
    rejectedGrid: "#rejected-grid",
    rejectedEmpty: "#rejected-empty",
    rejectedCount: "#rejected-count",
    unratedGrid: "#unrated-grid",
    unratedEmpty: "#unrated-empty",
    unratedCount: "#unrated-count",
  };

  let allImages = [];
  let allRatings = {}; // imageId -> { userName: rating }
  let allUsers = new Set();
  let selectedUser = "all";
  let db = null;

  function $(selector) {
    return document.querySelector(selector);
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function getThumbUrl(image) {
    return normalizeText(image?.thumbnail || image?.thumb || image?.url || image?.src || "");
  }

  function getTitle(image) {
    return normalizeText(image?.pattern || image?.walls || image?.feature || image?.title || image?.id || "");
  }

  /**
   * Categorize an image based on its ratings
   * @param {Object} ratings - { userName: "like"|"unsure"|"dislike" }
   * @returns {string} - "consensus" | "controversial" | "rejected" | "unrated"
   */
  function categorizeImage(ratings) {
    const votes = Object.values(ratings || {});
    if (votes.length === 0) return "unrated";

    const likes = votes.filter((v) => v === "like").length;
    const dislikes = votes.filter((v) => v === "dislike").length;

    // Need at least 2 votes to make meaningful categorization
    if (votes.length < 2) return "unrated";

    // Consensus: everyone likes it (allow unsures, but no dislikes)
    if (likes > 0 && dislikes === 0) return "consensus";

    // Rejected: more dislikes than likes, or all dislikes
    if (dislikes > likes) return "rejected";

    // Controversial: mix of likes and dislikes
    if (likes > 0 && dislikes > 0) return "controversial";

    // Mostly unsure = unrated
    return "unrated";
  }

  /**
   * Create a small image card for results display
   */
  function createResultCard(image, ratings) {
    const card = document.createElement("div");
    card.className =
      "group relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer";
    card.dataset.imageId = image.id;

    const img = document.createElement("img");
    img.className = "h-32 w-full object-cover bg-slate-100";
    img.loading = "lazy";
    img.alt = getTitle(image) || "Gallery image";
    img.src = getThumbUrl(image);

    const overlay = document.createElement("div");
    overlay.className = "absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity";

    const info = document.createElement("div");
    info.className = "absolute bottom-0 left-0 right-0 p-2";

    const title = document.createElement("p");
    title.className = "text-xs font-medium text-white truncate";
    title.textContent = getTitle(image) || image.id;

    const votes = document.createElement("div");
    votes.className = "flex items-center gap-1 mt-1";

    // Show vote summary
    const voteEntries = Object.entries(ratings || {});
    if (voteEntries.length > 0) {
      for (const [user, rating] of voteEntries.slice(0, 4)) {
        const chip = document.createElement("span");
        chip.className = "inline-flex items-center justify-center h-5 w-5 rounded-full text-xs";

        switch (rating) {
          case "like":
            chip.className += " bg-emerald-500 text-white";
            chip.textContent = "+";
            break;
          case "unsure":
            chip.className += " bg-amber-500 text-white";
            chip.textContent = "?";
            break;
          case "dislike":
            chip.className += " bg-rose-500 text-white";
            chip.textContent = "-";
            break;
        }
        chip.title = `${user}: ${rating}`;
        votes.appendChild(chip);
      }
      if (voteEntries.length > 4) {
        const more = document.createElement("span");
        more.className = "text-xs text-white/80";
        more.textContent = `+${voteEntries.length - 4}`;
        votes.appendChild(more);
      }
    }

    info.appendChild(title);
    info.appendChild(votes);
    overlay.appendChild(info);
    card.appendChild(img);
    card.appendChild(overlay);

    // Click to open lightbox
    card.addEventListener("click", () => {
      if (typeof Lightbox !== "undefined" && Lightbox.openLightbox) {
        Lightbox.openLightbox(image.id);
      }
    });

    return card;
  }

  /**
   * Render results into the grids
   */
  function renderResults() {
    const categories = {
      consensus: [],
      controversial: [],
      rejected: [],
      unrated: [],
    };

    // Categorize all images
    for (const image of allImages) {
      const ratings = allRatings[image.id] || {};

      // For "filter by user", show where that user voted
      if (selectedUser !== "all") {
        const userVote = ratings[selectedUser];
        if (userVote) {
          if (userVote === "like") categories.consensus.push({ image, ratings });
          else if (userVote === "dislike") categories.rejected.push({ image, ratings });
          else categories.controversial.push({ image, ratings });
        } else {
          categories.unrated.push({ image, ratings });
        }
      } else {
        const category = categorizeImage(ratings);
        categories[category].push({ image, ratings });
      }
    }

    // Render each category
    renderCategory("consensus", categories.consensus);
    renderCategory("controversial", categories.controversial);
    renderCategory("rejected", categories.rejected);
    renderCategory("unrated", categories.unrated);
  }

  function renderCategory(name, items) {
    const grid = $(SELECTORS[`${name}Grid`]);
    const empty = $(SELECTORS[`${name}Empty`]);
    const count = $(SELECTORS[`${name}Count`]);

    if (!grid) return;

    grid.innerHTML = "";

    if (count) {
      count.textContent = `(${items.length})`;
    }

    if (items.length === 0) {
      grid.classList.add("hidden");
      if (empty) empty.classList.remove("hidden");
      return;
    }

    grid.classList.remove("hidden");
    if (empty) empty.classList.add("hidden");

    const frag = document.createDocumentFragment();
    for (const { image, ratings } of items) {
      frag.appendChild(createResultCard(image, ratings));
    }
    grid.appendChild(frag);
  }

  /**
   * Populate the user filter dropdown
   */
  function updateUserFilter() {
    const select = $(SELECTORS.filterUser);
    if (!select) return;

    // Keep "Everyone" option
    select.innerHTML = '<option value="all">Everyone</option>';

    // Add each user
    const sortedUsers = Array.from(allUsers).sort();
    for (const user of sortedUsers) {
      const option = document.createElement("option");
      option.value = user;
      option.textContent = user;
      select.appendChild(option);
    }

    // Restore selection
    select.value = selectedUser;
  }

  /**
   * Fetch all ratings for all images (parallelized for speed)
   */
  async function loadAllRatings() {
    allRatings = {};
    allUsers.clear();

    // Fetch all ratings in parallel for faster loading
    const fetchPromises = allImages.map(async (image) => {
      let ratings = {};

      if (typeof Ratings !== "undefined" && Ratings.getRatings) {
        try {
          ratings = await Ratings.getRatings(image.id);
        } catch (e) {
          console.warn("Failed to load ratings for", image.id, e);
        }
      } else {
        // Fallback to localStorage
        const stored = JSON.parse(localStorage.getItem("houseRatings") || "{}");
        ratings = stored[image.id] || {};
      }

      return { imageId: image.id, ratings };
    });

    const results = await Promise.all(fetchPromises);

    // Process results
    for (const { imageId, ratings } of results) {
      allRatings[imageId] = ratings;

      // Collect users
      for (const user of Object.keys(ratings)) {
        allUsers.add(user);
      }
    }

    updateUserFilter();
  }

  /**
   * Show the results section, hide gallery
   */
  function show() {
    const section = $(SELECTORS.section);
    const gallery = $(SELECTORS.gallerySection);

    if (section) section.classList.remove("hidden");
    if (gallery) gallery.classList.add("hidden");

    // Get current images from Gallery
    if (typeof Gallery !== "undefined" && Gallery.getAllImages) {
      allImages = Gallery.getAllImages();
    }

    // Load and render
    loadAllRatings().then(() => {
      renderResults();
    });
  }

  /**
   * Hide the results section, show gallery
   */
  function hide() {
    const section = $(SELECTORS.section);
    const gallery = $(SELECTORS.gallerySection);

    if (section) section.classList.add("hidden");
    if (gallery) gallery.classList.remove("hidden");
  }

  /**
   * Initialize the results module
   * @param {Object} firestore - Firestore db instance (optional)
   */
  function init(firestore = null) {
    db = firestore;

    // Bind user filter change
    const filterSelect = $(SELECTORS.filterUser);
    if (filterSelect) {
      filterSelect.addEventListener("change", (e) => {
        selectedUser = e.target.value;
        renderResults();
      });
    }
  }

  /**
   * Refresh results (call when ratings change)
   */
  function refresh() {
    loadAllRatings().then(() => {
      renderResults();
    });
  }

  return {
    init,
    show,
    hide,
    refresh,
  };
})();

if (typeof window !== "undefined") {
  window.Results = Results;
}
