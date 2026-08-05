// Общий helper для инициализации Firebase Admin SDK.
// Admin SDK обходит Firestore Security Rules — используется ТОЛЬКО на бэкенде (Netlify Functions),
// никогда не должен попадать во фронтенд-код.
//
// Требует переменную окружения FIREBASE_SERVICE_ACCOUNT_JSON — JSON сервисного аккаунта
// (Firebase Console → Project Settings → Service Accounts → Generate new private key),
// вставленный как одна строка целиком.

const admin = require('firebase-admin');

let app;

function getAdmin() {
  if (!app) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON не задана в переменных окружения Netlify');
    }
    const creds = JSON.parse(raw);
    app = admin.initializeApp({
      credential: admin.credential.cert(creds)
    });
  }
  return admin;
}

module.exports = { getAdmin };
