const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const mongoose = require('mongoose');

// --- 1. Összes felhasználó lekérése ÉLŐ LuckPerms szinkronnal ---
router.get('/users', auth, admin, async (req, res) => {
  try {
    // Weboldal felhasználóinak lekérése (jelszó nélkül)
    const webUsers = await User.find().select('-password').lean();
    
    // Csatlakozunk a LuckPerms 'users' kollekciójához (a kép alapján ez a neve nálad)
    // Fontos: a LuckPerms a 'valyrian' vagy 'minecraft' adatbázisba ment
    const lpCollection = mongoose.connection.db.collection('users');

    // Összefésüljük a weboldalas adatokat a játékbeli élő rangokkal
    const usersWithLiveRank = await Promise.all(webUsers.map(async (user) => {
      // LuckPerms kisbetűvel tárolja a neveket a 'name' mezőben
      const lpData = await lpCollection.findOne({ name: user.username.toLowerCase() });
      
      return {
        ...user,
        // Ha van találat az LP táblában, az ottani 'primaryGroup'-ot mutatjuk,
        // különben marad a weboldal saját adatbázisában tárolt rangja.
        rank: lpData ? lpData.primaryGroup : user.rank 
      };
    }));

    res.json(usersWithLiveRank);
  } catch (err) {
    console.error("Szinkronizációs hiba az admin panelen:", err);
    res.status(500).json({ error: 'Hiba történt a felhasználók betöltésekor.' });
  }
});

// --- 2. Rang frissítése az adatbázisban ---
router.put('/users/:id/rank', auth, admin, async (req, res) => {
  try {
    const { rank } = req.body;
    // Frissítjük a weboldal saját adatbázisában is a biztonság kedvéért
    await User.findByIdAndUpdate(req.params.id, { rank });
    res.json({ message: 'Rang sikeresen frissítve az adatbázisban!' });
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
