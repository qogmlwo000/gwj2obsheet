// Firebase 프로젝트 설정 — 콘솔에서 받은 firebaseConfig 객체.
// (Firestore + Realtime Database 모두 사용)

export const firebaseConfig = {
  apiKey: "AIzaSyBB8Vz8WMeXR-am-HnBPVqtdqDKSUqoGuc",
  authDomain: "gwj2-ob-staff-sheet.firebaseapp.com",
  databaseURL: "https://gwj2-ob-staff-sheet-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "gwj2-ob-staff-sheet",
  storageBucket: "gwj2-ob-staff-sheet.firebasestorage.app",
  messagingSenderId: "130711981903",
  appId: "1:130711981903:web:84931fdcb18bdd1aa0ff3a",
};

export const isFirebaseConfigured = () =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
