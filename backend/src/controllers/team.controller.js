const { z } = require("zod");
const membershipModel = require("../models/membership.model");
const invitationModel = require("../models/invitation.model");
const workspaceModel = require("../models/workspace.model");
const userModel = require("../models/user.model");
const { can } = require("../auth/permissions");
const { firstActiveWorkspaceId } = require("../middleware/workspaceContext");

/**
 * The people on a business's team (F10). Anyone can be added to someone else's
 * business through an invite link, as an editor or a viewer; the owner manages
 * the team, and members can leave.
 */
const TEAM_ROLES = ["editor", "viewer"];

const inviteSchema = z.object({
  role: z.enum(TEAM_ROLES),
  // `email` is accepted from older clients and kept only as the label.
  label: z.string().trim().max(80).optional(),
  email: z.string().trim().max(80).optional(),
});

const changeRoleSchema = z.object({ role: z.enum(TEAM_ROLES) });

const inviteLinkFor = (token) => `/invitations/accept?token=${encodeURIComponent(token)}`;

async function listMembers(req, res) {
  const memberships = await membershipModel.Membership.find({ workspaceId: req.workspaceId, status: "active" })
    .sort({ createdAt: 1 })
    .lean();
  const users = await userModel.User.find({ _id: { $in: memberships.map((m) => m.userId) } }, { name: 1, email: 1 }).lean();
  const byId = new Map(users.map((u) => [u._id, u]));

  const members = memberships.map((m) => ({
    id: m._id,
    role: m.role,
    name: byId.get(m.userId)?.name || "",
    email: byId.get(m.userId)?.email || "",
    joinedAt: m.joinedAt || m.createdAt,
    isYou: m.userId === req.user.id,
  }));

  // Pending invite links are only shown to whoever manages the team.
  const invitations = can(req.membership.role, "members.manage")
    ? (await invitationModel.listPending(req.workspaceId)).map((i) => ({
        id: i.id,
        role: i.role,
        label: i.label,
        expiresAt: i.expiresAt,
      }))
    : [];

  return res.json({ members, invitations });
}

async function invite(req, res) {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Choose whether they'll be an editor or a viewer.", details: parsed.error.issues });
  }
  const { role, label, email } = parsed.data;

  const { invitation, token } = await invitationModel.create({
    workspaceId: req.workspaceId,
    role,
    label: label || email || "",
    createdBy: req.user.id,
  });

  return res.status(201).json({
    invitation: { id: invitation.id, role: invitation.role, label: invitation.label, expiresAt: invitation.expiresAt },
    inviteLink: inviteLinkFor(token),
  });
}

/** What an invite link is for, so the person can see it before joining. */
async function previewInvitation(req, res) {
  const invitation = await invitationModel.findUsable(req.params.token);
  const workspace = invitation && (await workspaceModel.findById(invitation.workspaceId));
  if (!invitation || !workspace || workspace.status === "archived") {
    return res.status(404).json({ error: "This invite link has expired or was already used. Ask for a new one." });
  }

  const owner = await userModel.findById(workspace.ownerId);
  const membership = await membershipModel.findByUserAndWorkspace(req.user.id, workspace.id);
  return res.json({
    workspaceName: workspace.name,
    ownerName: owner?.name || "",
    role: invitation.role,
    alreadyMember: Boolean(membership),
  });
}

async function acceptInvitation(req, res) {
  const token = req.body?.token;
  if (!token) return res.status(400).json({ error: "Invite token is required" });

  const invitation = await invitationModel.findUsable(token);
  if (!invitation) return acceptLegacyInvitation(req, res, token);

  if (!(await workspaceModel.filterActiveIds([invitation.workspaceId])).length) {
    return res.status(400).json({ error: "This business is no longer on SteadyPost." });
  }

  const existing = await membershipModel.Membership.findOne({ workspaceId: invitation.workspaceId, userId: req.user.id }).lean();
  if (existing?.status === "active") {
    return res.status(409).json({ error: "You're already on this team.", workspaceId: invitation.workspaceId });
  }

  // Use the link before adding anyone, so two people racing for one link
  // can't both join.
  if (!(await invitationModel.claim(invitation.id, req.user.id))) {
    return res.status(400).json({ error: "This invite link has expired or was already used. Ask for a new one." });
  }

  const fields = { role: invitation.role, status: "active", joinedAt: new Date(), invitedBy: invitation.createdBy };
  if (existing) {
    // Someone who left or was removed comes back on their old membership.
    await membershipModel.updateById(existing._id, fields);
  } else {
    await membershipModel.create({ workspaceId: invitation.workspaceId, userId: req.user.id, ...fields });
  }
  await userModel.setActiveWorkspace(req.user.id, invitation.workspaceId);

  return res.json({ message: "Invitation accepted", workspaceId: invitation.workspaceId, role: invitation.role });
}

/** Invites made before invite links had their own collection. */
async function acceptLegacyInvitation(req, res, token) {
  const membership = await membershipModel.findOne({
    inviteToken: token,
    status: "invited",
    inviteExpiresAt: { $gt: new Date() },
  });
  if (!membership || !(await workspaceModel.filterActiveIds([membership.workspaceId])).length) {
    return res.status(400).json({ error: "This invite link has expired or was already used. Ask for a new one." });
  }
  if (await membershipModel.findByUserAndWorkspace(req.user.id, membership.workspaceId)) {
    return res.status(409).json({ error: "You're already on this team.", workspaceId: membership.workspaceId });
  }

  await membershipModel.updateById(membership.id, {
    userId: req.user.id,
    status: "active",
    inviteToken: null,
    inviteExpiresAt: null,
    joinedAt: new Date(),
  });
  await userModel.setActiveWorkspace(req.user.id, membership.workspaceId);

  return res.json({ message: "Invitation accepted", workspaceId: membership.workspaceId, role: membership.role });
}

async function findTeamMember(req, res) {
  const member = await membershipModel.findById(req.params.memberId);
  if (!member || member.workspaceId !== req.workspaceId || member.status !== "active") {
    res.status(404).json({ error: "Team member not found" });
    return null;
  }
  if (member.role === "owner") {
    res.status(400).json({ error: "The owner's role can't be changed or removed." });
    return null;
  }
  return member;
}

async function changeRole(req, res) {
  const parsed = changeRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose editor or viewer." });

  const member = await findTeamMember(req, res);
  if (!member) return undefined;

  await membershipModel.updateById(member.id, { role: parsed.data.role });
  return res.json({ id: member.id, role: parsed.data.role });
}

async function removeMember(req, res) {
  const member = await findTeamMember(req, res);
  if (!member) return undefined;

  await membershipModel.updateById(member.id, { status: "removed" });
  return res.status(204).send();
}

async function revokeInvitation(req, res) {
  const revoked = await invitationModel.revoke(req.params.invitationId, req.workspaceId);
  if (!revoked) return res.status(404).json({ error: "Invite not found" });
  return res.status(204).send();
}

/** A team member leaves someone else's business. */
async function leave(req, res) {
  if (req.membership.role === "owner") {
    return res.status(400).json({ error: "Owners can't leave their own business. Archive it instead." });
  }

  await membershipModel.updateById(req.membership.id, { status: "removed" });
  const next = await firstActiveWorkspaceId(req.user.id);
  await userModel.setActiveWorkspace(req.user.id, next);
  return res.json({ activeWorkspaceId: next });
}

module.exports = {
  listMembers,
  invite,
  previewInvitation,
  acceptInvitation,
  changeRole,
  removeMember,
  revokeInvitation,
  leave,
};
