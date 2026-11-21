const socialAccountModel = require("../models/socialAccount.model");

// Page/IG access tokens are sensitive Graph API credentials — never ship them
// to the browser. The frontend only needs to know whether an account is a
// real Meta connection or a sandbox/demo one.
function toClientAccount({ accessToken, ...rest }) {
  const isGbp = rest.platform === "gbp" || rest.platform === "google_business" || rest.platform === "google";
  const state = rest.verificationState || (rest.isVerified === false ? "UNVERIFIED" : "VERIFIED");
  const verified = isGbp ? state === "VERIFIED" : (rest.isVerified !== false && state !== "UNVERIFIED");
  return {
    ...rest,
    isLive: Boolean(accessToken),
    isVerified: verified,
    verificationState: state,
  };
}

async function list(req, res) {
  const scopeId = req.workspaceId || req.user.id;
  const items = await socialAccountModel.list(scopeId);
  return res.json({ items: items.map(toClientAccount) });
}

async function link(req, res) {
  const { platform, displayName, handle, isVerified, verificationState } = req.body;
  if (!platform) return res.status(400).json({ error: "Platform is required" });

  const extId = handle || `${platform}_${Date.now()}`;
  const name = displayName || `${platform.toUpperCase()} Account (@${extId})`;

  const isGbp = platform === "gbp" || platform === "google_business" || platform === "google";
  const effectiveState = verificationState || (isVerified === false ? "UNVERIFIED" : "VERIFIED");
  const effectiveVerified = isGbp ? effectiveState === "VERIFIED" : (isVerified !== false && effectiveState !== "UNVERIFIED");

  const account = await socialAccountModel.create({
    workspaceId: req.workspaceId || null,
    ownerId: req.user.id,
    platform,
    externalAccountId: extId,
    displayName: name,
    linkedBy: req.user.id,
    isVerified: effectiveVerified,
    verificationState: effectiveState,
  });

  return res.status(201).json(toClientAccount(account));
}

async function unlink(req, res) {
  const filter = req.workspaceId
    ? { _id: req.params.id, $or: [{ workspaceId: req.workspaceId }, { ownerId: req.user.id }] }
    : { _id: req.params.id, ownerId: req.user.id };

  const result = await socialAccountModel.deleteOne(filter);
  if (result.deletedCount === 0) return res.status(404).json({ error: "Social account not found" });

  return res.status(204).send();
}

module.exports = { list, link, unlink };
