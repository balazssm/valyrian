const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const mongoose = require('mongoose');
const sendRconCommand = require('../utils/rcon'); // Itt importáljuk az RCON segédletet

// --- 1. Összes felhasználó lekérése ÉLŐ LuckPerms szinkronnal ---
router.get('/users', auth, admin, async (req, res) => {
  try {
    const webUsers = await User.find().select('-password').lean();
    
    // Átváltunk a 'minecraft' adatbázisra a rangokhoz
    const lpDatabase = mongoose.connection.useDb('minecraft');
    const lpCollection = lpDatabase.collection('users');

    const usersWithLiveRank = await Promise.all(webUsers.map(async (user) => {
      const lpData = await lpCollection.findOne({ name: user.username.toLowerCase() });
      
      return {
        ...user,
        rank: lpData ? lpData.primaryGroup : user.rank 
      };
    }));

    res.json(usersWithLiveRank);
  } catch (err) {
    console.error("Szinkronizációs hiba az admin panelen:", err);
    res.status(500).json({ error: 'Hiba történt a felhasználók betöltésekor.' });
  }
});

// --- 2. Rang frissítése ÉLŐBEN (Weboldal + Minecraft) ---
router.put('/users/:id/rank', auth, admin, async (req, res) => {
  try {
    const { rank } = req.body;
    
    // Megkeressük a felhasználót a weboldal adatbázisában
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Felhasználó nem található!' });
    }

    // A. Frissítés a weboldal adatbázisában (valyrian)
    user.rank = rank;
    await user.save();

    // B. Frissítés a játékban RCON parancson keresztül
    // Parancs: lp user <név> parent set <rang>
    try {
      // Itt küldjük el a tényleges parancsot a szervernek
      const rconResponse = await sendRconCommand(`lp user ${user.username} parent set ${rank}`);
      console.log(`RCON Válasz (${user.username}):`, rconResponse);
    } catch (rconErr) {
      // Ha nem megy a szerver, a webes mentés attól még megmarad
      console.error("RCON hiba! A szerver valószínűleg offline:", rconErr.message);
    }

    res.json({ message: 'Rang sikeresen frissítve a weboldalon és a játékban is!' });
  } catch (err) {
    console.error("Rang frissítési hiba:", err);
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

    // Opcionális: Ha whitelist parancsot is akarsz küldeni a szervernek
    if (whitelistStatus === 'approved') {
        await sendRconCommand(`whitelist add ${user.username}`).catch(e => console.log("Whitelist RCON hiba"));
    }

    res.json({ message: 'Whitelist állapot sikeresen frissítve!', user });
  } catch (err) {
    console.error("Whitelist frissítési hiba:", err);
    res.status(500).json({ error: 'Hiba a whitelist frissítésekor.' });
  }
});

module.exports = router;
