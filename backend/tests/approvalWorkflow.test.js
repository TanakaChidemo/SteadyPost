const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const postModel = require("../src/models/post.model");
const approvalEventModel = require("../src/models/approvalEvent.model");
const { applyApprovalAction, ApprovalError } = require("../src/services/approval.service");

jest.setTimeout(30000);

describe("Approval workflow (F10)", () => {
  let workspace, otherWorkspace;
  const people = {};
  const userIds = [];

  const as = (who, ws = workspace) => ({ Authorization: `Bearer ${who.token}`, "X-Workspace-Id": ws.id });
  const newPost = (status = "draft", extra = {}) =>
    postModel.create({
      workspaceId: workspace.id,
      authorId: people.editor.user.id,
      channel: "facebook",
      status,
      content: { title: "Cake sale", body: "Cakes all weekend" },
      ...extra,
    });
  const act = (who, post, action, body) =>
    request(app).post(`/api/v1/posts/${post.id}/${action}`).set(as(who)).send(body || {});

  async function person(role, ws) {
    const user = await userModel.create({ email: `flow_${role}_${Date.now()}_${userIds.length}@example.com`, name: `Flow ${role}` });
    userIds.push(user.id);
    await membershipModel.create({ workspaceId: ws.id, userId: user.id, role, status: "active" });
    await userModel.setActiveWorkspace(user.id, ws.id);
    return { user, token: createToken({ ...user, activeWorkspaceId: ws.id }) };
  }

  beforeAll(async () => {
    await setupTestDB();
    const ownerUser = await userModel.create({ email: `flow_owner_${Date.now()}@example.com`, name: "Rosie" });
    userIds.push(ownerUser.id);
    workspace = await workspaceModel.create({ name: "Rosie's Bakery", ownerId: ownerUser.id });
    await membershipModel.create({ workspaceId: workspace.id, userId: ownerUser.id, role: "owner", status: "active" });
    people.owner = { user: ownerUser, token: createToken({ ...ownerUser, activeWorkspaceId: workspace.id }) };
    people.editor = await person("editor", workspace);

    const otherOwner = await userModel.create({ email: `flow_other_${Date.now()}@example.com`, name: "Kofi" });
    userIds.push(otherOwner.id);
    otherWorkspace = await workspaceModel.create({ name: "Kofi's Barbers", ownerId: otherOwner.id });
    await membershipModel.create({ workspaceId: otherWorkspace.id, userId: otherOwner.id, role: "owner", status: "active" });
    people.otherOwner = { user: otherOwner, token: createToken({ ...otherOwner, activeWorkspaceId: otherWorkspace.id }) };
  });

  afterAll(async () => {
    const ids = [workspace.id, otherWorkspace.id];
    await postModel.Post.deleteMany({ workspaceId: { $in: ids } });
    await approvalEventModel.ApprovalEvent.deleteMany({ workspaceId: { $in: ids } });
    await membershipModel.Membership.deleteMany({ workspaceId: { $in: ids } });
    await workspaceModel.Workspace.deleteMany({ _id: { $in: ids } });
    await mongoose.connection.collection("users").deleteMany({ _id: { $in: userIds } });
    await teardownTestDB();
  });

  it("runs submit → request changes → resubmit → approve, recording each step with the workspace", async () => {
    const post = await newPost();
    expect((await act(people.editor, post, "submit-approval", { comment: "Ready" })).body.status).toBe("pending_approval");
    expect((await act(people.owner, post, "request-changes", { comment: "Mention Saturday" })).body.status).toBe("changes_requested");
    expect((await act(people.editor, post, "submit-approval")).body.status).toBe("pending_approval");
    expect((await act(people.owner, post, "approve", { comment: "Lovely" })).body.status).toBe("approved");

    const events = await approvalEventModel.findByPostId(post.id);
    expect(events.map((e) => e.action)).toEqual(["submit", "request_changes", "submit", "approve"]);
    expect(events.every((e) => e.workspaceId === workspace.id)).toBe(true);
    expect(events[1].comment).toBe("Mention Saturday");
  });

  it("shows the history with who did what", async () => {
    const post = await newPost();
    await act(people.editor, post, "submit-approval");
    await act(people.owner, post, "approve");
    const res = await request(app).get(`/api/v1/posts/${post.id}`).set(as(people.editor));
    expect(res.body.approvalEvents.map((e) => [e.action, e.actorName])).toEqual([
      ["submit", "Flow editor"],
      ["approve", "Rosie"],
    ]);
  });

  it("can reject a post, and the editor can resubmit it", async () => {
    const post = await newPost("pending_approval");
    expect((await act(people.owner, post, "reject", { comment: "Not this week" })).body.status).toBe("rejected");
    expect((await act(people.editor, post, "submit-approval")).body.status).toBe("pending_approval");
  });

  it("asks for a comment when requesting changes", async () => {
    const post = await newPost("pending_approval");
    const res = await act(people.owner, post, "request-changes", { comment: "   " });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("COMMENT_REQUIRED");
    expect((await postModel.findById(post.id)).status).toBe("pending_approval");
  });

  it.each([
    ["approve", "draft"],
    ["approve", "approved"],
    ["reject", "draft"],
    ["request-changes", "published"],
    ["submit-approval", "pending_approval"],
    ["submit-approval", "approved"],
    ["submit-approval", "published"],
  ])("refuses to %s a post that's %s", async (action, status) => {
    const post = await newPost(status);
    const who = action === "submit-approval" ? people.editor : people.owner;
    const res = await act(who, post, action, { comment: "x" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_STATUS");
    expect((await postModel.findById(post.id)).status).toBe(status);
    expect(await approvalEventModel.findByPostId(post.id)).toHaveLength(0);
  });

  it("applies two simultaneous approvals only once", async () => {
    const post = await newPost("pending_approval");
    const results = await Promise.all([act(people.owner, post, "approve"), act(people.owner, post, "approve")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await approvalEventModel.findByPostId(post.id)).toHaveLength(1);
  });

  it("won't act on a post from another workspace", async () => {
    const post = await newPost("pending_approval");
    const res = await request(app).post(`/api/v1/posts/${post.id}/approve`).set(as(people.otherOwner, otherWorkspace));
    expect(res.status).toBe(404);
    expect((await postModel.findById(post.id)).status).toBe("pending_approval");
  });

  it("refuses a stale action when the post moved on since the actor saw it", async () => {
    const post = await newPost("pending_approval");
    await act(people.owner, post, "request-changes", { comment: "Shorter" });
    await expect(
      applyApprovalAction({
        workspaceId: workspace.id,
        postId: post.id,
        actorId: people.owner.user.id,
        role: "owner",
        action: "approve",
        expectedStatus: "pending_approval",
      })
    ).rejects.toMatchObject({ status: 409, code: "STALE" });
    expect(ApprovalError).toBeDefined();
  });

  describe("editing", () => {
    it.each(["pending_approval", "approved"])("sends a %s post back to draft when an editor changes it", async (status) => {
      const post = await newPost(status);
      const res = await request(app).put(`/api/v1/posts/${post.id}`).set(as(people.editor)).send({ body: "Cakes on Saturday only" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("draft");
    });

    it("keeps the status when the owner edits", async () => {
      const post = await newPost("approved");
      const res = await request(app).put(`/api/v1/posts/${post.id}`).set(as(people.owner)).send({ body: "Typo fixed" });
      expect(res.body.status).toBe("approved");
    });

    it.each(["scheduled", "published"])("won't edit a %s post", async (status) => {
      const post = await newPost(status);
      const res = await request(app).put(`/api/v1/posts/${post.id}`).set(as(people.owner)).send({ body: "Too late" });
      expect(res.status).toBe(409);
    });
  });
});
