const jwt = require('jsonwebtoken');
const User = require('../models/user'); // Be kell húznunk a modellt!

module.exports = async function(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Nincs token.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Itt a trükk: Megkeressük a júzert az adatbázisban a tokenben lévő ID alapján
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ error: 'Felhasználó nem található.' });
    }

    // Most már a req.user-ben benne lesz a RANG is, mert az adatbázisból jön!
    req.user = user; 
    next();
  } catch(e) {
    res.status(401).json({ error: 'Érvénytelen token.' });
  }
};
