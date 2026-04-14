const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

router.get('/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        // Csatlakozás a neptune adatbázishoz és a playerData kollekcióhoz
        const db = mongoose.connection.useDb('neptune');
        const collection = db.collection('playerData');

        const data = await collection.findOne({ 
            username: { $regex: new RegExp(`^${username}$`, 'i') } 
        });

        if (!data) {
            return res.status(404).json({ error: "Játékos nem található." });
        }

        let totalKills = 0;
        let totalDeaths = 0;
        let totalWins = 0;

        if (data.kitData) {
            // Végigmegyünk az összes játékmódon (Bedwars, Sumo, stb.)
            for (const kitName in data.kitData) {
                const kit = data.kitData[kitName];
                
                if (kit && typeof kit === 'object') {
                    // Ölések és Halálok hozzáadása (Nagybetűvel!)
                    totalKills += (kit.KILLS || 0);
                    totalDeaths += (kit.DEATHS || 0);
                    
                    // Győzelmek keresése: megnézzük a customPersistentData-ban is
                    if (kit.WINS) {
                        totalWins += kit.WINS;
                    } else if (kit.customPersistentData && kit.customPersistentData.WINS) {
                        totalWins += kit.customPersistentData.WINS;
                    }
                }
            }
        }

        // K/D számítás (0 halál esetén is működik)
        const kdValue = totalDeaths === 0 ? totalKills.toFixed(2) : (totalKills / totalDeaths).toFixed(2);

        // Válasz küldése a frontendnek
        res.json({
            kills: totalKills,
            deaths: totalDeaths,
            wins: totalWins,
            kd: totalDeaths === 0 && totalKills > 0 ? "∞" : kdValue,
            coins: data.coins || 0
        });

    } catch (err) {
        console.error("Hiba a statisztikák feldolgozásakor:", err);
        res.status(500).json({ error: "Szerver hiba." });
    }
});

module.exports = router;
