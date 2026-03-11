/**
 * Instance Routes
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/instanceController');

router.get('/',                    ctrl.listInstances);
router.post('/',                   ctrl.createInstance);
router.get('/:id',                 ctrl.getInstance);
router.post('/:id/start',          ctrl.startInstance);
router.post('/:id/stop',           ctrl.stopInstance);
router.post('/:id/reboot',         ctrl.rebootInstance);
router.post('/:id/wipe',           ctrl.wipeInstance);
router.delete('/:id',              ctrl.deleteInstance);
router.patch('/:id/gps',           ctrl.setGPS);
router.patch('/:id/battery',       ctrl.setBattery);
router.patch('/:id/gsm',           ctrl.setGSM);
router.post('/:id/sms',            ctrl.sendSMS);

module.exports = router;
