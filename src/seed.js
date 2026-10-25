require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User'); const Note = require('./models/Note'); const Post = require('./models/Post');

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(uri);
  await Promise.all([User.deleteMany(), Note.deleteMany(), Post.deleteMany()]);

  const [admin, ana, ben, chloe] = await User.create([
    { name: 'Admin', email: 'admin@notes.dev',  password: 'admin1234', role: 'admin', interests: ['chess', 'ops'] },
    { name: 'Ana',   email: 'ana@notes.dev',    password: 'ana123456', interests: ['chess', 'reading'] },
    { name: 'Ben',   email: 'ben@notes.dev',    password: 'ben123456', interests: ['reading', 'hiking'] },
    { name: 'Chloe', email: 'chloe@notes.dev',  password: 'chloe1234', interests: [] },
  ]);
  await Note.create([
    { owner: ana._id, title: 'Ana note 1' }, { owner: ana._id, title: 'Ana note 2' },
    { owner: ben._id, title: 'Ben note 1' },
  ]);
  await Post.create([
    { author: ana._id, title: 'Hello from Ana' }, { author: ana._id, title: 'Ana again' },
    { author: ben._id, title: 'Ben speaks' },
  ]);
  console.log(await User.aggregate([
    { $unwind: '$interests' }, { $group: { _id: '$interests', count: { $sum: 1 } } }, { $sort: { count: -1 } },
  ]));
  await mongoose.disconnect();
})();