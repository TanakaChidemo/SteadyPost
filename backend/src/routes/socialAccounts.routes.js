const express = require("express");
const controller = require("../controllers/socialAccounts.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.get("/", controller.list);
router.post("/", requirePermission("accounts.manage"), controller.link);
router.delete("/:id", requirePermission("accounts.manage"), controller.unlink);

module.exports = router;
