const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
// A webes felhasználói modell
const User = mongoose.model('User'); 

// Élő rang lekérése LuckPerms adatbázisból
async function getLiveRank(username, fallbackRank) {
    try {
        const lpDatabase = mongoose.connection.useDb('minecraft');
        const lpCollection = lpDatabase.collection('users');
        const lpData = await lpCollection.findOne({ name: username.toLowerCase() });
        return lpData ? lpData.primaryGroup : fallbackRank;
    } catch (err) {
        console.error("Hiba a rang lekérésekor:", err);
        return fallbackRank;
    }
}

router.get('/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        // 1. ADATOK LEKÉRÉSE A NEPTUNE-BÓL (Minecraft statisztikák)
        const neptuneDb = mongoose.connection.useDb('neptune');
        const mcData = await neptuneDb.collection('playerData').findOne({ 
            username: { $regex: new RegExp(`^${username}$`, 'i') } 
        });
        // 2. ADATOK LEKÉRÉSE A WEB ADATBÁZISBÓL (Profil infók)
        const webUser = await User.findOne({ 
            username: { $regex: new RegExp(`^${username}$`, 'i') } 
        });
        if (!mcData && !webUser) {
            return res.status(404).json({ error: "Játékos nem található." });
        }
        // 3. STATISZTIKÁK ÖSSZESÍTÉSE
        let totalKills = 0;
        let totalDeaths = 0;
        let totalWins = 0;
        if (mcData && mcData.kitData) {
            for (const kitName in mcData.kitData) {
                const kit = mcData.kitData[kitName];
                if (kit && typeof kit === 'object') {
                    totalKills += (kit.KILLS || 0);
                    totalDeaths += (kit.DEATHS || 0);
                    
                    if (kit.WINS) {
                        totalWins += kit.WINS;
                    } else if (kit.customPersistentData && kit.customPersistentData.WINS) {
                        totalWins += kit.customPersistentData.WINS;
                    }
                }
            }
        }
        const kdCalc = totalDeaths === 0 ? totalKills.toFixed(2) : (totalKills / totalDeaths).toFixed(2);

        // 4. ÉLSŐ RANG LEKÉRÉSE (ugyanúgy mint auth.js-ben)
        const savedRank = webUser ? (webUser.rank === 'kiemeltp' ? 'kiemeltplus' : webUser.rank) : 'player';
        const liveRank = await getLiveRank(username, savedRank);

        // 5. VÁLASZ KÜLDÉSE
        res.json({
            // Minecraft statok
            kills: totalKills,
            deaths: totalDeaths,
            wins: totalWins,
            kd: totalDeaths === 0 && totalKills > 0 ? "∞" : kdCalc,
            coins: mcData ? (mcData.coins || 0) : 0,
            
            // Webes profil adatok
            rank: liveRank,
            bio: webUser ? webUser.bio : 'Ennek a játékosnak nincs weboldalas profilja.',
            whitelistStatus: webUser ? webUser.whitelistStatus : 'none',
            activity: webUser ? webUser.activity : []
        });
    } catch (err) {
        console.error("Hiba a stats lekérésekor:", err);
        res.status(500).json({ error: "Szerver hiba." });
    }
});
module.exports = router;
