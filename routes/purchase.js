/**
 * Valyrian – Vásárlási route
 * 
 * POST /api/purchase/rank   → rang vásárlás
 * POST /api/purchase/coins  → coin csomag vásárlás
 * POST /api/purchase/boost  → boost vásárlás
 * GET  /api/purchase/verify/:orderId → rendelés ellenőrzés (admin)
 *
 * Folyamat:
 *   1. Frontend küld: { username, item, priceHuf, paymentRef }
 *   2. Backend elment egy "pending" rendelést a DB-be
 *   3. Discord webhook → #vásárlások csatorna (automatikus értesítés)
 *   4. Discord webhook → #ticket csatorna (automatikus ticket + admin ping)
 *   5. Admin jóváhagyja a fizetést → PUT /api/purchase/:id/approve
 *   6. Backend rangot ad a játékosnak (DB + Minecraft RCON vagy plugin API)
 */

require('dotenv').config();
const router  = require('express').Router();
const crypto  = require('crypto');
const User    = require('../models/User');
const auth    = require('../middleware/auth');
const admin   = require('../middleware/admin');

// ── Discord webhook küldő segédfüggvény ─────────────────────────────────────
async function sendDiscordWebhook(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Discord webhook hiba: ${res.status} – ${txt}`);
  }
}

// ── Rang → Minecraft permission group mapping ────────────────────────────────
const RANK_MC_GROUP = {
  vip:      'vip',
  kiemelt:  'kiemelt',
  kiemeltp: 'kiemeltp'
};

// ── Rang hozzáadása a Minecraft szerveren plugin API-n keresztül ─────────────
//    Ha nincs plugin (pl. dev módban), csak a DB-t frissítjük.
async function applyMinecraftRank(username, rank) {
  const pluginUrl = process.env.MC_PLUGIN_URL; // pl. http://mc-server:4567
  if (!pluginUrl) {
    console.warn('[MC] MC_PLUGIN_URL nincs beállítva – csak DB frissítés történik');
    return { applied: false, reason: 'no_plugin_url' };
  }

  const res = await fetch(`${pluginUrl}/api/mc/rank`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-plugin-key': process.env.PLUGIN_SECRET
    },
    body: JSON.stringify({ username, rank })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Plugin API hiba: ${res.status} – ${txt}`);
  }
  return await res.json();
}

// ── Egyszerű rendelés-tároló (mongoose-ba mentjük a User mellé) ─────────────
// Külön Order model helyett beágyazott dokument a könnyebb integráció miatt.
// Ha nagy forgalomra számítasz, hozz létre külön Order mongoose modellt!

