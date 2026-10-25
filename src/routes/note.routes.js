const express = require('express');
const { protect } = require('../middleware/auth');
const noteCtrl = require('../controllers/note.controller');
const router = express.Router();

router.use(protect);
router.post('/', noteCtrl.create);
router.get('/', noteCtrl.listMine);
router.get('/:id', noteCtrl.getOne);
router.patch('/:id', noteCtrl.update);
router.delete('/:id', noteCtrl.remove);

module.exports = router;
