const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// A webes felhasználói modell
const User = mongoose.model('User'); 

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

        // 4. VÁLASZ KÜLDÉSE - Összehangolva a Frontend elvárásaival
        res.json({
            // Minecraft statok
            kills: totalKills,
            deaths: totalDeaths,
            wins: totalWins,
            kd: totalDeaths === 0 && totalKills > 0 ? "∞" : kdCalc,
            coins: mcData ? (mcData.coins || 0) : 0,
            
            // Webes profil adatok
            // Ha az adatbázisban véletlen 'kiemeltp' maradt volna, itt javítjuk 'kiemeltplus'-ra
            rank: webUser ? (webUser.rank === 'kiemeltp' ? 'kiemeltplus' : webUser.rank) : 'player',
            bio: webUser ? webUser.bio : 'Ennek a játékosnak nincs weboldalas profilja.',
            
            // JAVÍTVA: A kulcs neve most már 'whitelistStatus', ahogy az adatbázisban van!
            whitelistStatus: webUser ? webUser.whitelistStatus : 'none',
            
            activity: webUser ? webUser.activity : []
        });

    } catch (err) {
        console.error("Hiba a stats lekérésekor:", err);
        res.status(500).json({ error: "Szerver hiba." });
    }
});

module.exports = router;
