/**
 * Lightbox and Comparison Module for House Color Gallery
 *
 * Features:
 * - Lightbox overlay for enlarged image viewing
 * - Keyboard navigation (arrows, Escape)
 * - Comparison mode (up to 3 images side-by-side)
 * - Touch/swipe support for mobile
 */

const Lightbox = (function() {
  // State
  let currentImageId = null;
  let imageList = [];
  let compareSelection = [];
  const MAX_COMPARE = 3;

  // Touch handling
  let touchStartX = 0;
  let touchStartY = 0;
  const SWIPE_THRESHOLD = 50;

  // DOM Elements (created on init)
  let overlay = null;
  let lightboxContainer = null;
  let comparisonPanel = null;

  /**
   * Initialize the lightbox module
   * @param {Array} images - Array of image objects with id, src, title properties
   */
  function init(images = []) {
    imageList = images;
    createLightboxDOM();
    createComparisonPanelDOM();
    bindEvents();
  }

  /**
   * Update the image list (e.g., after filtering)
   * @param {Array} images - New array of image objects
   */
  function updateImageList(images) {
    imageList = images;
  }

  /**
   * Create lightbox DOM elements
   */
  function createLightboxDOM() {
    // Remove existing if present
    const existing = document.getElementById('lightbox-overlay');
    if (existing) existing.remove();

    overlay = document.createElement('div');
    overlay.id = 'lightbox-overlay';
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
      <div class="lightbox-container">
        <button class="lightbox-close" aria-label="Close lightbox">&times;</button>
        <button class="lightbox-nav lightbox-prev" aria-label="Previous image">&#10094;</button>
        <div class="lightbox-content">
          <img class="lightbox-image" src="" alt="">
          <div class="lightbox-caption"></div>
        </div>
        <button class="lightbox-nav lightbox-next" aria-label="Next image">&#10095;</button>
      </div>
    `;

    document.body.appendChild(overlay);
    lightboxContainer = overlay.querySelector('.lightbox-container');
  }

  /**
   * Create comparison panel DOM elements
   */
  function createComparisonPanelDOM() {
    // Remove existing if present
    const existing = document.getElementById('comparison-panel');
    if (existing) existing.remove();

    comparisonPanel = document.createElement('div');
    comparisonPanel.id = 'comparison-panel';
    comparisonPanel.className = 'comparison-panel';
    comparisonPanel.innerHTML = `
      <div class="comparison-header">
        <h3>Compare Colors <span class="comparison-count">(0/${MAX_COMPARE})</span></h3>
        <button class="comparison-clear" aria-label="Clear selection">Clear All</button>
      </div>
      <div class="comparison-images"></div>
    `;

    document.body.appendChild(comparisonPanel);
  }

  /**
   * Bind all event listeners
   */
  function bindEvents() {
    // Lightbox events
    overlay.addEventListener('click', handleOverlayClick);
    overlay.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    overlay.querySelector('.lightbox-prev').addEventListener('click', () => navigateLightbox(-1));
    overlay.querySelector('.lightbox-next').addEventListener('click', () => navigateLightbox(1));

    // Keyboard events
    document.addEventListener('keydown', handleKeydown);

    // Touch events for swipe
    overlay.addEventListener('touchstart', handleTouchStart, { passive: true });
    overlay.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Comparison panel events
    comparisonPanel.querySelector('.comparison-clear').addEventListener('click', clearComparison);
  }

  /**
   * Handle overlay click (close if clicking outside image)
   */
  function handleOverlayClick(e) {
    if (e.target === overlay) {
      closeLightbox();
    }
  }

  /**
   * Handle keyboard navigation
   */
  function handleKeydown(e) {
    if (!overlay.classList.contains('active')) return;

    switch(e.key) {
      case 'Escape':
        closeLightbox();
        break;
      case 'ArrowLeft':
        navigateLightbox(-1);
        break;
      case 'ArrowRight':
        navigateLightbox(1);
        break;
    }
  }

  /**
   * Handle touch start for swipe detection
   */
  function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }

  /**
   * Handle touch end for swipe detection
   */
  function handleTouchEnd(e) {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Only register horizontal swipes (ignore vertical scrolls)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
      if (deltaX > 0) {
        navigateLightbox(-1); // Swipe right = previous
      } else {
        navigateLightbox(1); // Swipe left = next
      }
    }
  }

  /**
   * Open lightbox with specified image
   * @param {string} imageId - The ID of the image to display
   */
  function openLightbox(imageId) {
    const image = imageList.find(img => img.id === imageId);
    if (!image) {
      console.warn(`Lightbox: Image with id "${imageId}" not found`);
      return;
    }

    currentImageId = imageId;

    const lightboxImg = overlay.querySelector('.lightbox-image');
    const lightboxCaption = overlay.querySelector('.lightbox-caption');

    lightboxImg.src = image.src;
    lightboxImg.alt = image.title || '';
    lightboxCaption.textContent = image.title || '';

    overlay.classList.add('active');
    document.body.classList.add('lightbox-open');

    updateNavButtons();
  }

  /**
   * Close the lightbox
   */
  function closeLightbox() {
    overlay.classList.remove('active');
    document.body.classList.remove('lightbox-open');
    currentImageId = null;
  }

  /**
   * Navigate to next/previous image
   * @param {number} direction - -1 for previous, 1 for next
   */
  function navigateLightbox(direction) {
    if (!currentImageId) return;

    const currentIndex = imageList.findIndex(img => img.id === currentImageId);
    if (currentIndex === -1) return;

    let newIndex = currentIndex + direction;

    // Wrap around
    if (newIndex < 0) newIndex = imageList.length - 1;
    if (newIndex >= imageList.length) newIndex = 0;

    openLightbox(imageList[newIndex].id);
  }

  /**
   * Update navigation button visibility based on position
   */
  function updateNavButtons() {
    const prevBtn = overlay.querySelector('.lightbox-prev');
    const nextBtn = overlay.querySelector('.lightbox-next');

    // Show both buttons (we have wrap-around navigation)
    prevBtn.style.display = imageList.length > 1 ? 'block' : 'none';
    nextBtn.style.display = imageList.length > 1 ? 'block' : 'none';
  }

  /**
   * Toggle image in comparison selection
   * @param {string} imageId - The ID of the image to toggle
   * @returns {boolean} - Whether the image is now selected
   */
  function toggleCompare(imageId) {
    const index = compareSelection.indexOf(imageId);

    if (index > -1) {
      // Remove from selection
      compareSelection.splice(index, 1);
      renderComparisonPanel();
      updateCompareCheckboxes();
      return false;
    } else {
      // Add to selection (if under max)
      if (compareSelection.length >= MAX_COMPARE) {
        showCompareMaxWarning();
        return false;
      }
      compareSelection.push(imageId);
      renderComparisonPanel();
      updateCompareCheckboxes();
      return true;
    }
  }

  /**
   * Check if an image is in the comparison selection
   * @param {string} imageId - The ID to check
   * @returns {boolean}
   */
  function isInComparison(imageId) {
    return compareSelection.includes(imageId);
  }

  /**
   * Get current comparison selection
   * @returns {Array} - Array of selected image IDs
   */
  function getCompareSelection() {
    return [...compareSelection];
  }

  /**
   * Clear all comparison selections
   */
  function clearComparison() {
    compareSelection = [];
    renderComparisonPanel();
    updateCompareCheckboxes();
  }

  /**
   * Render the comparison panel with selected images
   */
  function renderComparisonPanel() {
    const container = comparisonPanel.querySelector('.comparison-images');
    const countSpan = comparisonPanel.querySelector('.comparison-count');

    countSpan.textContent = `(${compareSelection.length}/${MAX_COMPARE})`;

    if (compareSelection.length === 0) {
      comparisonPanel.classList.remove('active');
      container.innerHTML = '';
      return;
    }

    comparisonPanel.classList.add('active');

    container.innerHTML = compareSelection.map(imageId => {
      const image = imageList.find(img => img.id === imageId);
      if (!image) return '';

      return `
        <div class="comparison-item" data-id="${imageId}">
          <button class="comparison-remove" aria-label="Remove from comparison">&times;</button>
          <img src="${image.src}" alt="${image.title || ''}">
          <span class="comparison-label">${image.title || ''}</span>
        </div>
      `;
    }).join('');

    // Bind remove buttons
    container.querySelectorAll('.comparison-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.comparison-item');
        const imageId = item.dataset.id;
        toggleCompare(imageId);
      });
    });

    // Bind click to open lightbox
    container.querySelectorAll('.comparison-item img').forEach(img => {
      img.addEventListener('click', (e) => {
        const item = e.target.closest('.comparison-item');
        const imageId = item.dataset.id;
        openLightbox(imageId);
      });
    });
  }

  /**
   * Update checkbox states in the gallery grid
   */
  function updateCompareCheckboxes() {
    document.querySelectorAll('.compare-checkbox').forEach(checkbox => {
      const imageId = checkbox.dataset.imageId;
      checkbox.checked = compareSelection.includes(imageId);

      // Disable unchecked boxes if at max
      if (!checkbox.checked && compareSelection.length >= MAX_COMPARE) {
        checkbox.disabled = true;
      } else {
        checkbox.disabled = false;
      }
    });
  }

  /**
   * Show warning when max comparison images reached
   */
  function showCompareMaxWarning() {
    // Create toast notification
    let toast = document.querySelector('.lightbox-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'lightbox-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = `Maximum ${MAX_COMPARE} images can be compared`;
    toast.classList.add('active');

    setTimeout(() => {
      toast.classList.remove('active');
    }, 2500);
  }

  /**
   * Create a compare checkbox element for an image card
   * @param {string} imageId - The image ID this checkbox controls
   * @returns {HTMLElement} - The checkbox wrapper element
   */
  function createCompareCheckbox(imageId) {
    const wrapper = document.createElement('label');
    wrapper.className = 'compare-checkbox-wrapper';
    wrapper.innerHTML = `
      <input type="checkbox" class="compare-checkbox" data-image-id="${imageId}">
      <span class="compare-checkbox-label">Compare</span>
    `;

    const checkbox = wrapper.querySelector('input');
    checkbox.checked = compareSelection.includes(imageId);

    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      toggleCompare(imageId);
    });

    // Prevent click from bubbling to card (which opens lightbox)
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    return wrapper;
  }

  // Public API
  return {
    init,
    updateImageList,
    openLightbox,
    closeLightbox,
    navigateLightbox,
    toggleCompare,
    isInComparison,
    getCompareSelection,
    clearComparison,
    renderComparisonPanel,
    createCompareCheckbox
  };
})();

// Export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Lightbox;
}
