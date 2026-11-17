const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const postModel = require("../src/models/post.model");
const ContentDraft = require("../src/models/contentDraft.model");
const socialAccountModel = require("../src/models/socialAccount.model");
const approvalEventModel = require("../src/models/approvalEvent.model");
const { migrateDrafts } = require("../scripts/migrate-drafts-to-posts");

jest.setTimeout(60000);

/**
 * F10 (#07): Content Studio drafts live on the business's Post records, so the
 * owner sees editors' drafts and every post goes out through one publish path.
 */
describe("Drafts on posts (F10)", () => {
  let workspace, otherWorkspace, page, instagram;
  const people = {};
  const userIds = [];
  const as = (who, ws = workspace) => ({ Authorization: `Bearer ${who.token}`, "X-Workspace-Id": ws.id });

  async function person(role, name) {
    const user = await userModel.create({ email: `drafts_${role}_${Date.now()}_${userIds.length}@example.com`, name });
    userIds.push(user.id);
    if (role !== "none") {
      await membershipModel.create({ workspaceId: workspace.id, userId: user.id, role, status: "active" });
      await userModel.setActiveWorkspace(user.id, workspace.id);
    }
    return { user, token: createToken({ ...user, activeWorkspaceId: workspace.id }) };
  }

  const account = (platform, displayName, ws = workspace) =>
    socialAccountModel.create({
      workspaceId: ws.id,
      ownerId: ws.ownerId,
      platform,
      externalAccountId: `drafts_${platform}_${Date.now()}_${Math.random()}`,
      displayName,
      linkedBy: ws.ownerId,
    });

  beforeAll(async () => {
    await setupTestDB();
    const ownerUser = await userModel.create({ email: `drafts_owner_${Date.now()}@example.com`, name: "Rosie" });
    userIds.push(ownerUser.id);
    workspace = await workspaceModel.create({ name: "Rosie's Bakery", ownerId: ownerUser.id });
    await membershipModel.create({ workspaceId: workspace.id, userId: ownerUser.id, role: "owner", status: "active" });
    people.owner = { user: ownerUser, token: createToken({ ...ownerUser, activeWorkspaceId: workspace.id }) };
    people.editor = await person("editor", "Sam");
    people.otherEditor = await person("editor", "Ade");
    people.viewer = await person("viewer", "Vic");

    otherWorkspace = await workspaceModel.create({ name: "Kofi's Barbers", ownerId: userIds[0] + "_other" });
    page = await account("facebook", "Rosie's Page");
    instagram = await account("instagram", "@rosiesbakery");
  });

  afterAll(async () => {
    const ids = [workspace.id, otherWorkspace.id];
    await postModel.Post.deleteMany({ workspaceId: { $in: ids } });
    await approvalEventModel.ApprovalEvent.deleteMany({ workspaceId: { $in: ids } });
    await socialAccountModel.SocialAccount.deleteMany({ workspaceId: { $in: ids } });
    await membershipModel.Membership.deleteMany({ workspaceId: { $in: ids } });
    await workspaceModel.Workspace.deleteMany({ _id: { $in: ids } });
    await mongoose.connection.collection("contentdrafts").deleteMany({ ownerId: { $in: userIds } });
    await mongoose.connection.collection("users").deleteMany({ _id: { $in: userIds } });
    await teardownTestDB();
  });

  const saveDraft = (who, extra = {}) =>
    request(app)
      .post("/api/v1/posts")
      .set(as(who))
      .send({ title: "Weekend", body: "Cakes all weekend", channel: "facebook", targetAccountIds: [page.id, instagram.id], ...extra });

  it("shares an editor's draft with the owner, with the accounts it's for and who wrote it", async () => {
    const saved = await saveDraft(people.editor);
    expect(saved.status).toBe(201);
    expect(saved.body.targetAccountIds).toEqual([page.id, instagram.id]);

    const drafts = await request(app).get("/api/v1/posts?status=draft").set(as(people.owner));
    const shared = drafts.body.items.find((p) => p.id === saved.body.id);
    expect(shared).toMatchObject({ status: "draft", authorName: "Sam", targetAccountIds: [page.id, instagram.id] });
  });

  it("won't let a draft target another business's account", async () => {
    const theirs = await account("facebook", "Kofi's Page", otherWorkspace);
    const res = await saveDraft(people.editor, { targetAccountIds: [page.id, theirs.id] });
    expect(res.status).toBe(403);

    const draft = (await saveDraft(people.editor)).body;
    const edit = await request(app).put(`/api/v1/posts/${draft.id}`).set(as(people.editor)).send({ targetAccountIds: [theirs.id] });
    expect(edit.status).toBe(403);
  });

  it("follows the studio: one post per account, each approved, then published through /posts/:id/publish-now", async () => {
    const draft = (await saveDraft(people.editor)).body;

    // The draft becomes the first account's post; the second account gets a copy.
    const first = await request(app).put(`/api/v1/posts/${draft.id}`).set(as(people.editor)).send({ socialAccountId: page.id, channel: "facebook" });
    expect(first.status).toBe(200);
    const second = await request(app)
      .post("/api/v1/posts")
      .set(as(people.editor))
      .send({ title: "Weekend", body: "Cakes all weekend", channel: "instagram", socialAccountId: instagram.id });
    expect(second.status).toBe(201);

    for (const post of [first.body, second.body]) {
      const submitted = await request(app).post(`/api/v1/posts/${post.id}/submit-approval`).set(as(people.editor)).send({ comment: "Ready" });
      expect(submitted.body.status).toBe("pending_approval");
      expect((await request(app).post(`/api/v1/posts/${post.id}/publish-now`).set(as(people.editor))).status).toBe(403);
      expect((await request(app).post(`/api/v1/posts/${post.id}/approve`).set(as(people.owner))).body.status).toBe("approved");
      const published = await request(app).post(`/api/v1/posts/${post.id}/publish-now`).set(as(people.owner));
      expect(published.status).toBeLessThan(300);
    }

    const history = await request(app).get(`/api/v1/posts/${first.body.id}`).set(as(people.viewer));
    expect(history.body.approvalEvents.map((e) => [e.action, e.actorName])).toEqual([
      ["submit", "Sam"],
      ["approve", "Rosie"],
    ]);
  });

  it("keeps Google Business options set when a draft is sent to a GBP account", async () => {
    const draft = (await saveDraft(people.editor)).body;
    const gbpOptions = { topicType: "OFFER", callToAction: { actionType: "ORDER", url: "https://example.com/cakes" } };
    const res = await request(app).put(`/api/v1/posts/${draft.id}`).set(as(people.editor)).send({ body: "Cake offer", gbpOptions });
    expect(res.body.aiMetadata.gbpOptions).toEqual(gbpOptions);
    expect(res.body.aiMetadata.guardrails).toBeDefined();
  });

  it("keeps a draft's schedule and Google Business options between saves", async () => {
    const when = new Date(Date.now() + 86400000).toISOString();
    const gbpOptions = { topicType: "OFFER", callToAction: { actionType: "ORDER", url: "https://rosies.example/order" } };
    const created = await saveDraft(people.editor, { scheduledAt: when, aiMetadata: { gbpOptions } });
    expect(created.status).toBe(201);
    expect(new Date(created.body.scheduledAt).toISOString()).toBe(when);
    expect(created.body.aiMetadata.gbpOptions).toEqual(gbpOptions);

    const changed = { topicType: "STANDARD" };
    const updated = await request(app)
      .put(`/api/v1/posts/${created.body.id}`)
      .set(as(people.editor))
      .send({ body: "Cakes all weekend, now with pies", scheduledAt: null, gbpOptions: changed });
    expect(updated.status).toBe(200);
    expect(updated.body.scheduledAt).toBeNull();
    expect(updated.body.aiMetadata.gbpOptions).toEqual(changed);
    expect(updated.body.aiMetadata.guardrails).toBeTruthy();
  });

  describe("deleting drafts", () => {
    const del = (who, post) => request(app).delete(`/api/v1/posts/${post.id}`).set(as(who));

    it("lets an editor delete their own draft", async () => {
      const draft = (await saveDraft(people.editor)).body;
      expect((await del(people.editor, draft)).status).toBe(204);
    });

    it("won't let an editor delete someone else's draft", async () => {
      const draft = (await saveDraft(people.otherEditor)).body;
      const res = await del(people.editor, draft);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });

    it("won't let an editor delete their own post once it's been sent", async () => {
      const draft = (await saveDraft(people.editor)).body;
      await request(app).post(`/api/v1/posts/${draft.id}/submit-approval`).set(as(people.editor));
      expect((await del(people.editor, draft)).status).toBe(403);
    });

    it("won't let a viewer delete anything", async () => {
      const draft = (await saveDraft(people.editor)).body;
      expect((await del(people.viewer, draft)).status).toBe(403);
    });

    it("lets the owner delete any post", async () => {
      const draft = (await saveDraft(people.editor)).body;
      await request(app).post(`/api/v1/posts/${draft.id}/submit-approval`).set(as(people.editor));
      expect((await del(people.owner, draft)).status).toBe(204);
    });
  });

  it("saves AI batch drafts as the business's posts", async () => {
    const res = await request(app)
      .post("/api/v1/posts/batch-create")
      .set(as(people.editor))
      .send({ posts: [{ title: "AI idea", body: "Fresh scones at 9", channel: "facebook" }] });
    expect(res.status).toBe(201);
    const [created] = res.body.items;
    expect(created).toMatchObject({ workspaceId: workspace.id, authorId: people.editor.user.id, status: "draft" });
    expect(await postModel.findById(created.id)).not.toBeNull();
  });

  describe("migrating old per-user drafts", () => {
    const quiet = () => {};
    const mine = () => ({ ownerId: { $in: userIds } });
    let legacy, moved, orphan, sent, owner2;

    beforeAll(async () => {
      // Saved in the business, before drafts were shared.
      legacy = await ContentDraft.create({ ownerId: people.editor.user.id, workspaceId: workspace.id, title: "Legacy", body: "Old draft", platforms: ["instagram"] });
      // Saved before drafts had a business: goes to the business its author owns.
      moved = await ContentDraft.create({ ownerId: people.owner.user.id, title: "No business", body: "Older draft", platforms: ["facebook", "instagram"] });
      // Author owns no business: skipped.
      owner2 = await person("none", "Nobody");
      orphan = await ContentDraft.create({ ownerId: owner2.user.id, title: "Orphan", body: "Lost draft", platforms: ["facebook"] });
      // Already published through the old path: not a draft any more.
      sent = await ContentDraft.create({ ownerId: people.editor.user.id, workspaceId: workspace.id, title: "Sent", body: "Gone out", platforms: ["facebook"], status: "published" });
    });

    it("changes nothing on a dry run", async () => {
      const summary = await migrateDrafts({ log: quiet, filter: mine() });
      expect(summary.migrated).toBeGreaterThanOrEqual(2);
      expect(await postModel.findById(legacy._id)).toBeNull();
    });

    it("moves drafts to the right business with the right accounts, and is safe to run again", async () => {
      await migrateDrafts({ apply: true, log: quiet, filter: mine() });

      expect(await postModel.findById(legacy._id)).toMatchObject({
        workspaceId: workspace.id,
        authorId: people.editor.user.id,
        status: "draft",
        channel: "instagram",
        targetAccountIds: [instagram.id],
        content: expect.objectContaining({ title: "Legacy", body: "Old draft" }),
      });
      const fromOwner = await postModel.findById(moved._id);
      expect(fromOwner.workspaceId).toBe(workspace.id);
      expect([...fromOwner.targetAccountIds].sort()).toEqual([page.id, instagram.id].sort());
      expect(await postModel.findById(orphan._id)).toBeNull();
      expect(await postModel.findById(sent._id)).toBeNull();

      const again = await migrateDrafts({ apply: true, log: quiet, filter: mine() });
      expect(again.migrated).toBe(0);
      expect(again.alreadyMigrated).toBeGreaterThanOrEqual(2);
      expect(await postModel.Post.countDocuments({ _id: { $in: [legacy._id, moved._id] } })).toBe(2);
    });
  });
});
