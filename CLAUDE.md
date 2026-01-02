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
