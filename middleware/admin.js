module.exports = function(req, res, next) {
  // Feltételezzük, hogy az 'auth' middleware már lefutott és beállította a req.user-t
  if (req.user && (req.user.rank === 'admin' || req.user.rank === 'owner')) {
    next();
  } else {
    res.status(403).json({ error: 'Hozzáférés megtagadva. Admin jog szükséges.' });
  }
};
