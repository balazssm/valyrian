const express = require('express');
const router = express.Router();
const User = require('../models/user');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Összes felhasználó lekérése
router.get('/users', auth, admin, async (req, res) => {
  try {
    const users = await User.find().select('-password'); // Jelszó ne látsszon!
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Hiba a lekéréskor.' });
  }
});

// Rang frissítése
router.put('/users/:id/rank', auth, admin, async (req, res) => {
  try {
    const { rank } = req.body;
    await User.findByIdAndUpdate(req.params.id, { rank });
    res.json({ message: 'Rang sikeresen frissítve!' });
  } catch (err) {
    res.status(500).json({ error: 'Hiba a frissítéskor.' });
  }
});

module.exports = router;
