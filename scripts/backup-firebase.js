#!/usr/bin/env node
/**
 * Backup Firebase Ratings & Comments
 * Exports all ratings and comments from Firestore to a timestamped JSON file
 *
 * Uses collection group queries to find all ratings/comments even without parent docs
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collectionGroup, getDocs } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

// Firebase config (same as js/firebase-config.js)
const firebaseConfig = {
  apiKey: "AIzaSyAWhN91mH62wUPiLls5_g9HgbK76cytSJo",
  authDomain: "house-color-gallery.firebaseapp.com",
  projectId: "house-color-gallery",
  storageBucket: "house-color-gallery.firebasestorage.app",
  messagingSenderId: "904500653644",
  appId: "1:904500653644:web:488dc5e8b04e4c57894ee9"
};

async function backup() {
  console.log('Initializing Firebase...');
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const backup = {
    exportedAt: new Date().toISOString(),
    summary: { images: 0, ratings: 0, comments: 0 },
    data: {}
  };

  // Use collection group queries - finds ALL ratings/comments regardless of parent doc
  console.log('Fetching all ratings (collection group query)...');
  const ratingsSnapshot = await getDocs(collectionGroup(db, 'ratings'));
  console.log(`Found ${ratingsSnapshot.size} ratings`);

  for (const ratingDoc of ratingsSnapshot.docs) {
    const data = ratingDoc.data();
    // Path is: images/{imageId}/ratings/{userName}
    const imageId = ratingDoc.ref.parent.parent.id;
    const userName = ratingDoc.id;

    if (!backup.data[imageId]) {
      backup.data[imageId] = { ratings: {}, comments: [] };
    }

    backup.data[imageId].ratings[userName] = {
      value: data.value,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || null
    };
    backup.summary.ratings++;
    console.log(`  ${imageId}: ${userName} = ${data.value}`);
  }

  console.log('\nFetching all comments (collection group query)...');
  const commentsSnapshot = await getDocs(collectionGroup(db, 'comments'));
  console.log(`Found ${commentsSnapshot.size} comments`);

  for (const commentDoc of commentsSnapshot.docs) {
    const data = commentDoc.data();
    // Path is: images/{imageId}/comments/{commentId}
    const imageId = commentDoc.ref.parent.parent.id;

    if (!backup.data[imageId]) {
      backup.data[imageId] = { ratings: {}, comments: [] };
    }

    backup.data[imageId].comments.push({
      id: commentDoc.id,
      user: data.user,
      text: data.text,
      timestamp: data.timestamp
    });
    backup.summary.comments++;
    console.log(`  ${imageId}: "${data.text?.slice(0, 30)}..." by ${data.user}`);
  }

  // Sort comments by timestamp (newest first) for each image
  for (const imageId of Object.keys(backup.data)) {
    backup.data[imageId].comments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  backup.summary.images = Object.keys(backup.data).length;

  // Generate filename with timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `ratings-comments-${timestamp}.json`;
  const backupsDir = path.join(__dirname, '..', 'backups');
  const filepath = path.join(backupsDir, filename);

  // Ensure backups directory exists
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  // Write backup file
  fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));

  console.log('\n=== BACKUP COMPLETE ===');
  console.log(`Images:   ${backup.summary.images}`);
  console.log(`Ratings:  ${backup.summary.ratings}`);
  console.log(`Comments: ${backup.summary.comments}`);
  console.log(`\nSaved to: ${filepath}`);

  process.exit(0);
}

backup().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
