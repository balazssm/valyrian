/**
 * Valyrian – Vásárlási route (KÉTIRÁNYÚ WEBHOOK: Leadás + Elfogadás)
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
// Discord Webhook Függvény (Többféle státuszhoz)
// ─────────────────────────────────────────────
async function sendDiscordWebhook(order, type = "APPROVED") {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const roleID = "1486777961452539964"; 
    
    // Üzenet testreszabása a státusz alapján
    let title = "💰 Sikeres Tranzakció";
    let content = `<@&${roleID}> 🔔 **ÚJ BEFIZETÉS ELFOGADVA!**`;
    let color = 15105570; // Narancs

    if (type === "NEW") {
        title = "🛒 Új rendelés érkezett (Függőben)";
        content = `<@&${roleID}> ⚠️ **VALAKI VÁSÁROLT! ELLENŐRIZD AZ ADMIN PANET!**`;
        color = 3447003; // Kék
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
                { name: "Állapot", value: type === "NEW" ? "🟡 Ellenőrzésre vár" : "🟢 Kiosztva", inline: true },
                { name: "Rendelés ID", value: `\`${order.orderId}\`` }
            ],
            footer: { text: "Valyrian Store - Automata Értesítés" },
            timestamp: new Date()
        }]
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("Discord hiba:", err.message);
    }
}

// ─────────────────────────────────────────────
// Minecraft RCON
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

// ── [GET] /api/purchase/orders ──
router.get('/orders', auth, admin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Hiba' });
  }
});

// ── [POST] /api/purchase/:type (ÚJ, NÖVEKVŐ SORSZÁMMAL) ──
router.post('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { username, item, priceHuf, paymentRef, rankValue } = req.body;

    // 1. Sorszám növelése és lekérése az adatbázisból
    const counter = await Counter.findOneAndUpdate(
      { id: "order_id" },       // Megkeressük az order_id nevű számlálót
      { $inc: { seq: 1 } },     // Megnöveljük 1-gyel
      { new: true, upsert: true } // Ha nincs még ilyen, létrehozza
    );

    // 2. Egyedi szöveges ID összeállítása (VAL-1, VAL-2, stb.)
    const orderId = `VAL-${counter.seq}`;

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

    // Webhook küldése
    await sendDiscordWebhook(order, "NEW");

    res.status(201).json({ success: true, orderId });
  } catch (err) {
    console.error("Hiba:", err);
    res.status(500).json({ error: 'Hiba a rendelés mentésekor.' });
  }
});

// ── [PUT] /api/purchase/:id/approve (ADMIN ELFOGADJA) ──
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
      
      await User.findOneAndUpdate(
        { username: order.username },
        { $set: { rank: order.rankValue } }
      );
    }

    if (order.itemType === 'coins') {
        const amount = parseInt(order.item) || 0;
        await User.findOneAndUpdate(
            { username: order.username },
            { $inc: { "stats.coins": amount } }
        );
    }

    // --- WEBHOOK KÜLDÉSE (ELFOGADVA) ---
    await sendDiscordWebhook(order, "APPROVED");

    res.json({ success: true, rcon: rconResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── [PUT] /api/purchase/:id/reject ──
router.put('/:id/reject', auth, admin, async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { status: 'rejected' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Hiba' });
  }
});

module.exports = router;
