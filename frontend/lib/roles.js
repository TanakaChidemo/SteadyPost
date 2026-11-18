// The three workspace roles (F10), in the words the app uses for them.
export const ROLE_INFO = {
  owner: { label: "Owner", blurb: "Runs the business and approves posts" },
  editor: { label: "Editor", blurb: "Writes posts and sends them for approval" },
  viewer: { label: "Viewer", blurb: "Can see posts but not change them" },
};

export const TEAM_ROLES = ["editor", "viewer"];

/** Whether the current workspace lets the user take `action` (see backend auth/permissions.js). */
export const can = (workspace, action) => Boolean(workspace?.permissions?.includes(action));
