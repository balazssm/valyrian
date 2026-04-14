const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Feltételezzük, hogy a User modelled már létezik
// Ha más a fájlneve, igazítsd hozzá (pl. ../models/User)
const User = mongoose.model('User'); 

router.get('/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        // 1. ADATOK LEKÉRÉSE A NEPTUNE-BÓL (Minecraft statisztikák)
        const db = mongoose.connection.useDb('neptune');
        const mcData = await db.collection('playerData').findOne({ 
            username: { $regex: new RegExp(`^${username}$`, 'i') } 
        });

        // 2. ADATOK LEKÉRÉSE A WEB ADATBÁZISBÓL (Rang és Bio)
        const webUser = await User.findOne({ 
            username: { $regex: new RegExp(`^${username}$`, 'i') } 
        });

        // Ha egyik helyen sem létezik a játékos
        if (!mcData && !webUser) {
            return res.status(404).json({ error: "Játékos nem található." });
        }

        // 3. STATISZTIKÁK ÖSSZESÍTÉSE (Minden kit/játékmód alapján)
        let totalKills = 0;
        let totalDeaths = 0;
        let totalWins = 0;

        if (mcData && mcData.kitData) {
            for (const kitName in mcData.kitData) {
                const kit = mcData.kitData[kitName];
                if (kit && typeof kit === 'object') {
                    totalKills += (kit.KILLS || 0);
                    totalDeaths += (kit.DEATHS || 0);
                    
                    // Wins kezelése: vagy közvetlenül a kitben, vagy a customPersistentData-ban
                    if (kit.WINS) {
                        totalWins += kit.WINS;
                    } else if (kit.customPersistentData && kit.customPersistentData.WINS) {
                        totalWins += kit.customPersistentData.WINS;
                    }
                }
            }
        }

        // 4. K/D SZÁMÍTÁS
        const kdValue = totalDeaths === 0 ? totalKills.toFixed(2) : (totalKills / totalDeaths).toFixed(2);

        // 5. VÁLASZ KÜLDÉSE
        // Ha van webUser, küldjük a rangját és bióját, ha nincs, alapértelmezett értéket adunk
        res.json({
            kills: totalKills,
            deaths: totalDeaths,
            wins: totalWins,
            kd: totalDeaths === 0 && totalKills > 0 ? "∞" : kdValue,
            coins: mcData ? (mcData.coins || 0) : 0,
            rank: webUser ? webUser.rank : 'player',
            bio: webUser ? webUser.bio : 'Ennek a játékosnak még nincs weboldalas profilja.'
        });

    } catch (err) {
        console.error("Hiba a /api/stats útvonalon:", err);
        res.status(500).json({ error: "Szerver hiba történt a statisztikák lekérésekor." });
    }
});

module.exports = router;
