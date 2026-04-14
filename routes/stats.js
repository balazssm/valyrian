const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Itt érjük el a Neptune kollekciót. 
// Ha nem 'neptune_users' a neve, írd át arra, ami a Compass-ban van!
const neptuneCollection = mongoose.connection.collection('neptune_users');

router.get('/:username', async (req, res) => {
    try {
        const { username } = req.params;

        // Keresés a Neptune-ban (kis/nagybetű nem számít)
        const data = await neptuneCollection.findOne({ 
            username: { $regex: new RegExp(`^${username}$`, 'i') } 
        });

        if (!data) {
            return res.status(404).json({ error: "Játékos nem található a Neptune-ban" });
        }

        let totalKills = 0;
        let totalDeaths = 0;
        let totalWins = 0;

        // 1. Ölések és Halálok (KitData-ból)
        if (data.kitData) {
            Object.values(data.kitData).forEach(kit => {
                if (typeof kit === 'object' && kit !== null) {
                    totalKills += kit.kills || 0;
                    totalDeaths += kit.deaths || 0;
                }
            });
        }

        // 2. Győzelmek (History-ból)
        if (Array.isArray(data.history)) {
            totalWins = data.history.filter(h => 
                h === "WIN" || (h && h.result === "WIN")
            ).length;
        }

        // 3. K/D számítás
        const kdValue = totalDeaths === 0 ? totalKills : (totalKills / totalDeaths).toFixed(2);

        res.json({
            username: data.username,
            kills: totalKills,
            deaths: totalDeaths,
            wins: totalWins,
            kd: totalDeaths === 0 && totalKills > 0 ? "∞" : kdValue,
            coins: data.coins || 0 
        });

    } catch (err) {
        console.error("Stats hiba:", err);
        res.status(500).json({ error: "Szerver hiba" });
    }
});

module.exports = router;
