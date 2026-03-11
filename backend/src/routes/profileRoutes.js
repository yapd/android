const express = require('express');
const router = express.Router();
const { listProfiles, getProfile } = require('../controllers/profileController');

router.get('/',     listProfiles);
router.get('/:id',  getProfile);

module.exports = router;
