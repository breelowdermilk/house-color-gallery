/**
 * Comments and Favorites module for House Color Gallery
 * Handles Firebase Firestore integration for collaborative feedback
 */

const Comments = (function() {
  let db = null;
  let currentUser = null;
  let unsubscribers = [];

  /**
   * Initialize the comments module
   */
  function init(firestore, user) {
    db = firestore;
    currentUser = user;

    if (!db) {
      console.warn('Comments: No database connection - running in offline mode');
      setupOfflineMode();
      return;
    }

    // Set up favorite button listeners
    setupFavoriteButtons();

    // Listen for gallery updates to rebind buttons
    observeGalleryChanges();
  }

  /**
   * Set up click handlers for favorite buttons
   */
  function setupFavoriteButtons() {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.favorite-btn');
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const imageId = btn.dataset.imageId;
      if (imageId) {
        await toggleFavorite(imageId);
      }
    });
  }

  /**
   * Watch for gallery DOM changes to update favorite states
   */
  function observeGalleryChanges() {
    const grid = document.getElementById('image-grid');
    if (!grid) return;

    const observer = new MutationObserver(() => {
      updateAllFavoriteStates();
    });

    observer.observe(grid, { childList: true, subtree: true });
  }

  /**
   * Toggle favorite for an image
   */
  async function toggleFavorite(imageId) {
    if (!currentUser) {
      currentUser = App?.getUser() || localStorage.getItem('houseColorUser') || 'Guest';
    }

    if (!db) {
      // Offline mode - use localStorage
      toggleFavoriteOffline(imageId);
      return;
    }

    try {
      const docRef = db.collection('images').doc(imageId);
      const doc = await docRef.get();

      let favorites = {};
      if (doc.exists) {
        favorites = doc.data().favorites || {};
      }

      // Toggle current user's favorite
      if (favorites[currentUser]) {
        delete favorites[currentUser];
      } else {
        favorites[currentUser] = true;
      }

      await docRef.set({ favorites }, { merge: true });

      // Update UI
      updateFavoriteButton(imageId, favorites);
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  }

  /**
   * Offline mode favorite toggle
   */
  function toggleFavoriteOffline(imageId) {
    const key = 'houseFavorites';
    const stored = JSON.parse(localStorage.getItem(key) || '{}');

    if (!stored[imageId]) {
      stored[imageId] = {};
    }

    if (stored[imageId][currentUser]) {
      delete stored[imageId][currentUser];
    } else {
      stored[imageId][currentUser] = true;
    }

    localStorage.setItem(key, JSON.stringify(stored));
    updateFavoriteButton(imageId, stored[imageId]);
  }

  /**
   * Update a favorite button's visual state
   */
  function updateFavoriteButton(imageId, favorites) {
    const btn = document.querySelector(`.favorite-btn[data-image-id="${imageId}"]`);
    if (!btn) return;

    const isFavorited = favorites[currentUser];
    const count = Object.keys(favorites).filter(k => favorites[k]).length;
    const names = Object.keys(favorites).filter(k => favorites[k]);

    // Update button appearance
    if (isFavorited) {
      btn.classList.remove('text-slate-400');
      btn.classList.add('text-rose-500');
      btn.innerHTML = `<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
      </svg>`;
    } else {
      btn.classList.remove('text-rose-500');
      btn.classList.add('text-slate-400');
      btn.innerHTML = `<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
      </svg>`;
    }

    // Update tooltip
    if (count > 0) {
      btn.title = `Favorited by: ${names.join(', ')}`;
    } else {
      btn.title = 'Add to favorites';
    }

    // Add count badge if multiple favorites
    let badge = btn.querySelector('.favorite-count');
    if (count > 1) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'favorite-count absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white';
        btn.style.position = 'relative';
        btn.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  }

  /**
   * Update all visible favorite buttons with current state
   */
  async function updateAllFavoriteStates() {
    const buttons = document.querySelectorAll('.favorite-btn[data-image-id]');

    for (const btn of buttons) {
      const imageId = btn.dataset.imageId;
      const favorites = await getFavorites(imageId);
      updateFavoriteButton(imageId, favorites);
    }
  }

  /**
   * Get favorites for an image
   */
  async function getFavorites(imageId) {
    if (!db) {
      const stored = JSON.parse(localStorage.getItem('houseFavorites') || '{}');
      return stored[imageId] || {};
    }

    try {
      const doc = await db.collection('images').doc(imageId).get();
      return doc.exists ? (doc.data().favorites || {}) : {};
    } catch (error) {
      console.error('Error getting favorites:', error);
      return {};
    }
  }

  /**
   * Add a comment to an image
   */
  async function addComment(imageId, text) {
    if (!currentUser) {
      currentUser = App?.getUser() || localStorage.getItem('houseColorUser') || 'Guest';
    }

    if (!text.trim()) return;

    const comment = {
      user: currentUser,
      text: text.trim(),
      timestamp: Date.now()
    };

    if (!db) {
      // Offline mode
      const key = 'houseComments';
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      if (!stored[imageId]) stored[imageId] = [];
      stored[imageId].push(comment);
      localStorage.setItem(key, JSON.stringify(stored));
      return comment;
    }

    try {
      const docRef = db.collection('images').doc(imageId);
      await docRef.set({
        comments: firebase.firestore.FieldValue.arrayUnion(comment)
      }, { merge: true });
      return comment;
    } catch (error) {
      console.error('Error adding comment:', error);
      return null;
    }
  }

  /**
   * Get comments for an image
   */
  async function getComments(imageId) {
    if (!db) {
      const stored = JSON.parse(localStorage.getItem('houseComments') || '{}');
      return stored[imageId] || [];
    }

    try {
      const doc = await db.collection('images').doc(imageId).get();
      return doc.exists ? (doc.data().comments || []) : [];
    } catch (error) {
      console.error('Error getting comments:', error);
      return [];
    }
  }

  /**
   * Subscribe to real-time updates for an image
   */
  function subscribeToImage(imageId, callback) {
    if (!db) return () => {};

    const unsubscribe = db.collection('images').doc(imageId)
      .onSnapshot((doc) => {
        const data = doc.exists ? doc.data() : { favorites: {}, comments: [] };
        callback(data);
      });

    unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Render comments UI for lightbox
   */
  function renderCommentsUI(imageId, container) {
    if (!container) return;

    container.innerHTML = `
      <div class="comments-section">
        <h4 class="text-sm font-semibold text-slate-800 mb-2">Comments</h4>
        <div class="comments-list space-y-2 max-h-40 overflow-y-auto mb-3"></div>
        <form class="comment-form flex gap-2">
          <input
            type="text"
            placeholder="Add a comment..."
            class="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            class="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Post
          </button>
        </form>
      </div>
    `;

    const list = container.querySelector('.comments-list');
    const form = container.querySelector('.comment-form');
    const input = form.querySelector('input');

    // Load existing comments
    loadComments(imageId, list);

    // Handle new comment
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value;
      if (text.trim()) {
        await addComment(imageId, text);
        input.value = '';
        loadComments(imageId, list);
      }
    });

    // Subscribe to updates
    if (db) {
      subscribeToImage(imageId, (data) => {
        renderCommentsList(data.comments || [], list);
      });
    }
  }

  /**
   * Load and render comments list
   */
  async function loadComments(imageId, container) {
    const comments = await getComments(imageId);
    renderCommentsList(comments, container);
  }

  /**
   * Render comments list HTML
   */
  function renderCommentsList(comments, container) {
    if (!container) return;

    if (comments.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400 italic">No comments yet</p>';
      return;
    }

    container.innerHTML = comments
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(c => `
        <div class="comment rounded-lg bg-slate-50 p-2">
          <div class="flex items-center gap-2">
            <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-medium text-slate-600">
              ${c.user.charAt(0).toUpperCase()}
            </span>
            <span class="text-xs font-medium text-slate-700">${c.user}</span>
            <span class="text-[10px] text-slate-400">${formatTime(c.timestamp)}</span>
          </div>
          <p class="mt-1 text-sm text-slate-600 pl-7">${escapeHtml(c.text)}</p>
        </div>
      `).join('');
  }

  /**
   * Format timestamp
   */
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Setup offline mode fallbacks
   */
  function setupOfflineMode() {
    setupFavoriteButtons();
    observeGalleryChanges();
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
    toggleFavorite,
    getFavorites,
    addComment,
    getComments,
    subscribeToImage,
    renderCommentsUI,
    updateAllFavoriteStates,
    cleanup
  };
})();

// Export for other modules
if (typeof window !== 'undefined') {
  window.Comments = Comments;
}
