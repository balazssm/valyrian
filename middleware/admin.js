const User = require('../models/User');

module.exports = async function(req, res, next) {
  try {
    // Megkeressük a júzert az adatbázisban az ID alapján, amit az auth middleware tett be
    const user = await User.findById(req.user.id);
    
    if (user && (user.rank === 'admin' || user.rank === 'owner')) {
      req.user = user; // Frissítjük a req.user-t a teljes adatbázis objektummal
      next();
    } else {
      res.status(403).json({ error: 'Hozzáférés megtagadva. Admin jog szükséges.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Szerver hiba az ellenőrzéskor.' });
  }
};
