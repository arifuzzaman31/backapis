const mongoose = require('mongoose');
const User = require('../models/User');
const { parsePagination, paginated } = require('../utils/pagination');

exports.listUsers = async (req, res) => {         // IXSCAN { createdAt:-1 }
  res.json(await paginated(User, {}, { createdAt: -1 }, parsePagination(req.query)));
};

exports.createUser = async (req, res) => {        // admins may set role
  const { name, email, password, role, interests } = req.body;
  const user = await User.create({ name, email, password, role, interests });
  const publicUser = user.toObject ? user.toObject() : user;
  delete publicUser.password;
  res.status(201).json({ user: publicUser });
};

exports.getUser = async (req, res) => {           // _id index
  const user = await User.findById(req.params.id).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  delete user.password;
  res.json({ user });
};

exports.updateUser = async (req, res) => {        // _id index
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { name, email, role, interests, password } = req.body;
  if (name      !== undefined) user.name = name;
  if (email     !== undefined) user.email = email;
  if (role      !== undefined) user.role = role;
  if (interests !== undefined) user.interests = interests;
  if (password) user.password = password;         // re-hashed by pre('save')
  await user.save();
  const obj = user.toObject ? user.toObject() : user;
  delete obj.password;
  res.json({ user: obj });
};

exports.deleteUser = async (req, res) => {        // _id index + cascade reuses owner/author indexes
  const Note = require('../models/Note');
  const Post = require('../models/Post');
  const user = await User.findByIdAndDelete(req.params.id).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  await Promise.all([Note.deleteMany({ owner: user._id }), Post.deleteMany({ author: user._id })]);
  res.status(204).end();
};

// ── Scenario 1 ──
exports.groupedByInterest = async (req, res) => {
  const groups = await User.aggregate([
    { $project: { name: 1, interests: 1 } },
    { $unwind: '$interests' },
    { $group: {
        _id: '$interests',
        count: { $sum: 1 },
        users: { $push: { _id: '$_id', name: '$name' } },
    } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  res.json({ data: groups });
};
