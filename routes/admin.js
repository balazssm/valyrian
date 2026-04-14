const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const mongoose = require('mongoose');

// --- 1. Összes felhasználó lekérése ÉLŐ LuckPerms szinkronnal ---
router.get('/users', auth, admin, async (req, res) => {
  try {
    // Weboldal felhasználóinak lekérése a 'valyrian' adatbázisból
    const webUsers = await User.find().select('-password').lean();
    
    // Átváltunk a 'minecraft' adatbázisra, ahol a LuckPerms táblái vannak
    const lpDatabase = mongoose.connection.useDb('minecraft');
    // A LuckPerms a 'users' nevű kollekcióba ment (ezt láttuk a képeden)
    const lpCollection = lpDatabase.collection('users');

    // Összefésüljük a weboldalas adatokat a játékbeli élő rangokkal
    const usersWithLiveRank = await Promise.all(webUsers.map(async (user) => {
      // LuckPerms kisbetűvel tárolja a neveket a 'name' mezőben
      const lpData = await lpCollection.findOne({ name: user.username.toLowerCase() });
      
      return {
        ...user,
        // Ha van találat az LP táblában, az ottani 'primaryGroup'-ot mutatjuk,
        // különben marad a weboldal saját adatbázisában tárolt alapértelmezett rangja.
        rank: lpData ? lpData.primaryGroup : user.rank 
      };
    }));

    res.json(usersWithLiveRank);
  } catch (err) {
    console.error("Szinkronizációs hiba az admin panelen:", err);
    res.status(500).json({ error: 'Hiba történt a felhasználók betöltésekor.' });
  }
});

// --- 2. Rang frissítése az adatbázisban (opcionális, manuális felülíráshoz) ---
router.put('/users/:id/rank', auth, admin, async (req, res) => {
  try {
    const { rank } = req.body;
    await User.findByIdAndUpdate(req.params.id, { rank });
    res.json({ message: 'Rang sikeresen frissítve a weboldal adatbázisában!' });
  } catch (err) {
    res.status(500).json({ error: 'Hiba a frissítéskor.' });
  }
});

// --- 3. Whitelist állapot frissítése ---
router.put('/users/:id/whitelist', auth, admin, async (req, res) => {
  try {
    const { whitelistStatus } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.id, 
      { whitelistStatus }, 
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Felhasználó nem található!' });
    }

    res.json({ message: 'Whitelist állapot sikeresen frissítve!', user });
  } catch (err) {
    console.error("Whitelist frissítési hiba:", err);
    res.status(500).json({ error: 'Hiba a whitelist frissítésekor.' });
  }
});

module.exports = router;
