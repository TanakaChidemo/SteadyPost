const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const postModel = require("../src/models/post.model");
const ContentDraft = require("../src/models/contentDraft.model");
const { ROLES, ACTIONS, can } = require("../src/auth/permissions");

jest.setTimeout(60000);

/**
 * F10 (#07) acceptance bar: every role against every action through the real
 * API, aiming for zero forbidden actions allowed. Each request is tagged with
 * the permission it needs; the expected result comes from auth/permissions.js.
 */
describe("Permission matrix", () => {
  let workspace;
  const people = {};
  const userIds = [];

  const newPost = (status = "draft") =>
    postModel.create({
      workspaceId: workspace.id,
      authorId: people.owner.user.id,
      channel: "facebook",
      status,
      content: { title: "Matrix post", body: "Fresh bread" },
    });

  // [permission, label, (who) => request]. Requests that change a post get a fresh one.
  const REQUESTS = [
    ["workspace.read", "view the business", () => ["get", "/workspaces/current"]],
    ["workspace.manage", "rename the business", () => ["put", "/workspaces/current", { name: "Matrix Bakery" }]],
    ["workspace.manage", "change the notification budget", () => ["put", "/business-profile/notifications", { dailyCap: 5 }]],
    ["members.read", "see the team", () => ["get", "/workspaces/current/members"]],
    ["members.manage", "invite someone", () => ["post", "/workspaces/current/invitations", { email: `inv_${Date.now()}@example.com`, role: "viewer" }]],
    ["profile.update", "edit the business profile", () => ["put", "/business-profile/profile", { offer: "Bread and cakes" }]],
    // An invalid address is refused (422) only after the permission check, so nothing is fetched.
    ["website.connect", "connect a website", () => ["put", "/website/connection", { url: "not a website" }]],
    ["ai.use", "generate posts with AI", () => ["post", "/ai/generate-variants", { idea: "Fresh bread", channels: ["facebook"] }]],
    ["opportunity.respond", "respond to an opportunity", () => ["post", "/opportunities/opp_missing/respond", { action: "skip" }]],
    ["post.read", "list posts", () => ["get", "/posts"]],
    ["post.write", "create a post", () => ["post", "/posts", { body: "New post", channel: "facebook" }]],
    ["post.write", "edit a post", async () => ["put", `/posts/${(await newPost()).id}`, { body: "Edited" }]],
    ["post.submit", "submit a post for approval", async () => ["post", `/posts/${(await newPost()).id}/submit-approval`]],
    ["post.review", "approve a post", async () => ["post", `/posts/${(await newPost("pending_approval")).id}/approve`]],
    ["post.review", "request changes", async () => ["post", `/posts/${(await newPost("pending_approval")).id}/request-changes`, { comment: "Shorter please" }]],
    ["post.review", "reject a post", async () => ["post", `/posts/${(await newPost("pending_approval")).id}/reject`]],
    ["post.publish", "publish a post", async () => ["post", `/posts/${(await newPost("approved")).id}/publish-now`]],
    ["post.publish", "publish all approved posts", async () => ["post", "/posts/publish-approved", { postIds: [(await newPost("approved")).id] }]],
    [
      "post.publish",
      "publish from the Content Studio",
      async (who) => {
        const draft = await ContentDraft.create({ ownerId: who.user.id, title: "Quick", body: "Fresh bread", platforms: ["facebook"] });
        return ["post", "/publish/now", { contentDraftId: draft._id, platform: "facebook" }];
      },
    ],
    ["post.delete", "delete a post", async () => ["delete", `/posts/${(await newPost()).id}`]],
  ];

  beforeAll(async () => {
    await setupTestDB();
    for (const role of ROLES) {
      const user = await userModel.create({ email: `matrix_${role}_${Date.now()}@example.com`, name: `Matrix ${role}` });
      userIds.push(user.id);
      people[role] = { user };
    }
    workspace = await workspaceModel.create({ name: "Matrix Bakery", ownerId: people.owner.user.id });
    for (const role of ROLES) {
      const { user } = people[role];
      await membershipModel.create({ workspaceId: workspace.id, userId: user.id, role, status: "active" });
      await userModel.setActiveWorkspace(user.id, workspace.id);
      people[role].token = createToken({ ...user, activeWorkspaceId: workspace.id });
    }
  });

  afterAll(async () => {
    const db = mongoose.connection;
    await postModel.Post.deleteMany({ workspaceId: workspace.id });
    await db.collection("approvalevents").deleteMany({ workspaceId: workspace.id });
    await membershipModel.Membership.deleteMany({ workspaceId: workspace.id });
    await db.collection("businessprofiles").deleteMany({ workspaceId: workspace.id });
    await db.collection("notificationsettings").deleteMany({ workspaceId: workspace.id });
    await db.collection("contentdrafts").deleteMany({ ownerId: { $in: userIds } });
    await db.collection("scheduledposts").deleteMany({ ownerId: { $in: userIds } });
    await workspaceModel.Workspace.deleteMany({ _id: workspace.id });
    await db.collection("users").deleteMany({ _id: { $in: userIds } });
    await teardownTestDB();
  });

  it("has a request for every permission", () => {
    expect(new Set(REQUESTS.map(([permission]) => permission))).toEqual(new Set(ACTIONS));
  });

  const cases = REQUESTS.flatMap(([permission, label, build]) =>
    ROLES.map((role) => [role, can(role, permission) ? "can" : "can't", label, permission, build])
  );

  it.each(cases)("%s %s %s (%s)", async (role, verdict, _label, _permission, build) => {
    const who = people[role];
    const [method, path, body] = await build(who);
    let req = request(app)[method](`/api/v1${path}`)
      .set("Authorization", `Bearer ${who.token}`)
      .set("X-Workspace-Id", workspace.id);
    if (body) req = req.send(body);
    const res = await req;

    if (verdict === "can") {
      expect(res.status).not.toBe(403);
      expect(res.status).toBeLessThan(500);
    } else {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
  });
});
