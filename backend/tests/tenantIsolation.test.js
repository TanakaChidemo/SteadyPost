const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const postModel = require("../src/models/post.model");

jest.setTimeout(30000);

describe("Tenant Isolation & Workspace Boundary Tests", () => {
  let userA, userB, wsA, wsB, tokenA, tokenB, postA;

  beforeAll(async () => {
    await setupTestDB();

    // Create User A and Workspace A
    userA = await userModel.create({
      email: `test_user_a_${Date.now()}@example.com`,
      name: "User Alpha",
    });
    wsA = await workspaceModel.create({
      name: "Alpha Venture",
      ownerId: userA.id,
    });
    await userModel.setActiveWorkspace(userA.id, wsA.id);
    await membershipModel.create({
      workspaceId: wsA.id,
      userId: userA.id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
    tokenA = createToken({ ...userA, activeWorkspaceId: wsA.id });

    // Create User B and Workspace B
    userB = await userModel.create({
      email: `test_user_b_${Date.now()}@example.com`,
      name: "User Beta",
    });
    wsB = await workspaceModel.create({
      name: "Beta Venture",
      ownerId: userB.id,
    });
    await userModel.setActiveWorkspace(userB.id, wsB.id);
    await membershipModel.create({
      workspaceId: wsB.id,
      userId: userB.id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
    tokenB = createToken({ ...userB, activeWorkspaceId: wsB.id });

    // Create a Post in Workspace A
    postA = await postModel.create({
      workspaceId: wsA.id,
      authorId: userA.id,
      channel: "facebook",
      content: { title: "Alpha Secrets", body: "Private alpha content" },
      status: "draft",
    });
  });

  afterAll(async () => {
    // Cleanup created test records
    if (wsA) {
      await workspaceModel.deleteOne({ _id: wsA.id });
      await membershipModel.deleteOne({ workspaceId: wsA.id });
      await postModel.deleteOne({ workspaceId: wsA.id });
      await userModel.updateById(userA.id, { $unset: { activeWorkspaceId: 1 } });
    }
    if (wsB) {
      await workspaceModel.deleteOne({ _id: wsB.id });
      await membershipModel.deleteOne({ workspaceId: wsB.id });
      await userModel.updateById(userB.id, { $unset: { activeWorkspaceId: 1 } });
    }
    await teardownTestDB();
  });

  it("denies access when User A requests Workspace B via X-Workspace-Id header", async () => {
    const res = await request(app)
      .get("/api/v1/posts")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Workspace-Id", wsB.id);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  it("isolates posts so User B cannot see Workspace A's posts", async () => {
    const res = await request(app)
      .get("/api/v1/posts")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    const postIds = res.body.items.map((p) => p.id || p._id);
    expect(postIds).not.toContain(postA.id);
  });

  it("blocks cross-tenant post mutations (User B trying to modify Post A)", async () => {
    const res = await request(app)
      .put(`/api/v1/posts/${postA.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ body: "Hacked content" });

    expect(res.status).toBe(404);
  });

  it("automatically falls back to user's activeWorkspaceId when header is omitted", async () => {
    const res = await request(app)
      .get("/api/v1/posts")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const postIds = res.body.items.map((p) => p.id || p._id);
    expect(postIds).toContain(postA.id);
  });
});
