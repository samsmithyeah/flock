const admin = require('firebase-admin');

// Path to your service account key
const serviceAccount = require('./serviceAccountKey.json');

// Initialize the admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function setUserAsAdmin(uid) {
  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log(`Successfully set user ${uid} as admin.`);
  } catch (error) {
    console.error('Error setting admin claim:', error);
  } finally {
    process.exit(0);
  }
}

const userId = 'PVNfwfz1guYpJVEc9klOTLm6fFd2';
setUserAsAdmin(userId);
