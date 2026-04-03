require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ── ATOMBIZTOS CORS BEÁLLÍTÁS ──
app.use(cors()); // Alapértelmezett minden engedélyezése

app.use((req, res, next) => {
  // Manuálisan is hozzáadjuk a fejlécet minden válaszhoz
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-plugin-key");
  
  // A preflight (OPTIONS) kérésekre azonnal OK-val válaszolunk
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// ── STATIKUS FRONTEND ──
app.use(express.static(path.join(__dirname, 'public')));

// ── API ROUTES ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/mc', require('./routes/minecraft'));

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString()
  });
});

// ── SPA FALLBACK (Node v22 kompatibilis) ──
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── MONGODB CSATLAKOZÁS ÉS INDÍTÁS ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB csatlakozva');
    const PORT = process.env.PORT || 3000;
    // A '0.0.0.0' megadása fontos Render-en a külső eléréshez
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Szerver fut a ${PORT} porton`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB hiba:', err.message);
    process.exit(1);
  });
