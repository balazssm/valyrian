/**
 * Valyrian – Vásárlási route (RCON + ADMIN FIXED)
 */

require('dotenv').config();
const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Rcon } = require('rcon-client'); // RCON kliens betöltése

const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// ─────────────────────────────────────────────
// Order Schema
// ─────────────────────────────────────────────
const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, index: true },
  username: String,
  item: String,
  itemType: { type: String, enum: ['rank', 'coins', 'boost'] },
  rankValue: String,
  priceHuf: Number,
  paymentRef: String,
  status: { type: String, default: 'pending' },
  approvedBy: String,
  approvedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// ─────────────────────────────────────────────
// Minecraft RCON Függvény
// ─────────────────────────────────────────────
async function applyMinecraftRank(username, rank) {
  try {
    const rcon = await Rcon.connect({
      host: "37.27.100.83", // A szervered fix IP-je
      port: 25575,
      password: process.env.MC_RCON_PASSWORD
    });

    // LuckPerms parancs kiadása
    const response = await rcon.send(`lp user ${username} parent set ${rank}`);
    console.log("RCON válasz:", response);

    await rcon.end();
    return { success: true, response };
  } catch (err) {
    console.error("RCON hiba:", err.message);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────
// [GET] /api/purchase/orders (Admin lista)
// ─────────────────────────────────────────────
router.get('/orders', auth, admin, async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};
    if (status) filter.status = status;
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

// ─────────────────────────────────────────────
// [POST] /api/purchase/:type (Új vásárlás)
// ─────────────────────────────────────────────
router.post('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { username, item, priceHuf, paymentRef, rankValue } = req.body;

    const orderId = 'VAL-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const order = await Order.create({
      orderId,
      username: username.trim(),
      item,
      itemType: type,
      rankValue,
      priceHuf,
      paymentRef,
      status: 'pending'
    });

    res.status(201).json({ success: true, orderId });
  } catch (err) {
    res.status(500).json({ error: 'Hiba' });
  }
});

// ─────────────────────────────────────────────
// [PUT] /api/purchase/:id/approve (ELFOGADÁS + RCON)
// ─────────────────────────────────────────────
router.put('/:id/approve', auth, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Nincs meg' });
    if (order.status !== 'pending') return res.status(400).json({ error: 'Már kezelve' });

    order.status = 'approved';
    order.approvedBy = req.user.username;
    order.approvedAt = new Date();
    await order.save();

    let rconResult = null;

    // Ha rang, akkor küldjük a parancsot a szervernek
    if (order.itemType === 'rank' && order.rankValue) {
      rconResult = await applyMinecraftRank(order.username, order.rankValue);
      
      // Weboldali rang frissítése is
      await User.findOneAndUpdate(
        { username: order.username },
        { $set: { rank: order.rankValue } }
      );
    }

    // Ha coin, írjuk jóvá a weboldalon
    if (order.itemType === 'coins') {
        const amount = parseInt(order.item) || 0;
        await User.findOneAndUpdate(
            { username: order.username },
            { $inc: { "stats.coins": amount } }
        );
    }

    res.json({ success: true, rcon: rconResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// [PUT] /api/purchase/:id/reject (ELUTASÍTÁS)
// ─────────────────────────────────────────────
router.put('/:id/reject', auth, admin, async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { status: 'rejected' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Hiba' });
  }
});

module.exports = router;
