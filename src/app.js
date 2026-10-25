const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./config/db');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use(async (req, res, next) => {
  try {
    await connectDB(process.env.MONGO_URI || process.env.MONGODB_URI);
    next();
  } catch (err) {
    next(err);
  }
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50 });

app.use('/api/auth',  authLimiter, require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/notes', require('./routes/note.routes'));
app.use('/api/posts', require('./routes/post.routes'));
app.use('/api/admin', require('./routes/admin.routes'));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {                 // express@5 forwards rejected async handlers here
  if (err.code === 11000) return res.status(409).json({ error: 'Email already in use' });
  if (err.name === 'ValidationError') return res.status(422).json({ error: err.message });
  if (err.name === 'CastError') return res.status(400).json({ error: 'Malformed id' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
