const router = require('express').Router();
const User = require('../models/User');

// Ez az endpoint-et a Minecraft plugin hívja
// Védve egy titkos API kulccsal (PLUGIN_SECRET .env-ben)
function pluginAuth(req, res, next) {
  const key = req.headers['x-plugin-key'];
  if (!key || key !== process.env.PLUGIN_SECRET) {
    return res.status(403).json({ error: 'Tiltott.' });
  }
  next();
}

// POST /api/mc/stats
// Plugin küldi: { username, kills, deaths, wins, playtime, coins, streak }
router.post('/stats', pluginAuth, async (req, res) => {
  try {
    const { username, kills, deaths, wins, playtime, coins, streak } = req.body;
    const update = {};
    if (kills    !== undefined) update['stats.kills']    = kills;
    if (deaths   !== undefined) update['stats.deaths']   = deaths;
    if (wins     !== undefined) update['stats.wins']     = wins;
    if (playtime !== undefined) update['stats.playtime'] = playtime;
    if (coins    !== undefined) update['stats.coins']    = coins;
    if (streak   !== undefined) update['stats.streak']   = streak;
    update.lastSeen = new Date();

    const user = await User.findOneAndUpdate(
      { username: new RegExp(`^${username}$`, 'i') },
      { $set: update },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található.' });
    res.json({ success: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

// POST /api/mc/rank
// Plugin küldi: { username, rank }
router.post('/rank', pluginAuth, async (req, res) => {
  try {
    const { username, rank } = req.body;
    const allowed = ['owner','admin','mod','dev','vip','player'];
    if (!allowed.includes(rank))
      return res.status(400).json({ error: 'Érvénytelen rang.' });

    const user = await User.findOneAndUpdate(
      { username: new RegExp(`^${username}$`, 'i') },
      { $set: { rank } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található.' });
    res.json({ success: true, rank: user.rank });
  } catch(e) {
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

// POST /api/mc/whitelist
// Plugin küldi: { username, status: 'approved'|'pending'|'rejected' }
router.post('/whitelist', pluginAuth, async (req, res) => {
  try {
    const { username, status } = req.body;
    const allowed = ['none','pending','approved','rejected'];
    if (!allowed.includes(status))
      return res.status(400).json({ error: 'Érvénytelen státusz.' });

    const user = await User.findOneAndUpdate(
      { username: new RegExp(`^${username}$`, 'i') },
      { $set: { whitelist: status } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található.' });
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

// POST /api/mc/activity
// Plugin küldi: { username, icon, text }
router.post('/activity', pluginAuth, async (req, res) => {
  try {
    const { username, icon, text } = req.body;
    const entry = { icon: icon||'⚡', text, time: new Date() };

    // Max 20 aktivitás bejegyzés
    await User.findOneAndUpdate(
      { username: new RegExp(`^${username}$`, 'i') },
      {
        $push: { activity: { $each: [entry], $slice: -20 } }
      }
    );
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

// GET /api/mc/leaderboard?type=kills&limit=10
router.get('/leaderboard', async (req, res) => {
  try {
    const type = req.query.type || 'kills';
    const limit = Math.min(parseInt(req.query.limit)||10, 50);
    const allowed = ['kills','deaths','wins','playtime','coins'];
    if (!allowed.includes(type))
      return res.status(400).json({ error: 'Érvénytelen típus.' });

    const users = await User.find({})
      .select(`username rank stats.${type}`)
      .sort({ [`stats.${type}`]: -1 })
      .limit(limit);

    res.json(users.map((u, i) => ({
      pos: i+1,
      username: u.username,
      rank: u.rank,
      value: u.stats[type]
    })));
  } catch(e) {
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

module.exports = router;