const mongoose = require('mongoose');
const orderSchema = new mongoose.Schema({
  orderId:    { type: String, unique: true, index: true },
  username:   { type: String, required: true },
  item:       { type: String, required: true },  // pl. "VIP rang"
  itemType:   { type: String, enum: ['rank','coins','boost'], required: true },
  rankValue:  { type: String, default: null },    // ha rang, melyik
  priceHuf:   { type: Number, required: true },
  paymentRef: { type: String, default: '' },      // utalás megjegyzése, Revolut ID stb.
  status:     { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  discordTicketMsgId: { type: String, default: null },
  approvedBy: { type: String, default: null },
  approvedAt: { type: Date,   default: null },
  createdAt:  { type: Date,   default: Date.now }
});
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// ── Helper: Discord embed szín ───────────────────────────────────────────────
const RANK_COLOR = { vip: 0xf472b6, kiemelt: 0x34d399, kiemeltp: 0xfb923c };
const TYPE_COLOR  = { rank: 0x7c3aed, coins: 0xfbbf24, boost: 0x0ea5e9 };

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/purchase/:type   (type = rank | coins | boost)
// Body: { username, item, priceHuf, paymentRef, rankValue? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:type(rank|coins|boost)', async (req, res) => {
  try {
    const { type } = req.params;
    const { username, item, priceHuf, paymentRef, rankValue } = req.body;

    // ── Validáció ────────────────────────────────────────────────────────────
    if (!username || typeof username !== 'string' || username.length < 3) {
      return res.status(400).json({ error: 'Érvénytelen Minecraft nick.' });
    }
    if (!item || !priceHuf) {
      return res.status(400).json({ error: 'Hiányzó rendelési adatok.' });
    }

    // ── Rendelés ID generálás ─────────────────────────────────────────────────
    const orderId = 'VAL-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    // ── DB mentés ─────────────────────────────────────────────────────────────
    const order = await Order.create({
      orderId,
      username: username.trim(),
      item,
      itemType:  type,
      rankValue: rankValue || null,
      priceHuf:  Number(priceHuf),
      paymentRef: paymentRef || '',
      status:    'pending'
    });

    // ── Discord: #vásárlások csatorna embed ───────────────────────────────────
    const purchaseWebhook = process.env.DISCORD_PURCHASE_WEBHOOK;
    const ticketWebhook   = process.env.DISCORD_TICKET_WEBHOOK;
    const adminRoleId     = process.env.DISCORD_ADMIN_ROLE_ID || '';

    const embedColor = rankValue ? (RANK_COLOR[rankValue] || 0x7c3aed) : TYPE_COLOR[type] || 0x0ea5e9;

    const purchaseEmbed = {
      embeds: [{
        color: embedColor,
        author: {
          name: '🛒  Új vásárlási igény érkezett',
          icon_url: `https://visage.surgeplay.com/head/64/${username}`
        },
        title: item,
        fields: [
          { name: '👤 Játékos',    value: `\`${username}\``,  inline: true },
          { name: '💰 Összeg',     value: `**${priceHuf} Ft**`, inline: true },
          { name: '🆔 Rendelés',   value: `\`${orderId}\``,   inline: false },
          { name: '📋 Utalás ref', value: paymentRef ? `\`${paymentRef}\`` : '_nem megadott_', inline: false }
        ],
        thumbnail: { url: `https://visage.surgeplay.com/head/128/${username}` },
        footer: { text: 'Valyrian Store  •  Jóváhagyás: /api/purchase/' + order._id + '/approve' },
        timestamp: new Date().toISOString()
      }]
    };

    // ── Discord: #ticket csatorna üzenet (admin ping + részletes) ────────────
    const ticketEmbed = {
      content: adminRoleId ? `<@&${adminRoleId}> 📦 Új vásárlási ticket — kérlek ellenőrizd az átutalást!` : '📦 Új vásárlási ticket',
      embeds: [{
        color: embedColor,
        title: `🎫  Ticket #${orderId}`,
        description: [
          `**Játékos:** \`${username}\``,
          `**Termék:** ${item}`,
          `**Ár:** ${priceHuf} Ft`,
          `**Utalás referencia:** ${paymentRef || '_nem adta meg_'}`,
          '',
          '**Teendők:**',
          '1. Ellenőrizd a bankszámlát / Revolutot',
          '2. Ha az összeg beérkezett: jóváhagyás (`/api/purchase/' + order._id + '/approve`)',
          '3. A rang automatikusan kiosztásra kerül ✅'
        ].join('\n'),
        thumbnail: { url: `https://visage.surgeplay.com/head/128/${username}` },
        footer: { text: 'Valyrian Store Automatikus Rendszer' },
        timestamp: new Date().toISOString()
      }]
    };

    const webhookErrors = [];

    if (purchaseWebhook) {
      try { await sendDiscordWebhook(purchaseWebhook, purchaseEmbed); }
      catch (e) { webhookErrors.push('purchase webhook: ' + e.message); }
    } else {
      webhookErrors.push('DISCORD_PURCHASE_WEBHOOK nincs beállítva');
    }

    if (ticketWebhook) {
      try { await sendDiscordWebhook(ticketWebhook, ticketEmbed); }
      catch (e) { webhookErrors.push('ticket webhook: ' + e.message); }
    } else {
      webhookErrors.push('DISCORD_TICKET_WEBHOOK nincs beállítva');
    }

    // ── Válasz a frontendnek ──────────────────────────────────────────────────
    return res.status(201).json({
      success:  true,
      orderId,
      message:  'Rendelésed rögzítve! Adminjaink értesítve lettek Discord-on. Általában 1–24 órán belül feldolgozzák.',
      warnings: webhookErrors.length ? webhookErrors : undefined
    });

  } catch (err) {
    console.error('[purchase]', err);
    return res.status(500).json({ error: 'Szerver hiba a rendelés rögzítésekor.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/purchase/:id/approve   — Admin jóváhagyja a rendelést
// Automatikusan rang ad a játékosnak DB-ben + Minecraft plugin API-n
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/approve', auth, admin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Rendelés nem található.' });
    if (order.status === 'approved') return res.status(400).json({ error: 'Már jóváhagyva.' });

    order.status     = 'approved';
    order.approvedBy = req.user?.username || 'admin';
    order.approvedAt = new Date();
    await order.save();

    const results = { db: false, mc: null };

    // ── Ha rang vásárlás: DB + Minecraft frissítés ───────────────────────────
    if (order.itemType === 'rank' && order.rankValue) {
      const rankMap = { vip: 'vip', kiemelt: 'kiemelt', kiemeltp: 'kiemeltp' };
      const mcRank  = rankMap[order.rankValue] || order.rankValue;

      // DB frissítés
      const user = await User.findOneAndUpdate(
        { username: new RegExp(`^${order.username}$`, 'i') },
        { $set: { rank: mcRank } },
        { new: true }
      );
      results.db = !!user;

      // Minecraft plugin API
      try {
        results.mc = await applyMinecraftRank(order.username, mcRank);
      } catch (mcErr) {
        results.mc = { error: mcErr.message };
        console.error('[MC rank apply]', mcErr.message);
      }

      // Aktivitás log
      if (user) {
        const rankEmoji = { vip: '💜', kiemelt: '💚', kiemeltp: '🧡' };
        await User.findOneAndUpdate(
          { username: new RegExp(`^${order.username}$`, 'i') },
          { $push: { activity: {
            $each: [{ icon: rankEmoji[mcRank] || '⭐', text: `${order.item} sikeresen aktiválva!`, time: new Date() }],
            $slice: -20
          }}}
        );
      }
    }

    // ── Ha coin vásárlás: coin hozzáadás ──────────────────────────────────────
    if (order.itemType === 'coins') {
      const coinAmounts = {
        '500 Valyrian Coin': 500,
        '1 200 Valyrian Coin (+200 bónusz)': 1200,
        '3 000 Valyrian Coin (+500 bónusz)': 3000,
        '7 500 Valyrian Coin (+1 500 bónusz)': 7500
      };
      const amount = coinAmounts[order.item] || 0;
      if (amount > 0) {
        await User.findOneAndUpdate(
          { username: new RegExp(`^${order.username}$`, 'i') },
          { $inc: { 'stats.coins': amount } }
        );
        results.db = true;
      }
    }

    // ── Discord értesítés: jóváhagyva ─────────────────────────────────────────
    const purchaseWebhook = process.env.DISCORD_PURCHASE_WEBHOOK;
    if (purchaseWebhook) {
      try {
        await sendDiscordWebhook(purchaseWebhook, {
          embeds: [{
            color: 0x10b981,
            title: '✅  Rendelés jóváhagyva',
            fields: [
              { name: '👤 Játékos', value: `\`${order.username}\``, inline: true },
              { name: '🎁 Termék',  value: order.item, inline: true },
              { name: '🆔 ID',      value: `\`${order.orderId}\``, inline: false },
              { name: '🛡️ DB',     value: results.db ? '✅ Frissítve' : '❌ Nem található', inline: true },
              { name: '⚔️ Minecraft', value: results.mc?.error ? `❌ ${results.mc.error}` : (results.mc ? '✅ Rang adva' : '⚠️ Plugin URL hiányzik'), inline: true }
            ],
            footer: { text: `Jóváhagyta: ${order.approvedBy}` },
            timestamp: new Date().toISOString()
          }]
        });
      } catch (e) { /* webhook hiba nem állítja meg a flow-t */ }
    }

    return res.json({ success: true, orderId: order.orderId, results });
  } catch (err) {
    console.error('[purchase approve]', err);
    return res.status(500).json({ error: 'Szerver hiba jóváhagyáskor.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/purchase/:id/reject   — Admin elutasítja
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/reject', auth, admin, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', approvedBy: req.user?.username || 'admin', approvedAt: new Date() },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Rendelés nem található.' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Szerver hiba.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/purchase/orders   — Admin: összes rendelés listája
// ─────────────────────────────────────────────────────────────────────────────
router.get('/orders', auth, admin, async (req, res) => {
  try {
    const status = req.query.status; // ?status=pending
    const filter = status ? { status } : {};
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(200);
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ error: 'Szerver hiba.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/purchase/verify/:orderId   — Rendelés státusz ellenőrzés (publikus)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/verify/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId })
      .select('orderId username item status createdAt approvedAt');
    if (!order) return res.status(404).json({ error: 'Rendelés nem található.' });
    return res.json(order);
  } catch (err) {
    return res.status(500).json({ error: 'Szerver hiba.' });
  }
});

module.exports = router;
module.exports.Order = Order;
