const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const mongoose = require('mongoose');
const { Rcon } = require('rcon-client'); // Ugyanaz a kliens, mint a boltban

// ─────────────────────────────────────────────
// RCON FÜGGVÉNY (A boltodból másolva)
// ─────────────────────────────────────────────
async function applyMinecraftRank(username, rank) {
  try {
    const rcon = await Rcon.connect({
      host: "37.27.100.83", // A szervered fix IP-je
      port: 25575,
      password: process.env.MC_RCON_PASSWORD
    });

    const response = await rcon.send(`lp user ${username} parent set ${rank}`);
    console.log("Admin RCON válasz:", response);

    await rcon.end();
    return { success: true, response };
  } catch (err) {
    console.error("Admin RCON hiba:", err.message);
    return { success: false, error: err.message };
  }
}

// ── 1. Összes felhasználó lekérése ÉLŐ LuckPerms szinkronnal ──
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
    console.error("Szinkronizációs hiba:", err);
    res.status(500).json({ error: 'Hiba történt a felhasználók betöltésekor.' });
  }
});

// ── 2. Rang frissítése ÉLŐBEN (Weboldal + Minecraft) ──
router.put('/users/:id/rank', auth, admin, async (req, res) => {
  try {
    const { rank } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'Felhasználó nem található!' });
    }

    // A. Frissítés a weboldal adatbázisában
    user.rank = rank;
    await user.save();

    // B. Frissítés a játékban RCON-nal
    const rconResult = await applyMinecraftRank(user.username, rank);

    res.json({ 
      success: true, 
      message: 'Rang frissítve mindenhol!', 
      rcon: rconResult 
    });
  } catch (err) {
    console.error("Rang frissítési hiba:", err);
    res.status(500).json({ error: 'Hiba a frissítéskor.' });
  }
});

// ── 3. Whitelist állapot frissítése ──
router.put('/users/:id/whitelist', auth, admin, async (req, res) => {
  try {
    const { whitelistStatus } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { whitelistStatus }, { new: true });

    if (!user) return res.status(404).json({ error: 'Nincs meg' });

    // Ha elfogadják, beírjuk a szerveren is
    if (whitelistStatus === 'approved') {
        const rcon = await Rcon.connect({
            host: "37.27.100.83",
            port: 25575,
            password: process.env.MC_RCON_PASSWORD
        });
        await rcon.send(`whitelist add ${user.username}`);
        await rcon.end();
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: 'Hiba' });
  }
});

module.exports = router;
