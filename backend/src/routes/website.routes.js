const express = require("express");
const rateLimit = require("express-rate-limit");
const websiteController = require("../controllers/website.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requireWorkspaceRole } = require("../middleware/requireWorkspaceRole");

const router = express.Router();
router.use(requireAuth);

// Each preview or connect makes an outbound request on the user's behalf,
// so cap them well below the app-wide limit.
const fetchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/preview", fetchLimiter, websiteController.preview);

router.get("/connection", resolveWorkspace, websiteController.getConnection);
router.put(
  "/connection",
  resolveWorkspace,
  requireWorkspaceRole("owner", "editor"),
  fetchLimiter,
  websiteController.connect
);

module.exports = router;
