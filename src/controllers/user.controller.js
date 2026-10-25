const User = require('../models/User');
const { protect } = require('../middleware/auth');

exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
};
