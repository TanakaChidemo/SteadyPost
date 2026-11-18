const express = require("express");
const { requireAuth } = require("../middleware/auth");
const approvalLinkService = require("../services/approvalLink.service");
const { ApprovalError } = require("../services/approval.service");

const router = express.Router();
router.use(requireAuth);

// Uses a single-use approval link (F10). It acts on the workspace and post the
// link was sent for, not whichever business the person has open.
router.post("/redeem", async (req, res) => {
  try {
    const result = await approvalLinkService.redeem({ token: req.body?.token, actorId: req.user.id });
    return res.json(result);
  } catch (err) {
    if (err instanceof ApprovalError) return res.status(err.status).json({ error: err.message, code: err.code });
    throw err;
  }
});

module.exports = router;
