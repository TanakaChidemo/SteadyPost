const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const socialAccountModel = require("../src/models/socialAccount.model");
const postModel = require("../src/models/post.model");
const approvalEventModel = require("../src/models/approvalEvent.model");
const ContentDraft = require("../src/models/contentDraft.model");

jest.setTimeout(30000);

// F10 (#07): only the owner publishes. Editors submit for approval, viewers read.
describe("Publishing is owner-only", () => {
  let workspace, account;
  const people = {};
  const userIds = [];

  async function addPerson(role, { member = true, status = "active" } = {}) {
    const user = await userModel.create({ email: `pub_${role}_${Date.now()}_${userIds.length}@example.com`, name: role });
    userIds.push(user.id);
    await userModel.setActiveWorkspace(user.id, workspace.id);
    if (member) {
      await membershipModel.create({ workspaceId: workspace.id, userId: user.id, role, status, joinedAt: new Date() });
    }
    return { user, token: createToken({ ...user, activeWorkspaceId: workspace.id }) };
  }

  const as = (who) => ({ Authorization: `Bearer ${who.token}`, "X-Workspace-Id": workspace.id });

  const draftPost = (extra = {}) =>
    postModel.create({
      workspaceId: workspace.id,
      authorId: people.editor.user.id,
      channel: "facebook",
      socialAccountId: account.id,
      content: { title: "Weekend cake sale", body: "Cakes all weekend" },
      ...extra,
    });

  const contentDraftOf = (who) =>
    ContentDraft.create({ ownerId: who.user.id, title: "Quick post", body: "Fresh bread today", platforms: ["facebook"] });

  beforeAll(async () => {
    await setupTestDB();
    const ownerUser = await userModel.create({ email: `pub_owner_${Date.now()}@example.com`, name: "owner" });
    userIds.push(ownerUser.id);
    workspace = await workspaceModel.create({ name: "Publishing Bakery", ownerId: ownerUser.id });
    await userModel.setActiveWorkspace(ownerUser.id, workspace.id);
    await membershipModel.create({ workspaceId: workspace.id, userId: ownerUser.id, role: "owner", status: "active" });
    people.owner = { user: ownerUser, token: createToken({ ...ownerUser, activeWorkspaceId: workspace.id }) };
    people.editor = await addPerson("editor");
    people.viewer = await addPerson("viewer");
    // Has the workspace saved as active, but was never a member / was removed.
    people.stranger = await addPerson("editor", { member: false });
    people.removed = await addPerson("editor", { status: "removed" });

    account = await socialAccountModel.create({
      workspaceId: workspace.id,
      ownerId: ownerUser.id,
      platform: "facebook",
      externalAccountId: `page_${Date.now()}`,
      displayName: "Bakery Page",
    });
  });

  afterAll(async () => {
    await postModel.Post.deleteMany({ workspaceId: workspace.id });
    await membershipModel.Membership.deleteMany({ workspaceId: workspace.id });
    await socialAccountModel.SocialAccount.deleteMany({ workspaceId: workspace.id });
    await workspaceModel.Workspace.deleteMany({ _id: workspace.id });
    await mongoose.connection.collection("contentdrafts").deleteMany({ ownerId: { $in: userIds } });
    await mongoose.connection.collection("users").deleteMany({ _id: { $in: userIds } });
    await teardownTestDB();
  });

  describe("the Content Studio's publish (/publish/now)", () => {
    it.each(["editor", "viewer"])("refuses a %s", async (role) => {
      const draft = await contentDraftOf(people[role]);
      const res = await request(app)
        .post("/api/v1/publish/now")
        .set(as(people[role]))
        .send({ contentDraftId: draft._id, platform: "facebook", socialAccountId: account.id });
      expect(res.status).toBe(403);
    });

    it.each(["stranger", "removed"])("refuses a %s whose saved active workspace is this one", async (who) => {
      const draft = await contentDraftOf(people[who]);
      const res = await request(app)
        .post("/api/v1/publish/now")
        .set("Authorization", `Bearer ${people[who].token}`)
        .send({ contentDraftId: draft._id, platform: "facebook", socialAccountId: account.id });
      expect(res.status).toBe(403);
    });

    it("lets the owner publish", async () => {
      const draft = await contentDraftOf(people.owner);
      const res = await request(app)
        .post("/api/v1/publish/now")
        .set(as(people.owner))
        .send({ contentDraftId: draft._id, platform: "facebook", socialAccountId: account.id });
      expect(res.status).toBe(202);
    });
  });

  describe("publishing a post (/posts/:id/publish-now)", () => {
    it.each(["editor", "viewer"])("refuses a %s, even for an approved post", async (role) => {
      const post = await draftPost({ status: "approved" });
      const res = await request(app).post(`/api/v1/posts/${post.id}/publish-now`).set(as(people[role]));
      expect(res.status).toBe(403);
      expect((await postModel.findById(post.id)).status).toBe("approved");
    });

    it("lets the owner publish an approved post without a second approval event", async () => {
      const post = await draftPost({ status: "approved" });
      const res = await request(app).post(`/api/v1/posts/${post.id}/publish-now`).set(as(people.owner));
      expect(res.status).toBe(202);
      expect(await approvalEventModel.findByPostId(post.id)).toHaveLength(0);
    });

    it("records the owner publishing an unapproved post as their approval", async () => {
      const post = await draftPost();
      const res = await request(app).post(`/api/v1/posts/${post.id}/publish-now`).set(as(people.owner));
      expect(res.status).toBe(202);
      const events = await approvalEventModel.findByPostId(post.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ action: "approve", actorId: people.owner.user.id });
    });

    it.each(["scheduled", "published"])("won't publish a post that's already %s", async (status) => {
      const post = await draftPost({ status });
      const res = await request(app).post(`/api/v1/posts/${post.id}/publish-now`).set(as(people.owner));
      expect(res.status).toBe(409);
    });
  });

  describe("publishing all approved posts (/posts/publish-approved)", () => {
    it.each(["editor", "viewer"])("refuses a %s", async (role) => {
      const post = await draftPost({ status: "approved" });
      const res = await request(app).post("/api/v1/posts/publish-approved").set(as(people[role])).send({ postIds: [post.id] });
      expect(res.status).toBe(403);
      expect((await postModel.findById(post.id)).status).toBe("approved");
    });

    it("lets the owner publish them", async () => {
      const post = await draftPost({ status: "approved" });
      const res = await request(app).post("/api/v1/posts/publish-approved").set(as(people.owner)).send({ postIds: [post.id] });
      expect(res.status).toBe(202);
      expect(res.body.queuedCount).toBe(1);
    });
  });
});
