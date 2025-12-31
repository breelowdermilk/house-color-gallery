/**
 * Ratings module for House Color Gallery
 *
 * Firestore model (compat API):
 * - `images/{imageId}/ratings/{userName}` => { value: "like"|"unsure"|"dislike", updatedAt }
 * - `users/{userName}` => { createdAt }
 *
 * Public API: `window.Ratings`
 */

const Ratings = (function () {
  const VALID = new Set(["like", "unsure", "dislike"]);
  const STORAGE_KEY = "houseRatings";

  let db = null;
  let currentUser = null;

  const cache = new Map(); // imageId -> { [userName]: rating }
  const watchers = new Map(); // imageId -> Set<fn>

  function normalizeText(value) {
    return String(value ?? "").trim();
  }

  function resolveUser() {
    return (
      currentUser ||
      (typeof App !== "undefined" && typeof App.getUser === "function" ? App.getUser() : null) ||
      localStorage.getItem("houseColorUser") ||
      "Guest"
    );
  }

  function loadOfflineStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeOfflineStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store || {}));
  }

  function getCachedRatings(imageId) {
    return cache.get(imageId) || {};
  }

  function setCachedRatings(imageId, ratings) {
    cache.set(imageId, ratings || {});
    notify(imageId);
  }

  function notify(imageId) {
    const set = watchers.get(imageId);
    if (!set) return;
    const ratings = getCachedRatings(imageId);
    for (const fn of set) {
      try {
        fn({ ...ratings });
      } catch (e) {
        console.warn("Ratings watcher failed", e);
      }
    }
  }

  function subscribeToRatings(imageId, callback) {
    const id = normalizeText(imageId);
    if (!id || typeof callback !== "function") return () => {};

    if (!watchers.has(id)) watchers.set(id, new Set());
    watchers.get(id).add(callback);

    // Ensure callback receives current value ASAP.
    callback({ ...getCachedRatings(id) });

    // If we don't have a live listener yet, hydrate once.
    if (!cache.has(id)) {
      void getRatings(id).then((ratings) => {
        setCachedRatings(id, ratings);
      });
    }

    return () => {
      const set = watchers.get(id);
      if (!set) return;
      set.delete(callback);
      if (!set.size) watchers.delete(id);
    };
  }

  async function ensureUserDocument(userName) {
    if (!db) return;
    const name = normalizeText(userName);
    if (!name) return;

    try {
      const createdAt =
        typeof firebase !== "undefined" && firebase.firestore?.FieldValue?.serverTimestamp
          ? firebase.firestore.FieldValue.serverTimestamp()
          : Date.now();
      await db.collection("users").doc(name).set({ createdAt }, { merge: true });
    } catch (e) {
      console.warn("Ratings: could not write users doc", e);
    }
  }

  async function setRating(imageId, rating) {
    const id = normalizeText(imageId);
    const value = normalizeText(rating);
    if (!id) return;
    if (!VALID.has(value)) return;

    const user = resolveUser();
    if (!user) return;

    // Check if toggling off (clicking same rating again)
    const currentRatings = getCachedRatings(id);
    const isToggleOff = currentRatings[user] === value;

    // Optimistic local update
    const next = { ...currentRatings };
    if (isToggleOff) {
      delete next[user];
    } else {
      next[user] = value;
    }
    setCachedRatings(id, next);

    // Dispatch event so Gallery can clear its cache
    window.dispatchEvent(new CustomEvent('ratingChanged', { detail: { imageId: id } }));

    if (!db) {
      const store = loadOfflineStore();
      if (isToggleOff) {
        if (store[id]) delete store[id][user];
      } else {
        store[id] = { ...(store[id] || {}), [user]: value };
      }
      writeOfflineStore(store);
      return;
    }

    try {
      await ensureUserDocument(user);

      if (isToggleOff) {
        // Delete the rating
        await db
          .collection("images")
          .doc(id)
          .collection("ratings")
          .doc(user)
          .delete();
      } else {
        const updatedAt =
          typeof firebase !== "undefined" && firebase.firestore?.FieldValue?.serverTimestamp
            ? firebase.firestore.FieldValue.serverTimestamp()
            : Date.now();

        await db
          .collection("images")
          .doc(id)
          .collection("ratings")
          .doc(user)
          .set({ value, updatedAt }, { merge: true });
      }
    } catch (error) {
      console.error("Ratings: setRating failed, falling back to localStorage", error);
      // Fallback to localStorage when Firebase fails
      const store = loadOfflineStore();
      if (isToggleOff) {
        if (store[id]) delete store[id][user];
      } else {
        store[id] = { ...(store[id] || {}), [user]: value };
      }
      writeOfflineStore(store);
    }
  }

  async function getRatings(imageId) {
    const id = normalizeText(imageId);
    if (!id) return {};

    if (!db) {
      const store = loadOfflineStore();
      return { ...(store[id] || {}) };
    }

    try {
      const snapshot = await db.collection("images").doc(id).collection("ratings").get();
      const ratings = {};
      snapshot.forEach((doc) => {
        const value = normalizeText(doc.data()?.value);
        if (VALID.has(value)) ratings[doc.id] = value;
      });
      return ratings;
    } catch (error) {
      console.error("Ratings: getRatings failed, falling back to localStorage", error);
      // Fallback to localStorage when Firebase fails
      const store = loadOfflineStore();
      return { ...(store[id] || {}) };
    }
  }

  function ratingBadgeClasses(value) {
    switch (value) {
      case "like":
        return "border-emerald-200 bg-emerald-50 text-emerald-800";
      case "unsure":
        return "border-amber-200 bg-amber-50 text-amber-800";
      case "dislike":
        return "border-rose-200 bg-rose-50 text-rose-800";
      default:
        return "border-slate-200 bg-white text-slate-700";
    }
  }

  function ratingSymbol(value) {
    switch (value) {
      case "like":
        return "👍";
      case "unsure":
        return "❓";
      case "dislike":
        return "✖️";
      default:
        return "";
    }
  }

  function updateCardUI(cardEl, imageId, ratings) {
    if (!cardEl) return;
    const id = normalizeText(imageId);
    if (!id) return;

    const user = resolveUser();
    const myRating = ratings?.[user] || "";

    const buttons = cardEl.querySelectorAll(".rating-btn[data-rating]");
    buttons.forEach((btn) => {
      const value = normalizeText(btn.getAttribute("data-rating"));
      const isActive = value && value === myRating;
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");

      // Active state: stronger border + ring.
      btn.classList.toggle("ring-2", isActive);
      btn.classList.toggle("ring-slate-400", isActive);
      btn.classList.toggle("ring-offset-1", isActive);
    });

    const summary = cardEl.querySelector("[data-rating-summary]");
    if (!summary) return;

    const entries = Object.entries(ratings || {});
    if (!entries.length) {
      summary.innerHTML = '<span class="text-xs text-slate-400">No votes</span>';
      return;
    }

    const ordered = entries.sort(([a], [b]) => a.localeCompare(b));
    summary.innerHTML = "";
    for (const [name, value] of ordered) {
      const chip = document.createElement("span");
      chip.className = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${ratingBadgeClasses(
        value
      )}`;
      const initial = normalizeText(name).slice(0, 1).toUpperCase() || "?";
      chip.textContent = `${initial} ${ratingSymbol(value)}`;
      chip.title = `${name}: ${value}`;
      summary.appendChild(chip);
    }
  }

  function mountCard(cardEl, imageId) {
    const id = normalizeText(imageId);
    if (!cardEl || !id) return () => {};

    // Intercept button clicks (avoid opening the card link).
    cardEl.querySelectorAll(".rating-btn[data-rating]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rating = normalizeText(btn.getAttribute("data-rating"));
        void setRating(id, rating);
      });
    });

    let firestoreUnsub = null;

    if (db) {
      try {
        firestoreUnsub = db
          .collection("images")
          .doc(id)
          .collection("ratings")
          .onSnapshot((snapshot) => {
            const ratings = {};
            snapshot.forEach((doc) => {
              const value = normalizeText(doc.data()?.value);
              if (VALID.has(value)) ratings[doc.id] = value;
            });
            setCachedRatings(id, ratings);
          });
      } catch (e) {
        console.warn("Ratings: realtime subscription failed", e);
      }
    }

    const localUnsub = subscribeToRatings(id, (ratings) => updateCardUI(cardEl, id, ratings));

    return () => {
      try {
        if (typeof firestoreUnsub === "function") firestoreUnsub();
      } catch {}
      try {
        if (typeof localUnsub === "function") localUnsub();
      } catch {}
    };
  }

  function init(firestore, userName) {
    db = firestore || null;
    currentUser = userName || null;
    void ensureUserDocument(resolveUser());
  }

  return {
    init,
    setRating,
    getRatings,
    subscribeToRatings,
    mountCard,
  };
})();

if (typeof window !== "undefined") {
  window.Ratings = Ratings;
}

