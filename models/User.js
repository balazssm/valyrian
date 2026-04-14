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
    enum: ['owner', 'admin', 'mod', 'dev', 'vip', 'kiemelt', 'kiemeltplus', 'player', 'default'],
    default: 'player'
  },
  bio: {
    type: String,
    default: '',
    maxlength: 200
  },
  // Whitelist állapot kezelése (Egységesítve az admin felülettel)
  whitelistStatus: {
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
  // Aktivitás log (max 20 bejegyzés tárolására)
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

// Automatikus limit az aktivitás loghoz
// Modern async megoldás - így NEM dob 'next is not a function' hibát
userSchema.pre('save', async function() {
  // Csak akkor vágjuk le, ha változott az aktivitás és túl hosszú
  if (this.isModified('activity') && this.activity.length > 20) {
    this.activity = this.activity.slice(-20);
  }
});

module.exports = mongoose.model('User', userSchema);
