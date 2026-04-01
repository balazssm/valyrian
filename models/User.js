const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  // Rang — a Minecraft plugin írja, vagy admin állítja be
  rank: {
    type: String,
    enum: ['owner', 'admin', 'mod', 'dev', 'vip', 'player'],
    default: 'player'
  },
  bio: {
    type: String,
    default: '',
    maxlength: 200
  },
  // Whitelist
  whitelist: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none'
  },
  // Minecraft statisztikák — a plugin frissíti
  stats: {
    kills:    { type: Number, default: 0 },
    deaths:   { type: Number, default: 0 },
    wins:     { type: Number, default: 0 },
    playtime: { type: Number, default: 0 }, // percben
    coins:    { type: Number, default: 0 },
    streak:   { type: Number, default: 0 }
  },
  // Aktivitás log (max 20 bejegyzés)
  activity: [{
    icon:    { type: String },
    text:    { type: String },
    time:    { type: Date, default: Date.now }
  }],
  lastSeen: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);
