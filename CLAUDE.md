# Word Translator - Chrome Extension + Node.js Backend

## Architecture
- **Chrome Extension** (manifest v3): content script monitors text selection, floating panel shows translation
- **Node.js Backend** (Express): translation API + MySQL storage
- **MySQL Database**: stores word, translation, frequency

## Tech Stack
- Frontend: Chrome Extension (Manifest V3, vanilla JS)
- Backend: Node.js + Express
- Database: MySQL (mysql2 npm package)
- Translation: Free Google Translate API (google-translate-api npm)

## Key Commands
- `cd server && npm start` — start backend
- `cd server && npm run dev` — start with nodemon

## Code Standards
- ES modules or CommonJS (pick one consistently)
- Chinese comments where helpful
- Error handling on all API calls
- Clean, modular structure

## Directory Structure
```
word-translator/
├── extension/          # Chrome Extension
│   ├── manifest.json
│   ├── content.js      # Selection listener + floating panel
│   ├── background.js   # Service worker
│   ├── popup.html      # Extension popup
│   ├── popup.js
│   └── styles.css
├── server/             # Node.js Backend
│   ├── package.json
│   ├── index.js        # Entry point
│   ├── routes/
│   ├── db/
│   └── .env.example
└── CLAUDE.md
```
