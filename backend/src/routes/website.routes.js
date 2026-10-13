const express = require("express");
const rateLimit = require("express-rate-limit");
const websiteController = require("../controllers/website.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Each preview makes an outbound request on the user's behalf, so cap it
// well below the app-wide limit.
const previewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/preview", previewLimiter, websiteController.preview);

module.exports = router;
