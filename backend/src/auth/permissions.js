/**
 * Who can do what in a workspace (F10). Every route checks an action here
 * through `requirePermission`, never a role directly, so a fourth role can be
 * added later by adding one entry (Open Decisions, option C, 2026-11-04).
 *
 * Owner: runs the business and is the final approver; the only one who publishes.
 * Editor: drafts and submits posts for approval; can't publish.
 * Viewer: read-only.
 */
const ROLES = ["owner", "editor", "viewer"];

const ALL = ["owner", "editor", "viewer"];
const WRITERS = ["owner", "editor"];
const OWNER = ["owner"];

const PERMISSIONS = {
  "workspace.read": ALL,
  "workspace.manage": OWNER, // rename, archive, notification budget
  "members.read": ALL,
  "members.manage": OWNER, // invite, change role, remove

  "profile.update": WRITERS,
  "website.connect": WRITERS,
  "ai.use": WRITERS,
  "opportunity.respond": WRITERS,

  "post.read": ALL,
  "post.write": WRITERS, // create, edit, generate, repurpose
  "post.submit": WRITERS,
  "post.review": OWNER, // approve, request changes, reject
  "post.publish": OWNER,
  "post.delete": OWNER,
};

const ACTIONS = Object.keys(PERMISSIONS);

function can(role, action) {
  const allowed = PERMISSIONS[action];
  if (!allowed) throw new Error(`Unknown permission: ${action}`);
  return allowed.includes(role);
}

/** Every action the role may take, e.g. for the frontend to show or hide buttons. */
function permissionsFor(role) {
  return ACTIONS.filter((action) => can(role, action));
}

/** A plain reason for a refusal, shown to the person who was refused. */
function refusalMessage(action) {
  const allowed = PERMISSIONS[action];
  if (allowed.length === 1 && allowed[0] === "owner") return "Only the business owner can do this.";
  if (!allowed.includes("viewer")) return "Viewers can look but not make changes. Ask the owner for editor access.";
  return "You don't have access to do this.";
}

module.exports = { ROLES, PERMISSIONS, ACTIONS, can, permissionsFor, refusalMessage };
