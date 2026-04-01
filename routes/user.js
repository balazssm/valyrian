const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const authMW = require('../middleware/auth');

// GET /api/user/profile/:username  (publikus)
router.get('/profile/:username', async (req, res) => {
  try {
    const user = await User.findOne({
      username: new RegExp(`^${req.params.username}$`, 'i')
    }).select('-password -email');
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található.' });
    res.json(user);
  } catch(e) {
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

// PUT /api/user/profile  (saját profil szerkesztése)
router.put('/profile', authMW, async (req, res) => {
  try {
    const { bio, email } = req.body;
    const update = {};
    if (bio !== undefined) update.bio = bio.slice(0, 200);
    if (email) update.email = email.toLowerCase();

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true }
    ).select('-password');
    res.json(user);
  } catch(e) {
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

// PUT /api/user/password
router.put('/password', authMW, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword)
      return res.status(400).json({ error: 'Hiányzó mezők.' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'Az új jelszó legalább 6 karakter legyen.' });

    const user = await User.findById(req.user.id);
    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) return res.status(400).json({ error: 'A jelenlegi jelszó hibás.' });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

module.exports = router;
