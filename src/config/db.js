const mongoose = require('mongoose');

module.exports.connectDB = async (uri) => {
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
};