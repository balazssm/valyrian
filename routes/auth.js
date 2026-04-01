const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'Hiányzó mezők.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'A jelszó legalább 6 karakter legyen.' });

    const exists = await User.findOne({
      $or: [
        { username: new RegExp(`^${username}$`, 'i') },
        { email: email.toLowerCase() }
      ]
    });
    if (exists) {
      if (exists.username.toLowerCase() === username.toLowerCase())
        return res.status(400).json({ error: 'Ez a Minecraft nick már foglalt.' });
      return res.status(400).json({ error: 'Ez az e-mail már regisztrálva van.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = new User({
      username,
      email,
      password: hash,
      activity: [{ icon: '🎉', text: `<strong>${username}</strong> csatlakozott a Valyrianhoz` }]
    });
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: safeUser(user) });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Hiányzó mezők.' });

    const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user) return res.status(400).json({ error: 'Hibás felhasználónév vagy jelszó.' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Hibás felhasználónév vagy jelszó.' });

    // lastSeen frissítés
    user.lastSeen = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: safeUser(user) });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

// GET /api/auth/me  (token alapján visszaadja a fresh adatokat)
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található.' });
    res.json(safeUser(user));
  } catch(e) {
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

function safeUser(u) {
  return {
    id: u._id,
    username: u.username,
    email: u.email,
    rank: u.rank,
    bio: u.bio,
    whitelist: u.whitelist,
    stats: u.stats,
    activity: u.activity.slice(-10).reverse(),
    lastSeen: u.lastSeen,
    createdAt: u.createdAt
  };
}

module.exports = router;
