const express = require("express");
const controller = require("../controllers/guardrails.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.post("/check-draft", controller.checkDraft);
router.post("/check-trend", controller.checkTrend);
router.post("/check-image", controller.checkImage);

module.exports = router;
