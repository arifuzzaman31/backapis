const express = require('express');
const { protect } = require('../middleware/auth');
const postCtrl = require('../controllers/post.controller');
const router = express.Router();

router.post('/', protect, postCtrl.create);
router.get('/', postCtrl.listAll);
router.get('/user/:userId', postCtrl.postsByAuthor);
router.patch('/:id', protect, postCtrl.update);
router.delete('/:id', protect, postCtrl.remove);

module.exports = router;
