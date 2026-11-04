const express = require("express");
const controller = require("../controllers/workspace.controller");
const { requireAuth } = require("../middleware/auth");
const { resolveWorkspace } = require("../middleware/workspaceContext");
const { requirePermission } = require("../middleware/requirePermission");

const router = express.Router();
router.use(requireAuth);

router.get("/", controller.list);
router.post("/", controller.create);
router.post("/switch/:id", controller.switchWorkspace);
router.post("/invitations/accept", controller.acceptInvitation);

router.get("/current", resolveWorkspace, (req, res) => {
  return controller.getById(req, res);
});

router.put("/current", resolveWorkspace, requirePermission("workspace.manage"), controller.update);
router.post("/current/archive", resolveWorkspace, requirePermission("workspace.manage"), controller.archive);
router.get("/current/members", resolveWorkspace, requirePermission("members.read"), controller.listMembers);
router.post("/current/invitations", resolveWorkspace, requirePermission("members.manage"), controller.inviteMember);
router.delete(
  "/current/members/:memberId",
  resolveWorkspace,
  requirePermission("members.manage"),
  controller.removeMember
);

router.get("/:id", controller.getById);

module.exports = router;
