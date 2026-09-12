const socialAccountModel = require("../models/socialAccount.model");

async function list(req, res) {
  const items = await socialAccountModel.list(req.user.id);
  return res.json({ items });
}

async function link(req, res) {
  const { platform, displayName, handle } = req.body;
  if (!platform) return res.status(400).json({ error: "Platform is required" });

  const extId = handle || `${platform}_${Date.now()}`;
  const name = displayName || `${platform.toUpperCase()} Account (@${extId})`;

  const account = await socialAccountModel.create({
    ownerId: req.user.id,
    platform,
    externalAccountId: extId,
    displayName: name,
  });

  return res.status(201).json(account);
}

async function unlink(req, res) {
  const result = await socialAccountModel.deleteOne({ _id: req.params.id, ownerId: req.user.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: "Social account not found" });

  return res.status(204).send();
}

module.exports = { list, link, unlink };
