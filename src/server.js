require('dotenv').config();
const { connectDB } = require('./config/db');
const app = require('./app');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
connectDB(uri)
  .then(() => app.listen(process.env.PORT || 3001, () => console.log('API up')))
  .catch((err) => { console.error(err); process.exit(1); });