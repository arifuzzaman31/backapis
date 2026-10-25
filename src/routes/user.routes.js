const express = require('express');
const { protect } = require('../middleware/auth');
const { getMe } = require('../controllers/user.controller');
const router = express.Router();

router.get('/me', protect, getMe);

module.exports = router;
