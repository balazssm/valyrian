const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const mongoose = require('mongoose');
const { Rcon } = require('rcon-client');

// ─────────────────────────────────────────────
// RCON FÜGGVÉNY (A szerver közvetlen irányításához)
// ─────────────────────────────────────────────
async function applyMinecraftRank(username, rank) {
  try {
    const rcon = await Rcon.connect({
      host: "37.27.100.83", // A szervered fix IP-je
      port: 25575,
      password: process.env.MC_RCON_PASSWORD
    });

    // A parancs elküldése (pl: lp user artemisfx parent set admin)
    const response = await rcon.send(`lp user ${username} parent set ${rank}`);
    console.log(`[RCON SUCCESS] Felhasználó: ${username}, Rang: ${rank}, Válasz: ${response}`);

    await rcon.end();
    return { success: true, response };
  } catch (err) {
    console.error("[RCON ERROR] Hiba történt:", err.message);
    return { success: false, error: err.message };
  }
}

// ── 1. Összes felhasználó lekérése ÉLŐ LuckPerms szinkronnal ──
router.get('/users', auth, admin, async (req, res) => {
  try {
    const webUsers = await User.find().select('-password').lean();
    
    // Átváltunk a 'minecraft' adatbázisra a rangok lekéréséhez
    const lpDatabase = mongoose.connection.useDb('minecraft');
    const lpCollection = lpDatabase.collection('users');

    const usersWithLiveRank = await Promise.all(webUsers.map(async (user) => {
      // LuckPerms-ben a név kisbetűvel van tárolva
      const lpData = await lpCollection.findOne({ name: user.username.toLowerCase() });
      
      return {
        ...user,
        // Ha van találat az LP adatbázisban, azt mutatjuk, különben a webes rangot
        rank: lpData ? lpData.primaryGroup : user.rank 
      };
    }));

    res.json(usersWithLiveRank);
  } catch (err) {
    console.error("Szinkronizációs hiba az admin panelen:", err);
    res.status(500).json({ error: 'Hiba történt a felhasználók betöltésekor.' });
  }
});

// ── 2. Rang frissítése ÉLŐBEN (Weboldal + Minecraft) ──
router.put('/users/:id/rank', auth, admin, async (req, res) => {
  try {
    let { rank } = req.body;
    
    // KERESÉS: Megnézzük ki a delikvens
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található!' });

    // RANG JAVÍTÁS: A LuckPerms kisbetűket vár, és 'default'-ot 'player' helyett
    let mcRank = rank.toLowerCase(); 
    if (mcRank === 'player') mcRank = 'default';

    // A. Mentés a weboldal saját adatbázisába (valyrian)
    user.rank = rank;
    await user.save();

    // B. Parancs küldése a Minecraft szervernek
    const rconResult = await applyMinecraftRank(user.username, mcRank);

    res.json({ 
      success: true, 
      message: `Rang sikeresen frissítve erre: ${mcRank}`, 
      rcon: rconResult 
    });
  } catch (err) {
    console.error("Rang frissítési hiba:", err);
    res.status(500).json({ error: 'Hiba történt a mentés során.' });
  }
});

// ── 3. Whitelist állapot frissítése ──
router.put('/users/:id/whitelist', auth, admin, async (req, res) => {
  try {
    const { whitelistStatus } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { whitelistStatus }, { new: true });

    if (!user) return res.status(404).json({ error: 'Nincs meg a felhasználó' });

    // Ha 'approved', akkor RCON-on keresztül hozzáadjuk a szerver whitelistjéhez is
    if (whitelistStatus === 'approved') {
      try {
        const rcon = await Rcon.connect({
          host: "37.27.100.83",
          port: 25575,
          password: process.env.MC_RCON_PASSWORD
        });
        await rcon.send(`whitelist add ${user.username}`);
        await rcon.end();
        console.log(`[WHITELIST] ${user.username} hozzáadva a szerveren is.`);
      } catch (e) {
        console.error("Whitelist RCON hiba:", e.message);
      }
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: 'Hiba a whitelist frissítésekor.' });
  }
});

module.exports = router;
