/**
 * Valyrian – Vásárlási route (SORSZÁMOZOTT ID + DISCORD FIX)
 */

require('dotenv').config();
const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Rcon } = require('rcon-client');

const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// ─────────────────────────────────────────────
// MODELLEK DEFINIÁLÁSA (Order + Counter)
// ─────────────────────────────────────────────

// Counter a sorszámozáshoz
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

// Rendelés modell
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
// DISCORD WEBHOOK (ROLE PING: 1486777961452539964)
// ─────────────────────────────────────────────
async function sendDiscordWebhook(order, type = "APPROVED") {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const roleID = "1486777961452539964"; 
    let title = "💰 Sikeres Tranzakció";
    let content = `<@&${roleID}> 🔔 **ÚJ BEFIZETÉS ELFOGADVA!**`;
    let color = 15105570;

    if (type === "NEW") {
        title = "🛒 Új rendelés érkezett";
        content = `<@&${roleID}> ⚠️ **VALAKI VÁSÁROLT!**`;
        color = 3447003;
    }

    const payload = {
        content: content,
        embeds: [{
            title: title,
            color: color,
            fields: [
                { name: "Játékos", value: `**${order.username}**`, inline: true },
                { name: "Termék", value: order.item, inline: true },
                { name: "Összeg", value: `${order.priceHuf} Ft`, inline: true },
                { name: "Rendelés ID", value: `\`${order.orderId}\`` }
            ],
            footer: { text: "Valyrian Store" },
            timestamp: new Date()
        }]
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) { console.error("Discord hiba:", err.message); }
}

// ─────────────────────────────────────────────
// MINECRAFT RCON
// ─────────────────────────────────────────────
async function applyMinecraftRank(username, rank) {
  try {
    const rcon = await Rcon.connect({
      host: "37.27.100.83",
      port: 25575,
      password: process.env.MC_RCON_PASSWORD
    });
    const response = await rcon.send(`lp user ${username} parent set ${rank}`);
    await rcon.end();
    return { success: true, response };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── [POST] /api/purchase/:type (ÚJ RENDELÉS) ──
router.post('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { username, item, priceHuf, paymentRef, rankValue } = req.body;

    let orderId;
    try {
      // Megpróbáljuk növelni a sorszámot
      const counter = await Counter.findOneAndUpdate(
        { _id: "order_id" }, 
        { $inc: { seq: 1 } }, 
        { new: true, upsert: true }
      );
      orderId = `VAL-${counter.seq}`;
    } catch (counterError) {
      // Ha a counter valamiért meghal, generálunk egy randomot, hogy ne akadjon el a vásárlás
      orderId = 'VAL-' + Date.now().toString().slice(-4);
    }

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

    await sendDiscordWebhook(order, "NEW");
    res.status(201).json({ success: true, orderId });

  } catch (err) {
    console.error("Végzetes hiba:", err);
    res.status(500).json({ error: 'Szerver hiba a menteskor.' });
  }
});

// ── [PUT] /api/purchase/:id/approve (ELFOGADÁS) ──
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
    if (order.itemType === 'rank' && order.rankValue) {
      let mcRank = order.rankValue.toLowerCase();
      if (mcRank === 'kiemeltp') mcRank = 'kiemeltplus';
      if (mcRank === 'player') mcRank = 'default';

      rconResult = await applyMinecraftRank(order.username, mcRank);
      await User.findOneAndUpdate({ username: order.username }, { $set: { rank: order.rankValue } });
    }

    if (order.itemType === 'coins') {
        const amount = parseInt(order.item) || 0;
        await User.findOneAndUpdate({ username: order.username }, { $inc: { "stats.coins": amount } });
    }

    await sendDiscordWebhook(order, "APPROVED");
    res.json({ success: true, rcon: rconResult });

  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ADMIN LISTA ÉS ELUTASÍTÁS ──
router.get('/orders', auth, admin, async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.json(orders);
});

router.put('/:id/reject', auth, admin, async (req, res) => {
  await Order.findByIdAndUpdate(req.params.id, { status: 'rejected' });
  res.json({ success: true });
});

module.exports = router;
