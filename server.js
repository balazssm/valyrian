require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ── MIDDLEWARE ──
app.use(cors({
  origin: '*', // élesben állítsd be a saját domainedre
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization','x-plugin-key']
}));
app.use(express.json());

// ── STATIKUS FRONTEND ──
app.use(express.static(path.join(__dirname, 'public')));

// ── API ROUTES ──
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/user',  require('./routes/user'));
app.use('/api/mc',    require('./routes/minecraft'));

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString()
  });
});

// ── SPA FALLBACK ──
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── MONGODB ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB csatlakozva');
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Szerver fut: http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB hiba:', err.message);
    process.exit(1);
  });
