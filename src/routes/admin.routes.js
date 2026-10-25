const express = require('express');
const { protect, requireAdmin } = require('../middleware/auth');
const adminCtrl = require('../controllers/admin.controller');
const noteCtrl = require('../controllers/note.controller');
const router = express.Router();

router.use(protect, requireAdmin);

// grouped-by-interest before :id
router.get('/users/grouped-by-interest', adminCtrl.groupedByInterest);
router.post('/users', adminCtrl.createUser);
router.get('/users', adminCtrl.listUsers);
router.get('/users/:id', adminCtrl.getUser);
router.patch('/users/:id', adminCtrl.updateUser);
router.delete('/users/:id', adminCtrl.deleteUser);

router.get('/notes', noteCtrl.listAll);

module.exports = router;
