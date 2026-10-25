const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true, maxlength: 100 },
  email:     { type: String, required: true, trim: true, lowercase: true,
               match: [/^\S+@\S+\.\S+$/, 'Invalid email address'] },
  password:  { type: String, required: true, minlength: 8, select: false },
  role:      { type: String, enum: ['user', 'admin'], default: 'user' },
  interests: { type: [String], default: [],
               set: (arr) => [...new Set(arr.map(s => String(s).trim().toLowerCase()))] },
}, { timestamps: true });

// ── Indexes (deliberate & minimal) ──────────────────────────────
// Login: findOne({ email })  +  duplicate-email guard on insert.
userSchema.index({ email: 1 }, { unique: true });
// Admin list view: find({}).sort({ createdAt: -1 }).skip().limit()
userSchema.index({ createdAt: -1 });
// NOT indexed: role (never a predicate), interests (Scenario 1 is a
// predicate-free $unwind+$group — see README).

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);