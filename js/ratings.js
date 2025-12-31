/**
 * Ratings module for House Color Gallery
 * Handles Firebase Firestore integration for 3-way ratings (like/unsure/dislike)
 */

const Ratings = (function() {
  let db = null;
  let currentUser = null;
  let unsubscribers = [];
  let ratingsCache = {}; // Cache ratings to reduce Firestore reads

  // Rating types
  const RATING_TYPES = ['like', 'unsure', 'dislike'];
  const RATING_INFO = {
    like: { emoji: '👍', label: 'Like', color: '#22c55e' },
    unsure: { emoji: '❓', label: 'Unsure', color: '#eab308' },
    dislike: { emoji: '✖️', label: 'Dislike', color: '#ef4444' }
  };

  /**
   * Initialize the ratings module
   */
  function init(firestore, user) {
    db = firestore;
    currentUser = user;

    if (!db) {
      console.warn('Ratings: No database connection - running in offline mode');
    }

    // Set up rating button listeners (for cards)
    setupRatingButtons();

    // Listen for gallery updates to rebind buttons
    observeGalleryChanges();
  }

  /**
   * Set the current user
   */
  function setUser(user) {
    currentUser = user;
  }

  /**
   * Get current user
   */
  function getUser() {
    return currentUser || localStorage.getItem('houseColorUser');
  }

  /**
   * Set up click handlers for rating buttons
   */
  function setupRatingButtons() {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.rating-btn[data-image-id]');
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const imageId = btn.dataset.imageId;
      const rating = btn.dataset.rating;

      if (imageId && rating) {
        await setRating(imageId, rating);
      }
    });
  }

  /**
   * Watch for gallery DOM changes to update rating states
   */
  function observeGalleryChanges() {
    const grid = document.getElementById('image-grid');
    if (!grid) return;

    const observer = new MutationObserver(() => {
      updateAllRatingStates();
    });

    observer.observe(grid, { childList: true, subtree: true });
  }

  /**
   * Set rating for an image
   * @param {string} imageId - Image ID
   * @param {string} rating - 'like', 'unsure', or 'dislike'
   */
  async function setRating(imageId, rating) {
    const user = getUser();
    if (!user) {
      console.warn('Cannot rate: no user');
      return;
    }

    if (!RATING_TYPES.includes(rating)) {
      console.warn('Invalid rating:', rating);
      return;
    }

    // Update cache immediately for responsive UI
    if (!ratingsCache[imageId]) ratingsCache[imageId] = {};
    ratingsCache[imageId][user] = rating;

    if (!db) {
      // Offline mode - use localStorage
      const key = 'houseRatings';
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      if (!stored[imageId]) stored[imageId] = {};
      stored[imageId][user] = rating;
      localStorage.setItem(key, JSON.stringify(stored));

      // Update UI
      updateRatingButtons(imageId, stored[imageId]);
      return;
    }

    try {
      const docRef = db.collection('images').doc(imageId);
      await docRef.set({
        ratings: {
          [user]: rating
        }
      }, { merge: true });

      // Update UI
      updateRatingButtons(imageId, ratingsCache[imageId]);
    } catch (error) {
      console.error('Error setting rating:', error);
    }
  }

  /**
   * Clear rating for an image (remove user's vote)
   */
  async function clearRating(imageId) {
    const user = getUser();
    if (!user) return;

    // Update cache
    if (ratingsCache[imageId]) {
      delete ratingsCache[imageId][user];
    }

    if (!db) {
      const key = 'houseRatings';
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      if (stored[imageId]) {
        delete stored[imageId][user];
        localStorage.setItem(key, JSON.stringify(stored));
      }
      updateRatingButtons(imageId, stored[imageId] || {});
      return;
    }

    try {
      const docRef = db.collection('images').doc(imageId);
      await docRef.update({
        [`ratings.${user}`]: firebase.firestore.FieldValue.delete()
      });
    } catch (error) {
      console.error('Error clearing rating:', error);
    }
  }

  /**
   * Get ratings for an image
   * @param {string} imageId - Image ID
   * @returns {Object} - { userName: 'like'|'unsure'|'dislike', ... }
   */
  async function getRatings(imageId) {
    // Check cache first
    if (ratingsCache[imageId]) {
      return ratingsCache[imageId];
    }

    if (!db) {
      const stored = JSON.parse(localStorage.getItem('houseRatings') || '{}');
      ratingsCache[imageId] = stored[imageId] || {};
      return ratingsCache[imageId];
    }

    try {
      const doc = await db.collection('images').doc(imageId).get();
      const ratings = doc.exists ? (doc.data().ratings || {}) : {};
      ratingsCache[imageId] = ratings;
      return ratings;
    } catch (error) {
      console.error('Error getting ratings:', error);
      return {};
    }
  }

  /**
   * Get all ratings for all images
   * @returns {Object} - { imageId: { userName: rating, ... }, ... }
   */
  async function getAllRatings() {
    if (!db) {
      return JSON.parse(localStorage.getItem('houseRatings') || '{}');
    }

    try {
      const snapshot = await db.collection('images').get();
      const allRatings = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.ratings) {
          allRatings[doc.id] = data.ratings;
        }
      });
      // Update cache
      Object.assign(ratingsCache, allRatings);
      return allRatings;
    } catch (error) {
      console.error('Error getting all ratings:', error);
      return {};
    }
  }

  /**
   * Subscribe to real-time updates for an image's ratings
   */
  function subscribeToRatings(imageId, callback) {
    if (!db) return () => {};

    const unsubscribe = db.collection('images').doc(imageId)
      .onSnapshot((doc) => {
        const ratings = doc.exists ? (doc.data().ratings || {}) : {};
        ratingsCache[imageId] = ratings;
        callback(ratings);
      });

    unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Update rating buttons UI for an image
   */
  function updateRatingButtons(imageId, ratings) {
    const user = getUser();
    const userRating = ratings[user];

    // Update card rating buttons
    const cardBtns = document.querySelectorAll(`.rating-btn[data-image-id="${imageId}"]`);
    cardBtns.forEach(btn => {
      const rating = btn.dataset.rating;
      btn.classList.toggle('active', rating === userRating);
    });

    // Update vote summary if present
    const voteSummary = document.querySelector(`[data-vote-summary="${imageId}"]`);
    if (voteSummary) {
      renderVoteSummary(voteSummary, ratings);
    }

    // Notify lightbox if open
    if (typeof Lightbox !== 'undefined' && Lightbox.updateRatingUI) {
      Lightbox.updateRatingUI();
    }
  }

  /**
   * Update all visible rating buttons with current state
   */
  async function updateAllRatingStates() {
    const imageIds = new Set();
    document.querySelectorAll('.rating-btn[data-image-id]').forEach(btn => {
      imageIds.add(btn.dataset.imageId);
    });

    for (const imageId of imageIds) {
      const ratings = await getRatings(imageId);
      updateRatingButtons(imageId, ratings);
    }
  }

  /**
   * Render vote summary HTML
   */
  function renderVoteSummary(container, ratings) {
    const votes = Object.entries(ratings);

    if (votes.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = votes.map(([user, rating]) => {
      const info = RATING_INFO[rating] || { emoji: '?', label: rating };
      return `<span class="vote-chip vote-${rating}" title="${user}: ${info.label}">
        <span class="vote-user">${user.charAt(0)}</span>
        <span class="vote-emoji">${info.emoji}</span>
      </span>`;
    }).join('');
  }

  /**
   * Create rating buttons for an image card
   * @param {string} imageId - Image ID
   * @returns {HTMLElement}
   */
  function createRatingButtons(imageId) {
    const container = document.createElement('div');
    container.className = 'card-rating-buttons';

    RATING_TYPES.forEach(rating => {
      const info = RATING_INFO[rating];
      const btn = document.createElement('button');
      btn.className = `rating-btn rating-${rating}`;
      btn.dataset.imageId = imageId;
      btn.dataset.rating = rating;
      btn.title = info.label;
      btn.innerHTML = `<span class="rating-emoji">${info.emoji}</span>`;
      container.appendChild(btn);
    });

    return container;
  }

  /**
   * Create vote summary element for a card
   * @param {string} imageId - Image ID
   * @returns {HTMLElement}
   */
  function createVoteSummary(imageId) {
    const container = document.createElement('div');
    container.className = 'card-vote-summary';
    container.dataset.voteSummary = imageId;
    return container;
  }

  /**
   * Get rating info (emoji, label, color)
   */
  function getRatingInfo(rating) {
    return RATING_INFO[rating] || null;
  }

  /**
   * Cleanup subscriptions
   */
  function cleanup() {
    unsubscribers.forEach(unsub => unsub());
    unsubscribers = [];
  }

  // Public API
  return {
    init,
    setUser,
    getUser,
    setRating,
    clearRating,
    getRatings,
    getAllRatings,
    subscribeToRatings,
    updateRatingButtons,
    updateAllRatingStates,
    createRatingButtons,
    createVoteSummary,
    renderVoteSummary,
    getRatingInfo,
    cleanup,
    RATING_TYPES,
    RATING_INFO
  };
})();

// Export for other modules
if (typeof window !== 'undefined') {
  window.Ratings = Ratings;
}
