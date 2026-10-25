const mongoose = require('mongoose');

const cached = global.__mongoose || (global.__mongoose = { conn: null, promise: null });

module.exports.connectDB = async (uri) => {
  if (!uri) throw new Error('MONGO_URI is not set');

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 10000,
        bufferCommands: false,
      })
      .then((m) => {
        console.log(`MongoDB connected: ${m.connection.name}`);
        return m.connection;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
};
