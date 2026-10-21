const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const postModel = require("../src/models/post.model");

jest.setTimeout(30000);

describe("Unified Post State Machine & Approval Workflow Tests", () => {
  let owner, workspace, ownerToken;

  beforeAll(async () => {
    await setupTestDB();

    owner = await userModel.create({
      email: `lifecycle_owner_${Date.now()}@example.com`,
      name: "Lifecycle Owner",
    });
    workspace = await workspaceModel.create({
      name: "Lifecycle Venture",
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
  });

  afterAll(async () => {
    if (workspace) {
      await workspaceModel.deleteOne({ _id: workspace.id });
      await membershipModel.deleteOne({ workspaceId: workspace.id });
      await postModel.deleteOne({ workspaceId: workspace.id });
    }
    await teardownTestDB();
  });

  it("completes full lifecycle: draft -> pending_approval -> changes_requested -> approved -> publish", async () => {
    // 1. Create Post (draft)
    const createRes = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({
        title: "Product Teaser",
        body: "First version of body copy",
        channel: "facebook",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("draft");
    const postId = createRes.body.id;

    // 2. Submit for Approval
    const submitRes = await request(app)
      .post(`/api/v1/posts/${postId}/submit-approval`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({ comment: "Please review" });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe("pending_approval");

    // 3. Request Changes
    const changeReqRes = await request(app)
      .post(`/api/v1/posts/${postId}/request-changes`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({ comment: "Needs a stronger hook at the beginning" });

    expect(changeReqRes.status).toBe(200);
    expect(changeReqRes.body.status).toBe("changes_requested");

    // 4. Update body copy
    const updateRes = await request(app)
      .put(`/api/v1/posts/${postId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({ body: "🚀 Revised hook: Transforming your publishing workflow today!" });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.versions.length).toBeGreaterThanOrEqual(2);

    // 5. Re-submit and Approve
    await request(app)
      .post(`/api/v1/posts/${postId}/submit-approval`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id);

    const approveRes = await request(app)
      .post(`/api/v1/posts/${postId}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id)
      .send({ comment: "Looks excellent now!" });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("approved");

    // 6. Check getById details & Audit events
    const detailRes = await request(app)
      .get(`/api/v1/posts/${postId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.approvalEvents.length).toBe(4); // submit, request_changes, re-submit, approve

    // 7. Publish Now
    const publishRes = await request(app)
      .post(`/api/v1/posts/${postId}/publish-now`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Workspace-Id", workspace.id);

    expect(publishRes.status).toBe(202);
    expect(publishRes.body.status).toBe("publishing");
  });
});
