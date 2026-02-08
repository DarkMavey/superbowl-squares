// =================== FIREBASE CONFIG ===================
// 1. Go to https://console.firebase.google.com
// 2. Create a project (e.g., "superbowl-squares")
// 3. Add a Web App and copy the config values below
// 4. Enable Realtime Database (start in test mode)
// 5. Replace the placeholder values below with your actual config

const firebaseConfig = {
  apiKey: "AIzaSyCJGzsnPTFYJ4ceNCdAaW2C-gvLG8wbR_g",
  authDomain: "superbowl-squares-4182c.firebaseapp.com",
  databaseURL: "https://superbowl-squares-4182c-default-rtdb.firebaseio.com",
  projectId: "superbowl-squares-4182c",
  storageBucket: "superbowl-squares-4182c.firebasestorage.app",
  messagingSenderId: "546196978948",
  appId: "1:546196978948:web:c52624956b4892f3ce2451",
  measurementId: "G-WEF6MZQX1P"
};

firebase.initializeApp(firebaseConfig);
const gameRef = firebase.database().ref('game');
