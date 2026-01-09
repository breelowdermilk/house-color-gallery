# House Color Gallery

## Firebase Configuration

**Project ID:** `house-color-gallery`

**Firebase CLI Token:** Stored in `.firebase-token` (not committed to git)

To deploy Firestore rules:
```bash
source .firebase-token && firebase deploy --only firestore:rules --token "$FIREBASE_TOKEN"
```

## Tech Stack
- Static HTML/JS hosted on GitHub Pages
- Firebase Firestore for ratings and comments
- Cloudinary for image hosting

## Adding New Images

### Process
1. Upload images to Cloudinary using Python script
2. Add entries to `data/images.json` (or `data/swatches.json` for wallpapers)
3. Commit and push to deploy via GitHub Pages

### Cloudinary Upload Pattern
```python
import cloudinary
import cloudinary.uploader

cloudinary.config(
    cloud_name="diasapebb",
    api_key="582112555554759",
    api_secret="nfYJthg5wRg8mXn06Fmbh324Xe0"
)

result = cloudinary.uploader.upload(
    file_path,
    folder="house-color-gallery/parlor",  # or office, dining-room, swatches, stripped/*
    public_id="your-slug-here",
    overwrite=True
)
# Use result['public_id'] for the actual ID (may differ from what you passed!)
# Use result['secure_url'] for the actual URL
```

### CRITICAL: Cloudinary URL Lesson
**Always use the `public_id` and `secure_url` returned by Cloudinary**, not what you think they should be!

Cloudinary may truncate or modify your public_id. Example:
- You pass: `moody-teal-purple-sofa-blue-rug-gold-mirror-magenta-curtain`
- Cloudinary returns: `moody-teal-purple-sofa-blue-rug-gold-mirror-magent` (truncated!)

**Wrong approach:**
```python
# DON'T hardcode URLs based on your slugify function
img['url'] = f"{base}/house-color-gallery/parlor/{slugify(filename)}"  # May not match!
```

**Correct approach:**
```python
# DO use the actual returned values
result = cloudinary.uploader.upload(...)
img['url'] = result['secure_url']
img['public_id'] = result['public_id']
```

### JSON Entry Structure

**Room images** (`data/images.json`):
```json
{
  "id": "parlor-044",
  "filename": "Display Name Here",
  "url": "https://res.cloudinary.com/diasapebb/image/upload/house-color-gallery/parlor/actual-public-id",
  "thumbnail": "https://res.cloudinary.com/diasapebb/image/upload/c_fill,w_400,h_300,q_auto,f_auto/house-color-gallery/parlor/actual-public-id",
  "walls": "Color",
  "trim": "Color",
  "feature": "Notable feature",
  "tags": ["tag1", "tag2"],
  "likes": 0,
  "score": 0
}
```

**Current Setup images** (nested under `current-setup`):
```json
{
  "id": "setup-parlor-001",
  "filename": "Display Name",
  "url": "...",
  "thumbnail": "..."
}
```

## Gallery Display Logic

### Tier-Based Filtering
Images are grouped by score tiers in "All (by tier)" view:
- Favorites: score 5-6
- Strong: score 4
- Promising: score 3
- Controversial: score 1-2
- **Unrated: score 0** (new images!)

**Important:** Both `gallery.js` and `swatches.js` have this tier logic. If you add a tier to one, add it to both!

### Current Setup Tab
The Current Setup tab groups by `subRoom` (Parlor, Office, Dining Room) instead of score tiers. Images need a `subRoom` field set during flattening.

## Common Issues

### New images not showing
1. **Check score tier** - Score 0 items need the "Unrated" tier (min: 0, max: 0)
2. **Check Cloudinary URL** - Verify URL returns 200: `curl -sI "URL" | head -1`
3. **Browser cache** - Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

### Verifying deployment
```bash
# Check if JSON updated
curl -s "https://breelowdermilk.github.io/house-color-gallery/data/images.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['parlor']), 'parlor images')"

# Check if JS updated (look for specific code)
curl -s "https://breelowdermilk.github.io/house-color-gallery/js/gallery.js" | grep -c "Unrated"
```

### Testing with Playwright
```bash
node << 'ENDSCRIPT'
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://breelowdermilk.github.io/house-color-gallery/');
  // ... your tests
  await browser.close();
})();
ENDSCRIPT
```
