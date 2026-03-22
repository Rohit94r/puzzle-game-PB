# 🧩 Logic Looper — Daily Puzzle Game

A daily brain-training puzzle app built with **React + Vite**, featuring adaptive difficulty, streak tracking, Firebase auth, offline support, and a full analytics dashboard.

---

## 🚀 Live Features

- 🧩 **One puzzle per day** — sequence & matrix number puzzles
- 🔥 **Streak tracking** — daily solve streaks with milestone celebrations
- 🧠 **Adaptive difficulty** — engine adjusts based on your performance
- 💡 **Hint system** — budget-controlled hints per difficulty level
- 📊 **Insights dashboard** — performance trends, solve rates, time analytics
- 📅 **Activity heatmap** — GitHub-style calendar of your solve history
- 🏅 **Achievements** — 10 unlockable badges
- 📴 **Offline-first** — IndexedDB (Dexie) local storage with background sync
- 🏆 **Leaderboard** — powered by Firebase Firestore + Neon (PostgreSQL)
- 🔐 **Google Auth** — sign in with redirect (no popup / COOP issues)

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS |
| Auth | Firebase Authentication (Google) |
| Remote DB | Firebase Firestore + Neon (PostgreSQL) |
| Local DB | Dexie (IndexedDB) |
| Backend | Express.js (Node) |
| Utilities | Day.js, crypto-js, idb |

---

## 📁 Project Structure

```
├── public/
├── server/                  # Express backend (Neon/PostgreSQL)
│   ├── index.js
│   └── .env                 # DB connection string (not committed)
├── src/
│   ├── components/
│   │   ├── DailyPuzzle.jsx       # Core puzzle UI & state machine
│   │   ├── Heatmap.jsx           # Activity calendar
│   │   ├── Hintpanel.jsx         # Hint UI
│   │   ├── insightsdashboard.jsx # Analytics dashboard
│   │   ├── ActivityLog.jsx       # Solve history list
│   │   └── OnlineBanner.jsx      # Offline/online status banner
│   ├── constants/
│   │   └── Brand.js              # Design tokens (colors, fonts, radii)
│   ├── puzzles/
│   │   └── numberMatrix.js       # Matrix puzzle definitions
│   ├── utils/
│   │   ├── puzzleGenerator.js    # Daily puzzle generation (seeded PRNG)
│   │   ├── Difficultyengine.js   # Adaptive difficulty logic
│   │   ├── Hintengine.js         # Hint budget & text generation
│   │   ├── Advancedanalytics.js  # Performance metrics
│   │   ├── insightsengine.js     # Insights computation
│   │   ├── Streakengine.js       # Streak calculation
│   │   ├── Retentionengine.js    # Retention analytics
│   │   ├── firestoreSync.js      # Firebase sync helpers
│   │   ├── Neonsync.js           # Neon/PostgreSQL sync helpers
│   │   ├── sync.js               # Background sync orchestrator
│   │   ├── validator.js          # Answer validation
│   │   ├── prng.js               # Seeded random number generator
│   │   └── seed.js               # Date-based seed generator
│   ├── App.jsx                   # Root shell, auth, tabs, achievements
│   ├── db.js                     # Dexie schema & queries
│   ├── firebase.js               # Firebase app init
│   └── main.jsx
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## ⚙️ Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project (Firestore + Google Auth enabled)
- A Neon (PostgreSQL) database *(optional — app falls back to Firestore)*

### 1. Clone & Install

```bash
git clone https://github.com/Rohit94r/puzzle-game-PB.git
cd puzzle-game-PB
npm install
```

### 2. Configure Firebase

Create `src/firebase.js` (or update the existing one) with your Firebase config:

```js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "<YOUR_API_KEY>",
  authDomain: "<YOUR_AUTH_DOMAIN>",
  projectId: "<YOUR_PROJECT_ID>",
  storageBucket: "<YOUR_STORAGE_BUCKET>",
  messagingSenderId: "<YOUR_MESSAGING_SENDER_ID>",
  appId: "<YOUR_APP_ID>",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
```

### 3. Configure Backend (Optional — Neon)

```bash
cd server
cp .env.example .env   # or create .env manually
```

Add to `server/.env`:

```
DATABASE_URL=postgresql://<user>:<password>@<host>/<dbname>?sslmode=require
PORT=3001
```

Start the server:

```bash
cd server
node index.js
```

### 4. Run the Frontend

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## 📦 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |

---

## 🎮 How It Works

1. **Sign in** with Google
2. A **unique puzzle** is generated daily using a date-based seed (same puzzle for all users on the same day)
3. **Solve** the sequence or matrix puzzle — timer starts on first interaction
4. Score = `max(100 - timeTaken, 10)` — faster = higher score
5. Results sync to **Firestore** and **Neon** leaderboard (when online)
6. All activity is stored locally in **IndexedDB** for offline access

---

## 🏅 Achievements

| Badge | Condition |
|---|---|
| 🌟 First Steps | Solve your first puzzle |
| 🔥 On Fire | 3-day streak |
| ⚡ Week Warrior | 7-day streak |
| 💎 Unstoppable | 30-day streak |
| 💯 Perfect | Score 100 on a puzzle |
| ⚡ Speed Demon | Solve in under 15 seconds |
| ✨ Clean Solver | 10 first-attempt solves |
| 🧠 Brain Buster | Solve a hard puzzle |
| 💫 Century | 100 total solves |
| 🎯 Consistent | 5-day no-hint streak |

---

## 🔒 Environment Variables

| Variable | Location | Purpose |
|---|---|---|
| Firebase config | `src/firebase.js` | Auth + Firestore |
| `DATABASE_URL` | `server/.env` | Neon PostgreSQL connection |
| `PORT` | `server/.env` | Backend port (default 3001) |

> ⚠️ Never commit `.env` files or Firebase credentials to version control.

---

## 📄 License

MIT — feel free to fork and build on it.

---

Built with ❤️ using React, Firebase, and Neon.
