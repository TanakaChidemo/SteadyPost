const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const socialAccountModel = require("../src/models/socialAccount.model");
const postModel = require("../src/models/post.model");
const ContentDraft = require("../src/models/contentDraft.model");

jest.setTimeout(30000);

describe("Publishing Ownership Vulnerability Fix Tests", () => {
  let userA, workspaceA, tokenA, accountA;
  let userB, workspaceB, tokenB, accountB;

  beforeAll(async () => {
    await setupTestDB();

    // Tenant A
    userA = await userModel.create({
      email: `tenant_a_${Date.now()}@example.com`,
      name: "Tenant A User",
    });
    workspaceA = await workspaceModel.create({
      name: "Workspace A",
      ownerId: userA.id,
    });
    await userModel.setActiveWorkspace(userA.id, workspaceA.id);
    await membershipModel.create({
      workspaceId: workspaceA.id,
      userId: userA.id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
    tokenA = createToken({ ...userA, activeWorkspaceId: workspaceA.id });

    accountA = await socialAccountModel.create({
      workspaceId: workspaceA.id,
      ownerId: userA.id,
      platform: "facebook",
      externalAccountId: "page_a_123",
      displayName: "Workspace A Facebook Page",
    });

    // Tenant B
    userB = await userModel.create({
      email: `tenant_b_${Date.now()}@example.com`,
      name: "Tenant B User",
    });
    workspaceB = await workspaceModel.create({
      name: "Workspace B",
      ownerId: userB.id,
    });
    await userModel.setActiveWorkspace(userB.id, workspaceB.id);
    await membershipModel.create({
      workspaceId: workspaceB.id,
      userId: userB.id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
    tokenB = createToken({ ...userB, activeWorkspaceId: workspaceB.id });

    accountB = await socialAccountModel.create({
      workspaceId: workspaceB.id,
      ownerId: userB.id,
      platform: "facebook",
      externalAccountId: "page_b_456",
      displayName: "Workspace B Facebook Page",
    });
  });

  afterAll(async () => {
    if (workspaceA) {
      await workspaceModel.deleteOne({ _id: workspaceA.id });
      await membershipModel.deleteOne({ workspaceId: workspaceA.id });
      await socialAccountModel.deleteOne({ _id: accountA.id });
    }
    if (workspaceB) {
      await workspaceModel.deleteOne({ _id: workspaceB.id });
      await membershipModel.deleteOne({ workspaceId: workspaceB.id });
      await socialAccountModel.deleteOne({ _id: accountB.id });
    }
    await teardownTestDB();
  });

  it("blocks creating a post with another workspace's socialAccountId (403)", async () => {
    const res = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Workspace-Id", workspaceA.id)
      .send({
        title: "Malicious Post",
        body: "Attempting to hijack Workspace B's social account",
        channel: "facebook",
        socialAccountId: accountB.id,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Chosen social account does not belong to the requester's workspace");
  });

  it("blocks updating a post with another workspace's socialAccountId (403)", async () => {
    // 1. Create legit post in Workspace A
    const legitPost = await postModel.create({
      workspaceId: workspaceA.id,
      authorId: userA.id,
      channel: "facebook",
      socialAccountId: accountA.id,
      content: { title: "Legit Post", body: "Original body" },
      status: "draft",
    });

    // 2. Try to update it with accountB
    const res = await request(app)
      .put(`/api/v1/posts/${legitPost.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Workspace-Id", workspaceA.id)
      .send({
        socialAccountId: accountB.id,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Chosen social account does not belong to the requester's workspace");
  });

  it("blocks publish-now if post points to another workspace's social account (403)", async () => {
    // Manually insert post with compromised socialAccountId
    const compromisedPost = await postModel.create({
      workspaceId: workspaceA.id,
      authorId: userA.id,
      channel: "facebook",
      socialAccountId: accountB.id,
      content: { title: "Compromised Post", body: "Sneaky publish" },
      status: "approved",
    });

    const res = await request(app)
      .post(`/api/v1/posts/${compromisedPost.id}/publish-now`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Workspace-Id", workspaceA.id);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Chosen social account does not belong to the requester's workspace");
  });

  it("blocks post approval if scheduled post points to another workspace's account (403)", async () => {
    const postWithWrongAccount = await postModel.create({
      workspaceId: workspaceA.id,
      authorId: userA.id,
      channel: "facebook",
      socialAccountId: accountB.id,
      content: { title: "Pending Post", body: "Content" },
      status: "pending_approval",
      scheduledAt: new Date(Date.now() + 60000),
    });

    const res = await request(app)
      .post(`/api/v1/posts/${postWithWrongAccount.id}/approve`)
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Workspace-Id", workspaceA.id);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Chosen social account does not belong to the requester's workspace");
  });

  it("blocks legacy /publish/now if chosen socialAccountId belongs to another workspace (403)", async () => {
    const draft = await ContentDraft.create({
      ownerId: userA.id,
      title: "Draft for Publish Now",
      body: "Draft body text",
      platforms: ["facebook"],
    });

    const res = await request(app)
      .post("/api/v1/publish/now")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Workspace-Id", workspaceA.id)
      .send({
        contentDraftId: draft._id,
        platform: "facebook",
        socialAccountId: accountB.id,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Chosen social account does not belong to the requester's workspace");
  });

  it("succeeds when publishing with a social account that belongs to the workspace (202)", async () => {
    const draft = await ContentDraft.create({
      ownerId: userA.id,
      title: "Legit Draft for Workspace A",
      body: "Properly authorized body text",
      platforms: ["facebook"],
    });

    const res = await request(app)
      .post("/api/v1/publish/now")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("X-Workspace-Id", workspaceA.id)
      .send({
        contentDraftId: draft._id,
        platform: "facebook",
        socialAccountId: accountA.id,
      });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("publishing");
  });
});
