const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (u) =>
  jwt.sign({ sub: u._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

const publicUser = ({ _id, name, email, role, interests, createdAt }) =>
  ({ _id, name, email, role, interests, createdAt });

exports.register = async (req, res) => {
  const { name, email, password, interests } = req.body;   // no `role` — no self-promotion
  const user = await User.create({ name, email, password, interests });
  res.status(201).json({ user: publicUser(user) });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = await User.findOne({ email }).select('+password');   // email unique index
  const ok = user && (await user.comparePassword(password));
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });  // same message either way

  res.json({ token: signToken(user), user: publicUser(user) });
};