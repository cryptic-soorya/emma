import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { 
  getFirestore, collection, addDoc, query, orderBy, 
  onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp 
} from "firebase/firestore";

// 👇 PASTE YOUR FIREBASE CONFIG HERE 👇
const firebaseConfig = {
  apiKey: "AIzaSyARXztvn699YE_IllXB-FuJPsgdlrMFQaE",
  authDomain: "mika-v2.firebaseapp.com",
  projectId: "mika-v2",
  storageBucket: "mika-v2.firebasestorage.app",
  messagingSenderId: "460901973690",
  appId: "1:460901973690:web:63fb132a6c74c133688c83"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// --- HELPER FUNCTIONS (Based on your code) ---

export const createChat = async (userId: string, firstMessage: string) => {
  const docRef = await addDoc(collection(db, "users", userId, "chats"), {
    title: firstMessage.slice(0, 30) || "New Session",
    createdAt: serverTimestamp(),
    lastUpdated: serverTimestamp()
  });
  return docRef.id;
};

export const saveMessage = async (userId: string, chatId: string, message: any) => {
  await addDoc(collection(db, "users", userId, "chats", chatId, "messages"), {
    ...message,
    createdAt: serverTimestamp()
  });
  // Update last active time
  await updateDoc(doc(db, "users", userId, "chats", chatId), {
    lastUpdated: serverTimestamp()
  });
};

export const saveNote = async (userId: string, note: any) => {
  const docRef = await addDoc(collection(db, "users", userId, "notes"), {
    ...note,
    updatedAt: serverTimestamp()
  });
  return docRef.id;
};

export const updateNoteContent = async (userId: string, noteId: string, content: string, title: string) => {
  await updateDoc(doc(db, "users", userId, "notes", noteId), {
    content,
    title,
    updatedAt: serverTimestamp()
  });
};