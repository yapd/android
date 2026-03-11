const express = require('express');
const router = express.Router();
const { getSystemMetrics, getAdbDevices } = require('../controllers/systemController');

router.get('/metrics',  getSystemMetrics);
router.get('/devices',  getAdbDevices);

module.exports = router;
