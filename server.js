require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ── CORS BEÁLLÍTÁSOK ──
app.use(cors());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-plugin-key");
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// ── STATIKUS FRONTEND KISZOLGÁLÁSA ──
// Ez biztosítja, hogy a public mappából elérhető legyen minden (CSS, képek, JS)
app.use(express.static(path.join(__dirname, 'public')));

// ── API ROUTES ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/mc', require('./routes/minecraft'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/purchase', require('./routes/purchase')); // VAL-1, VAL-2 generálás
app.use('/api/stats', require('./routes/stats'));       // Minecraft/Neptune statisztikák

// ── KIFEJEZETT OLDAL ÚTVONALAK ──
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/bolt', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'store.html'));
});

app.get('/fooldal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString()
  });
});

// ── API 404 HIBAKEZELŐ ──
app.use('/api', (req, res) => {
  res.status(404).json({ 
    error: 'API végpont nem található ezen a címen!',
    path: req.originalUrl 
  });
});

// ── SPA FALLBACK (Minden másra az index.html-t dobja) ──
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── MONGODB CSATLAKOZÁS ÉS SZERVER INDÍTÁS ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB csatlakozva');
    const PORT = process.env.PORT || 3000;
    
    // 0.0.0.0 kötelező Render/Heroku/Docker környezetben
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Szerver fut a ${PORT} porton`);
      console.log(`📊 Statisztika elérhető: http://localhost:${PORT}/api/stats/jatekosnev`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB hiba:', err.message);
    process.exit(1);
  });
