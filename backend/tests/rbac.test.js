const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const postModel = require("../src/models/post.model");

jest.setTimeout(30000);

describe("Role-Based Access Control (RBAC) & Membership Tests", () => {
  let owner, editor, viewer, workspace;
  let ownerToken, editorToken, viewerToken;
  let testPost;

  beforeAll(async () => {
    await setupTestDB();

    // 1. Create Workspace Owner
    owner = await userModel.create({
      email: `owner_${Date.now()}@example.com`,
      name: "Workspace Owner",
    });
    workspace = await workspaceModel.create({
      name: "RBAC Venture",
      ownerId: owner.id,
    });
    await userModel.setActiveWorkspace(owner.id, workspace.id);
    await membershipModel.create({
      workspaceId: workspace.id,
      userId: owner.id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
    ownerToken = createToken({ ...owner, activeWorkspaceId: workspace.id });

    // 2. Create Workspace Editor
    editor = await userModel.create({
      email: `editor_${Date.now()}@example.com`,
      name: "Workspace Editor",
    });
    await userModel.setActiveWorkspace(editor.id, workspace.id);
    await membershipModel.create({
      workspaceId: workspace.id,
      userId: editor.id,
      role: "editor",
      status: "active",
      joinedAt: new Date(),
    });
    editorToken = createToken({ ...editor, activeWorkspaceId: workspace.id });

    // 3. Create Workspace Viewer
    viewer = await userModel.create({
      email: `viewer_${Date.now()}@example.com`,
      name: "Workspace Viewer",
    });
    await userModel.setActiveWorkspace(viewer.id, workspace.id);
    await membershipModel.create({
      workspaceId: workspace.id,
      userId: viewer.id,
      role: "viewer",
      status: "active",
      joinedAt: new Date(),
    });
    viewerToken = createToken({ ...viewer, activeWorkspaceId: workspace.id });
  });

  afterAll(async () => {
    if (workspace) {
      await workspaceModel.deleteOne({ _id: workspace.id });
      await membershipModel.deleteOne({ workspaceId: workspace.id });
      await postModel.deleteOne({ workspaceId: workspace.id });
    }
    await teardownTestDB();
  });

  it("Viewer can view posts but cannot create drafts (403)", async () => {
    const viewRes = await request(app)
      .get("/api/v1/posts")
      .set("Authorization", `Bearer ${viewerToken}`)
      .set("X-Workspace-Id", workspace.id);
    expect(viewRes.status).toBe(200);

    const createRes = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${viewerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({ body: "Viewer attempting write", channel: "facebook" });

    expect(createRes.status).toBe(403);
    expect(createRes.body.error).toMatch(/Insufficient workspace permissions/i);
  });

  it("Editor can create a draft and submit for approval", async () => {
    const createRes = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${editorToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({
        title: "Editor Draft",
        body: "High quality draft submitted by editor",
        channel: "facebook",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("draft");
    testPost = createRes.body;

    const submitRes = await request(app)
      .post(`/api/v1/posts/${testPost.id}/submit-approval`)
      .set("Authorization", `Bearer ${editorToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({ comment: "Ready for review!" });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe("pending_approval");
  });

  it("Editor cannot approve posts (403)", async () => {
    const approveRes = await request(app)
      .post(`/api/v1/posts/${testPost.id}/approve`)
      .set("Authorization", `Bearer ${editorToken}`)
      .set("X-Workspace-Id", workspace.id);

    expect(approveRes.status).toBe(403);
    expect(approveRes.body.error).toMatch(/Insufficient workspace permissions/i);
  });

  it("Editor cannot invite new members (403)", async () => {
    const inviteRes = await request(app)
      .post("/api/v1/workspaces/current/invitations")
      .set("Authorization", `Bearer ${editorToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({ email: "guest@example.com", role: "viewer" });

    expect(inviteRes.status).toBe(403);
  });

  it("Owner can approve the post and invite new members", async () => {
    const approveRes = await request(app)
      .post(`/api/v1/posts/${testPost.id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({ comment: "Looks great, approved!" });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("approved");

    const inviteRes = await request(app)
      .post("/api/v1/workspaces/current/invitations")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({ email: "newguest@example.com", role: "viewer" });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.membership.status).toBe("invited");
    expect(inviteRes.body.inviteLink).toBeTruthy();
  });
});
