const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();

const PHONE_PEPPER = process.env.PHONE_PEPPER;
if (!PHONE_PEPPER) {
  console.error('Missing PHONE_PEPPER environment variable');
  process.exit(1);
}

const db = admin.firestore();

const hashPhoneNumber = (phone) => {
  return crypto.createHmac('sha256', PHONE_PEPPER).update(phone).digest('hex');
};

async function migrateUsers() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();

  console.log(`Found ${snapshot.size} users`);

  let batch = db.batch();
  let count = 0;
  let batchCount = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    // Check if the user has a phoneNumber and doesn't yet have a hashedPhoneNumber.
    if (data.phoneNumber && !data.hashedPhoneNumber) {
      const hashed = hashPhoneNumber(data.phoneNumber);
      batch.update(doc.ref, { hashedPhoneNumber: hashed });
      count++;
      batchCount++;

      // Commit the batch every 500 writes.
      if (batchCount === 500) {
        batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  });

  // Commit any remaining updates.
  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Migration complete. Updated ${count} user documents.`);
}

migrateUsers()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during migration:', error);
    process.exit(1);
  });