const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");
const postModel = require("../src/models/post.model");
const approvalEventModel = require("../src/models/approvalEvent.model");
const approvalLinkModel = require("../src/models/approvalLink.model");
const approvalLinks = require("../src/services/approvalLink.service");

jest.setTimeout(30000);

/**
 * F10 (#07) acceptance bar: replaying approval callbacks (the single-use links
 * Telegram's buttons will carry) with stale, duplicated and wrong-workspace
 * IDs. Target: every one lands on the correct workspace and post, or changes
 * nothing.
 */
describe("Approval link replays", () => {
  const userIds = [];
  let rosie, bakery, kofi, barbers, editor;

  async function owner(name, business) {
    const user = await userModel.create({ email: `alink_${name}_${Date.now()}@example.com`, name });
    userIds.push(user.id);
    const ws = await workspaceModel.create({ name: business, ownerId: user.id });
    await membershipModel.create({ workspaceId: ws.id, userId: user.id, role: "owner", status: "active" });
    await userModel.setActiveWorkspace(user.id, ws.id);
    return [{ user, token: createToken(user) }, ws];
  }

  const pendingPost = (ws, body = "Cakes all weekend") =>
    postModel.create({ workspaceId: ws.id, authorId: editor.user.id, channel: "facebook", status: "pending_approval", content: { title: "Cake sale", body } });

  const linkFor = (who, ws, post, action = "approve", channel = "telegram") =>
    approvalLinks.issue({ workspaceId: ws.id, postId: post.id, actorId: who.user.id, action, channel });

  const redeem = (who, token, activeWs) => {
    const req = request(app).post("/api/v1/approvals/redeem").set("Authorization", `Bearer ${who.token}`);
    if (activeWs) req.set("X-Workspace-Id", activeWs.id);
    return req.send({ token });
  };

  const statusOf = async (post) => (await postModel.findById(post.id)).status;
  const eventsOf = (post) => approvalEventModel.findByPostId(post.id);

  beforeAll(async () => {
    await setupTestDB();
    [rosie, bakery] = await owner("Rosie", "Rosie's Bakery");
    [kofi, barbers] = await owner("Kofi", "Kofi's Barbers");
    const editorUser = await userModel.create({ email: `alink_editor_${Date.now()}@example.com`, name: "Sam" });
    userIds.push(editorUser.id);
    await membershipModel.create({ workspaceId: bakery.id, userId: editorUser.id, role: "editor", status: "active" });
    editor = { user: editorUser, token: createToken(editorUser) };
  });

  afterAll(async () => {
    const ids = [bakery.id, barbers.id];
    await approvalLinkModel.ApprovalLink.deleteMany({ workspaceId: { $in: ids } });
    await approvalEventModel.ApprovalEvent.deleteMany({ workspaceId: { $in: ids } });
    await postModel.Post.deleteMany({ workspaceId: { $in: ids } });
    await membershipModel.Membership.deleteMany({ workspaceId: { $in: ids } });
    await workspaceModel.Workspace.deleteMany({ _id: { $in: ids } });
    await mongoose.connection.collection("users").deleteMany({ _id: { $in: userIds } });
    await teardownTestDB();
  });

  it("approves the right post, recording who decided and how", async () => {
    const post = await pendingPost(bakery);
    const res = await redeem(rosie, await linkFor(rosie, bakery, post));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("done");
    expect(await statusOf(post)).toBe("approved");
    const [event] = await eventsOf(post);
    expect(event).toMatchObject({ action: "approve", actorId: rosie.user.id, workspaceId: bakery.id, comment: "Decided in Telegram" });
  });

  it("can reject with a link", async () => {
    const post = await pendingPost(bakery);
    await redeem(rosie, await linkFor(rosie, bakery, post, "reject"));
    expect(await statusOf(post)).toBe("rejected");
  });

  describe("duplicated", () => {
    it("treats a repeated tap as already done, without a second event", async () => {
      const post = await pendingPost(bakery);
      const token = await linkFor(rosie, bakery, post);
      await redeem(rosie, token);
      const again = await redeem(rosie, token);
      expect(again.status).toBe(200);
      expect(again.body.outcome).toBe("already_used");
      expect(await eventsOf(post)).toHaveLength(1);
    });

    it("acts once when the same tap arrives twice at the same moment", async () => {
      const post = await pendingPost(bakery);
      const token = await linkFor(rosie, bakery, post);
      const results = await Promise.all([redeem(rosie, token), redeem(rosie, token), redeem(rosie, token)]);
      expect(results.map((r) => r.body.outcome).sort()).toEqual(["already_used", "already_used", "done"]);
      expect(await eventsOf(post)).toHaveLength(1);
    });

    it("uses only one of an approve and a reject sent together", async () => {
      const post = await pendingPost(bakery);
      const [approveToken, rejectToken] = [await linkFor(rosie, bakery, post), await linkFor(rosie, bakery, post, "reject")];
      const results = await Promise.all([redeem(rosie, approveToken), redeem(rosie, rejectToken)]);
      expect(results.filter((r) => r.status === 200 && r.body.outcome === "done")).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(1);
      expect(await eventsOf(post)).toHaveLength(1);
    });
  });

  describe("stale", () => {
    it("refuses a link for a post that's since been edited and resubmitted", async () => {
      const post = await pendingPost(bakery);
      const token = await linkFor(rosie, bakery, post);
      // The editor changes it (back to draft) and resubmits: same status, new content.
      await request(app).put(`/api/v1/posts/${post.id}`).set({ Authorization: `Bearer ${editor.token}`, "X-Workspace-Id": bakery.id }).send({ body: "Cakes on Saturday only" });
      await request(app).post(`/api/v1/posts/${post.id}/submit-approval`).set({ Authorization: `Bearer ${editor.token}`, "X-Workspace-Id": bakery.id });
      expect(await statusOf(post)).toBe("pending_approval");

      const res = await redeem(rosie, token);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("STALE");
      expect(await statusOf(post)).toBe("pending_approval");
      expect((await eventsOf(post)).map((e) => e.action)).toEqual(["submit"]);
    });

    it("refuses a link for a post that was already decided in the app", async () => {
      const post = await pendingPost(bakery);
      const token = await linkFor(rosie, bakery, post);
      await request(app).post(`/api/v1/posts/${post.id}/request-changes`).set({ Authorization: `Bearer ${rosie.token}`, "X-Workspace-Id": bakery.id }).send({ comment: "Shorter" });
      const res = await redeem(rosie, token);
      expect(res.status).toBe(409);
      expect(await statusOf(post)).toBe("changes_requested");
    });

    it("refuses an expired link", async () => {
      const post = await pendingPost(bakery);
      const token = await linkFor(rosie, bakery, post);
      await approvalLinkModel.ApprovalLink.updateOne({ tokenHash: approvalLinkModel.hashToken(token) }, { expiresAt: new Date(Date.now() - 1000) });
      expect((await redeem(rosie, token)).status).toBe(410);
      expect(await statusOf(post)).toBe("pending_approval");
    });

    it("refuses a link for someone who's no longer on the team", async () => {
      const [ama, amaShop] = await owner("Ama", "Ama's Shop");
      // Removed from the team after the link was sent: it stops working.
      const post = await pendingPost(amaShop);
      const token = await linkFor(ama, amaShop, post);
      await membershipModel.Membership.updateOne({ workspaceId: amaShop.id, userId: ama.user.id }, { status: "removed" });
      expect((await redeem(ama, token)).status).toBe(403);
      expect(await statusOf(post)).toBe("pending_approval");
      await membershipModel.Membership.deleteMany({ workspaceId: amaShop.id });
      await postModel.Post.deleteMany({ workspaceId: amaShop.id });
      await workspaceModel.Workspace.deleteMany({ _id: amaShop.id });
    });
  });

  describe("wrong workspace", () => {
    it("acts on the link's own business even when another business is open", async () => {
      const [dual, dualShop] = await owner("Dual", "Dual's Deli");
      await membershipModel.create({ workspaceId: bakery.id, userId: dual.user.id, role: "owner", status: "active" });
      const bakeryPost = await pendingPost(bakery);
      const deliPost = await pendingPost(dualShop, "Same words");

      const res = await redeem(dual, await linkFor(dual, bakery, bakeryPost), dualShop);
      expect(res.status).toBe(200);
      expect(await statusOf(bakeryPost)).toBe("approved");
      expect(await statusOf(deliPost)).toBe("pending_approval");

      await membershipModel.Membership.deleteMany({ $or: [{ workspaceId: dualShop.id }, { userId: dual.user.id }] });
      await postModel.Post.deleteMany({ workspaceId: dualShop.id });
      await workspaceModel.Workspace.deleteMany({ _id: dualShop.id });
    });

    it("won't let someone else's link be used, even by an owner of the same business", async () => {
      const post = await pendingPost(bakery);
      const token = await linkFor(rosie, bakery, post);
      const res = await redeem(kofi, token, barbers);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("WRONG_PERSON");
      expect(await statusOf(post)).toBe("pending_approval");
      expect((await redeem(rosie, token)).body.outcome).toBe("done");
    });

    it("refuses a link issued to an editor, who can't approve", async () => {
      const post = await pendingPost(bakery);
      const token = await linkFor(editor, bakery, post);
      expect((await redeem(editor, token)).status).toBe(403);
      expect(await statusOf(post)).toBe("pending_approval");
    });

    it("can't issue a link for a post in another business", async () => {
      const post = await pendingPost(barbers);
      await expect(linkFor(rosie, bakery, post)).rejects.toMatchObject({ status: 404 });
    });

    it("refuses made-up and missing tokens", async () => {
      expect((await redeem(rosie, "not-a-real-token")).status).toBe(404);
      expect((await redeem(rosie, "")).status).toBe(404);
    });
  });
});
