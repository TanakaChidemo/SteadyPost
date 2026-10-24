const crypto = require("crypto");
const { z } = require("zod");
const workspaceModel = require("../models/workspace.model");
const membershipModel = require("../models/membership.model");
const businessProfileModel = require("../models/businessProfile.model");
const notificationSettingsModel = require("../models/notificationSettings.model");
const userModel = require("../models/user.model");
const { profileFieldsSchema } = require("../validation/businessProfile");

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["editor", "viewer"]).default("editor"),
});

async function list(req, res) {
  const memberships = await membershipModel.listUserWorkspaces(req.user.id);
  const workspaceIds = memberships.map((m) => m.workspaceId);
  const workspaces = await workspaceModel.find({ _id: { $in: workspaceIds } });
  const profiles = await businessProfileModel.find({ workspaceId: { $in: workspaceIds } });

  const enriched = workspaces.map((ws) => {
    const wsId = ws.id || ws._id;
    const mem = memberships.find((m) => m.workspaceId === wsId);
    const prof = profiles.find((p) => p.workspaceId === wsId);
    return {
      ...ws,
      role: mem?.role || "viewer",
      membershipId: mem?.id || mem?._id,
      isCurrent: (req.user.activeWorkspaceId || req.workspaceId) === wsId,
      businessType: prof?.businessType || "",
      websiteUrl: prof?.websiteUrl || "",
      tone: prof?.tone || [],
      onboardingComplete: businessProfileModel.isOnboardingComplete(prof),
    };
  });

  return res.json({ items: enriched });
}

async function create(req, res) {
  const parsed = profileFieldsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }

  const {
    name,
    businessType,
    websiteUrl = "",
    offer = "",
    audience = "",
    location,
    tone = ["professional"],
    goals = ["brand_awareness"],
    activeChannels = [],
    onboardingCompleted,
  } = parsed.data;

  const profileName = name || businessType || "New Business Profile";

  const workspace = await workspaceModel.create({
    name: profileName,
    ownerId: req.user.id,
    status: "active",
  });

  const membership = await membershipModel.create({
    workspaceId: workspace.id,
    userId: req.user.id,
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });

  const profile = await businessProfileModel.create({
    workspaceId: workspace.id,
    businessType: businessType || profileName,
    websiteUrl,
    offer,
    audience,
    location,
    tone,
    goals,
    activeChannels,
    onboardingCompletedAt: onboardingCompleted ? new Date() : null,
  });

  await notificationSettingsModel.create({
    workspaceId: workspace.id,
    dailyCap: 5,
    channels: { telegram: false, email: true, inApp: true },
  });

  await userModel.setActiveWorkspace(req.user.id, workspace.id);

  return res.status(201).json({
    workspace: {
      ...workspace,
      businessType: profile.businessType,
      role: "owner",
    },
    membership,
    profile,
  });
}

async function getById(req, res) {
  const ws = await workspaceModel.findById(req.params.id);
  if (!ws) return res.status(404).json({ error: "Workspace not found" });

  const membership = await membershipModel.findByUserAndWorkspace(req.user.id, ws.id);
  if (!membership) return res.status(403).json({ error: "Access denied" });

  const profile = await businessProfileModel.findByWorkspaceId(ws.id);
  const settings = await notificationSettingsModel.findByWorkspaceId(ws.id);

  return res.json({
    workspace: ws,
    role: membership.role,
    profile,
    notificationSettings: settings,
  });
}

async function update(req, res) {
  const { name } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Name is required" });
  }

  const updated = await workspaceModel.updateById(req.workspaceId, { name: name.trim() });
  return res.json(updated);
}

async function switchWorkspace(req, res) {
  const targetWorkspaceId = req.params.id;
  const membership = await membershipModel.findByUserAndWorkspace(req.user.id, targetWorkspaceId);

  if (!membership) {
    return res.status(403).json({ error: "You are not a member of this workspace" });
  }

  await userModel.setActiveWorkspace(req.user.id, targetWorkspaceId);
  const workspace = await workspaceModel.findById(targetWorkspaceId);

  return res.json({
    message: "Active workspace updated",
    activeWorkspaceId: targetWorkspaceId,
    workspace,
    role: membership.role,
  });
}

async function listMembers(req, res) {
  const members = await membershipModel.listWorkspaceMembers(req.workspaceId);
  return res.json({ items: members });
}

async function inviteMember(req, res) {
  const parsed = inviteMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
  }

  const { email, role } = parsed.data;

  // Check if existing user with email
  const existingUser = await userModel.findByEmail(email);
  if (existingUser) {
    const existingMem = await membershipModel.findByUserAndWorkspace(existingUser.id, req.workspaceId);
    if (existingMem) {
      return res.status(409).json({ error: "User is already a member of this workspace" });
    }
  }

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const membership = await membershipModel.create({
    workspaceId: req.workspaceId,
    userId: existingUser?.id || null,
    invitedEmail: email.toLowerCase(),
    role,
    status: "invited",
    invitedBy: req.user.id,
    inviteToken,
    inviteExpiresAt: expiresAt,
  });

  return res.status(201).json({
    membership,
    inviteLink: `/invitations/accept?token=${inviteToken}`,
  });
}

async function acceptInvitation(req, res) {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Invite token is required" });

  const membership = await membershipModel.findOne({
    inviteToken: token,
    status: "invited",
    inviteExpiresAt: { $gt: new Date() },
  });

  if (!membership) {
    return res.status(400).json({ error: "Invalid or expired invitation token" });
  }

  const updated = await membershipModel.updateById(membership.id, {
    userId: req.user.id,
    status: "active",
    inviteToken: null,
    inviteExpiresAt: null,
    joinedAt: new Date(),
  });

  await userModel.setActiveWorkspace(req.user.id, membership.workspaceId);

  return res.json({
    message: "Invitation accepted",
    membership: updated,
  });
}

async function removeMember(req, res) {
  const memberId = req.params.memberId;
  const targetMem = await membershipModel.findById(memberId);

  if (!targetMem || targetMem.workspaceId !== req.workspaceId) {
    return res.status(404).json({ error: "Membership not found" });
  }

  if (targetMem.role === "owner") {
    return res.status(400).json({ error: "Cannot remove workspace owner" });
  }

  await membershipModel.updateById(memberId, { status: "removed" });
  return res.status(204).send();
}

module.exports = {
  list,
  create,
  getById,
  update,
  switchWorkspace,
  listMembers,
  inviteMember,
  acceptInvitation,
  removeMember,
};
