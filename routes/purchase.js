/**
 * Valyrian – Vásárlási route (TELJESEN JAVÍTVA)
 */

require('dotenv').config();
const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// ─────────────────────────────────────────────
// Order schema & Model
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
// Segédfüggvények (Discord & MC)
// ─────────────────────────────────────────────
async function sendDiscordWebhook(webhookUrl, payload) {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("Webhook hiba:", err.message);
  }
}

async function applyMinecraftRank(username, rank) {
  const pluginUrl = process.env.MC_PLUGIN_URL;
  if (!pluginUrl) return { applied: false, reason: 'no_plugin_url' };

  const res = await fetch(`${pluginUrl}/api/mc/rank`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-plugin-key': process.env.PLUGIN_SECRET
    },
    body: JSON.stringify({ username, rank })
  });
  return await res.json();
}

const TYPE_COLOR = { rank: 0x7c3aed, coins: 0xfbbf24, boost: 0x0ea5e9 };

// ─────────────────────────────────────────────
// [GET] /api/purchase/orders (AZ ADMIN PANELNEK)
// ─────────────────────────────────────────────
router.get('/orders', auth, admin, async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};
    if (status) filter.status = status;

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Hiba a rendelések lekérésekor' });
  }
});

// ─────────────────────────────────────────────
// [POST] /api/purchase/:type (VÁSÁRLÁS LÉTREHOZÁSA)
// ─────────────────────────────────────────────
router.post('/:type', async (req, res) => {
  try {
    const allowed = ['rank', 'coins', 'boost'];
    const { type } = req.params;

    if (!allowed.includes(type)) return res.status(400).json({ error: 'Érvénytelen típus' });

    const { username, item, priceHuf, paymentRef, rankValue } = req.body;
    if (!username || !item || !priceHuf) return res.status(400).json({ error: 'Hiányzó adatok' });

    const orderId = 'VAL-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const order = await Order.create({
      orderId,
      username: username.trim(),
      item,
      itemType: type,
      rankValue: rankValue || null,
      priceHuf: Number(priceHuf),
      paymentRef: paymentRef || '',
      status: 'pending'
    });

    // Discord Webhook küldése
    const webhook = process.env.DISCORD_PURCHASE_WEBHOOK;
    if (webhook) {
      sendDiscordWebhook(webhook, {
        embeds: [{
          title: '🛒 Új vásárlás érkezett',
          color: TYPE_COLOR[type],
          fields: [
            { name: 'User', value: username, inline: true },
            { name: 'Item', value: item, inline: true },
            { name: 'Price', value: `${priceHuf} Ft`, inline: true },
            { name: 'ID', value: orderId }
          ],
          timestamp: new Date().toISOString()
        }]
      });
    }

    res.status(201).json({ success: true, orderId });
  } catch (err) {
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

// ─────────────────────────────────────────────
// [PUT] /api/purchase/:id/approve (ELFOGADÁS)
// ─────────────────────────────────────────────
router.put('/:id/approve', auth, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Rendelés nem található' });
    if (order.status !== 'pending') return res.status(400).json({ error: 'Már kezelve van' });

    order.status = 'approved';
    order.approvedBy = req.user?.username || 'admin';
    order.approvedAt = new Date();
    await order.save();

    let mcStatus = null;

    // Ha rangot vett, adjuk meg neki MC-n és az adatbázisban is
    if (order.itemType === 'rank' && order.rankValue) {
      mcStatus = await applyMinecraftRank(order.username, order.rankValue);
      await User.findOneAndUpdate(
        { username: order.username },
        { $set: { rank: order.rankValue } }
      );
    }

    // Ha coint vett, írjuk jóvá
    if (order.itemType === 'coins') {
      const coinMap = { '500 Valyrian Coin': 500, '1200': 1200, '3000': 3000, '7500': 7500 };
      const amount = coinMap[order.item] || parseInt(order.item) || 0;
      if (amount > 0) {
        await User.findOneAndUpdate(
          { username: order.username },
          { $inc: { 'stats.coins': amount } }
        );
      }
    }

    res.json({ success: true, mc: mcStatus });
  } catch (err) {
    res.status(500).json({ error: 'Hiba a jóváhagyás során' });
  }
});

// ─────────────────────────────────────────────
// [PUT] /api/purchase/:id/reject (ELUTASÍTÁS)
// ─────────────────────────────────────────────
router.put('/:id/reject', auth, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Nem található' });

    order.status = 'rejected';
    await order.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Hiba az elutasítás során' });
  }
});

// ─────────────────────────────────────────────
// [GET] /api/purchase/verify/:orderId (ELLENŐRZÉS)
// ─────────────────────────────────────────────
router.get('/verify/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Nem található' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

module.exports = router;
