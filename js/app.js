/**
 * Main application initialization for House Color Gallery
 * Handles Firebase auth, user identification, and module coordination
 */

const App = (function() {
  let currentUser = null;
  let db = null;
  let auth = null;

  /**
   * Initialize the application
   */
  async function init() {
    // Initialize Firebase
    if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined') {
      try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();

        // Sign in anonymously
        await auth.signInAnonymously();
        console.log('Firebase initialized');
      } catch (error) {
        console.error('Firebase init error:', error);
      }
    } else {
      console.warn('Firebase not available - running in offline mode');
    }

    // Check for existing user
    currentUser = localStorage.getItem('houseColorUser');

    if (!currentUser) {
      showNameModal();
    } else {
      updateUserDisplay();
      initModules();
    }
  }

  /**
   * Show the name selection modal
   */
  function showNameModal() {
    const modal = document.getElementById('name-modal');
    const form = document.getElementById('name-form');
    const input = document.getElementById('visitor-name');
    const skipBtn = document.getElementById('name-skip');

    if (!modal) {
      // No modal, use default
      setUser('Guest');
      return;
    }

    modal.classList.remove('hidden');

    // Quick select buttons for Bree, Anna, Riley
    const quickNames = ['Bree', 'Anna', 'Riley'];
    const quickBtnsContainer = document.createElement('div');
    quickBtnsContainer.className = 'flex gap-2 mb-3';
    quickNames.forEach(name => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors';
      btn.textContent = name;
      btn.addEventListener('click', () => {
        setUser(name);
        modal.classList.add('hidden');
      });
      quickBtnsContainer.appendChild(btn);
    });

    // Insert quick buttons before the input
    const inputContainer = input.closest('div');
    if (inputContainer && !document.querySelector('.quick-name-btns')) {
      quickBtnsContainer.classList.add('quick-name-btns');
      inputContainer.parentNode.insertBefore(quickBtnsContainer, inputContainer);
    }

    // Form submit
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = input.value.trim();
        if (name) {
          setUser(name);
          modal.classList.add('hidden');
        }
      });
    }

    // Skip button
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        setUser('Guest');
        modal.classList.add('hidden');
      });
    }

    // Focus input
    if (input) {
      setTimeout(() => input.focus(), 100);
    }
  }

  /**
   * Set the current user
   */
  function setUser(name) {
    currentUser = name;
    localStorage.setItem('houseColorUser', name);
    updateUserDisplay();
    initModules();
  }

  /**
   * Update user display in header
   */
  function updateUserDisplay() {
    // Look for user display element or create one
    let userDisplay = document.getElementById('user-display');

    if (!userDisplay) {
      // Try to add to header
      const header = document.querySelector('header');
      if (header) {
        userDisplay = document.createElement('div');
        userDisplay.id = 'user-display';
        userDisplay.className = 'flex items-center gap-2 text-sm text-slate-600';
        header.appendChild(userDisplay);
      }
    }

    if (userDisplay && currentUser) {
      userDisplay.innerHTML = `
        <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
          ${currentUser.charAt(0).toUpperCase()}
        </span>
        <span>${currentUser}</span>
        <button id="change-user" class="text-slate-400 hover:text-slate-600" title="Change name">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
          </svg>
        </button>
      `;

      // Change user button
      const changeBtn = document.getElementById('change-user');
      if (changeBtn) {
        changeBtn.addEventListener('click', () => {
          localStorage.removeItem('houseColorUser');
          currentUser = null;
          showNameModal();
        });
      }
    }
  }

  /**
   * Initialize other modules
   */
  function initModules() {
    // Initialize Gallery
    if (typeof Gallery !== 'undefined') {
      Gallery.init();
    } else if (typeof HouseColorGallery !== 'undefined') {
      HouseColorGallery.initGallery();
    }

    // Initialize Comments/Favorites
    if (typeof Comments !== 'undefined') {
      Comments.init(db, currentUser);
    }
  }

  /**
   * Get current user
   */
  function getUser() {
    return currentUser;
  }

  /**
   * Get Firestore database
   */
  function getDb() {
    return db;
  }

  // Public API
  return {
    init,
    getUser,
    getDb,
    setUser
  };
})();

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.init);
} else {
  App.init();
}

// Export for other modules
if (typeof window !== 'undefined') {
  window.App = App;
}
