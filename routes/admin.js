const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Összes felhasználó lekérése
router.get('/users', auth, admin, async (req, res) => {
  try {
    const users = await User.find().select('-password'); // Jelszó ne látsszon!
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Hiba a lekéréskor.' });
  }
});

// Rang frissítése
router.put('/users/:id/rank', auth, admin, async (req, res) => {
  try {
    const { rank } = req.body;
    // Ellenőrizzük, hogy a kapott rang benne van-e az engedélyezettekben (opcionális biztonság)
    await User.findByIdAndUpdate(req.params.id, { rank });
    res.json({ message: 'Rang sikeresen frissítve!' });
  } catch (err) {
    res.status(500).json({ error: 'Hiba a frissítéskor.' });
  }
});

// --- ÚJ RÉSZ: Whitelist állapot frissítése ---
router.put('/users/:id/whitelist', auth, admin, async (req, res) => {
  try {
    const { whitelistStatus } = req.body; // Az admin.html-ből 'whitelistStatus' néven küldjük
    
    const user = await User.findByIdAndUpdate(
      req.params.id, 
      { whitelistStatus }, // A User.js modellben is ez a mezőnév
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Felhasználó nem található!' });
    }

    res.json({ message: 'Whitelist állapot sikeresen frissítve!', user });
  } catch (err) {
    console.error("Whitelist hiba:", err);
    res.status(500).json({ error: 'Hiba a whitelist frissítésekor.' });
  }
});

module.exports = router;
