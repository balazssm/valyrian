require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ── MIDDLEWARE JAVÍTÁS (CORS) ──
// Minden domainről érkező kérést engedélyezünk, és kezeljük az OPTIONS kéréseket
app.use(cors()); 

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-plugin-key");
  
  // Ha a böngésző csak ellenőriz (preflight), azonnal vágjuk rá, hogy OK
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

// ── SPA FALLBACK (Regex javítva Node v22-höz) ──
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── MONGODB ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB csatlakozva');
    const PORT = process.env.PORT || 3000;
    // A '0.0.0.0' segít a Rendernek a hálózati elérésben
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Szerver fut a ${PORT} porton`));
  })
  .catch(err => {
    console.error('❌ MongoDB hiba:', err.message);
    process.exit(1);
  });
