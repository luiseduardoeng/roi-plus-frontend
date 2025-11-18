// src/firebaseConfig.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Cole a sua configuração do Firebase aqui
const firebaseConfig = {
  apiKey: "AIzaSyAO8ShUKFrj9v1t4fVsWYiWez_bHLppy9I",
  authDomain: "roiplus-becfc.firebaseapp.com",
  projectId: "roiplus-becfc",
  storageBucket: "roiplus-becfc.firebasestorage.app",
  messagingSenderId: "817189558532",
  appId: "1:817189558532:web:373906f1a74f7d1e509851",
  measurementId: "G-F5S39QK6RX"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta o banco de dados (Firestore) para ser usado em outros arquivos
export const db = getFirestore(app);