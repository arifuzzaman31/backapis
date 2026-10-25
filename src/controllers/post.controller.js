const mongoose = require('mongoose');
const Post = require('../models/Post');
const User = require('../models/User');
const { parsePagination, paginated } = require('../utils/pagination');

exports.create = async (req, res) => {
  const post = await Post.create({ author: req.user._id, title: req.body.title, body: req.body.body });
  res.status(201).json({ post });
};

exports.listAll = async (req, res) => {           // public feed, IXSCAN { createdAt:-1 }
  const { page, limit, skip } = parsePagination(req.query);
  const [total, data] = await Promise.all([
    Post.countDocuments({}),
    Post.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('author', 'name email').lean(),
  ]);
  const totalPages = Math.ceil(total / limit);
  res.json({ data, pagination: { page, limit, total, totalPages: totalPages || 1, hasNextPage: page < totalPages } });
};

exports.update = async (req, res) => {
  const update = {};
  if (req.body.title !== undefined) update.title = req.body.title;
  if (req.body.body !== undefined) update.body = req.body.body;
  const post = await Post.findOneAndUpdate(
    { _id: req.params.id, author: req.user._id },
    update,
    { new: true, runValidators: true }
  ).lean();
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ post });
};

exports.remove = async (req, res) => {
  const post = await Post.findOneAndDelete({ _id: req.params.id, author: req.user._id }).lean();
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.status(204).end();
};

// Scenario 2
exports.postsByAuthor = async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid user id' });

  const [result] = await User.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(userId) } },
    { $lookup: {
        from: 'posts',
        localField: '_id',
        foreignField: 'author',
        as: 'posts',
    } },
    { $project: { name: 1, email: 1, posts: 1 } },
  ]);

  if (!result) return res.status(404).json({ error: 'User not found' });
  res.json({ data: result });
};
