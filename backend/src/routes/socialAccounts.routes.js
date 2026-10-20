const express = require("express");
const controller = require("../controllers/socialAccounts.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");

const router = express.Router();
router.use(requireAuth, resolveWorkspace);

router.get("/", controller.list);
router.post("/", controller.link);
router.delete("/:id", controller.unlink);

module.exports = router;
