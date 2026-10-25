const Note = require('../models/Note');
const { parsePagination, paginated } = require('../utils/pagination');

exports.listMine = async (req, res) => {          // IXSCAN { owner:1, createdAt:-1 }
  res.json(await paginated(Note, { owner: req.user._id }, { createdAt: -1 }, parsePagination(req.query)));
};

exports.listAll = async (req, res) => {           // admin, IXSCAN { createdAt:-1 }
  res.json(await paginated(Note, {}, { createdAt: -1 }, parsePagination(req.query)));
};

exports.create = async (req, res) => {
  const note = await Note.create({ owner: req.user._id, title: req.body.title, body: req.body.body });
  res.status(201).json({ note });
};

exports.getOne = async (req, res) => {            // _id index; owner is a residual filter
  const filter = req.user.role === 'admin'
    ? { _id: req.params.id }                      // "admin can view everyone's notes"
    : { _id: req.params.id, owner: req.user._id };
  const note = await Note.findOne(filter).lean();
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json({ note });
};

exports.update = async (req, res) => {            // owner-scoped for everyone (spec grants
  const update = {};                              // admins VIEW, not EDIT, others' notes)
  if (req.body.title !== undefined) update.title = req.body.title;
  if (req.body.body  !== undefined) update.body  = req.body.body;
  const note = await Note.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id }, update, { new: true, runValidators: true }).lean();
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json({ note });
};

exports.remove = async (req, res) => {
  const note = await Note.findOneAndDelete({ _id: req.params.id, owner: req.user._id }).lean();
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.status(204).end();
};