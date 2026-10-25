const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  body:  { type: String, default: '', maxlength: 10000 },
}, { timestamps: true });

// User's own list: find({ owner }).sort({ createdAt: -1 }).skip().limit()
// ESR: equality on owner + sort on trailing createdAt — one index, no SORT stage.
noteSchema.index({ owner: 1, createdAt: -1 });
// Admin "everyone's notes": find({}).sort({ createdAt: -1 }).skip().limit()
noteSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Note', noteSchema);