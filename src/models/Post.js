const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:  { type: String, required: true, trim: true, maxlength: 200 },
  body:   { type: String, default: '' },
}, { timestamps: true });

// Scenario 2 $lookup: foreignField 'author' equality probes from users → posts.
postSchema.index({ author: 1 });
// Public feed: find({}).sort({ createdAt: -1 }).skip().limit()
postSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);