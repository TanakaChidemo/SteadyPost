const request = require("supertest");
const app = require("../src/app");
const { setupTestDB, teardownTestDB, createToken } = require("./testHelpers");
const { InMemoryJobQueue, enqueuePublishJob, cancelPublishJob, closeQueues } = require("../src/queue");
const { processPublishJob } = require("../src/queue/publishProcessor");
const { adapterRegistry } = require("../src/services/publishers/adapterRegistry");
const BaseAdapter = require("../src/services/publishers/BaseAdapter");
const postModel = require("../src/models/post.model");
const postMetricsModel = require("../src/models/postMetrics.model");
const workspaceModel = require("../src/models/workspace.model");
const membershipModel = require("../src/models/membership.model");
const userModel = require("../src/models/user.model");

jest.setTimeout(30000);

describe("Job Queue, Retries & Metrics Collection Tests (#10)", () => {
  let user, workspace, token;

  beforeAll(async () => {
    await setupTestDB();

    user = await userModel.create({
      email: `queue_test_${Date.now()}@example.com`,
      name: "Queue Tester",
    });
    workspace = await workspaceModel.create({
      name: "Queue Workspace",
      ownerId: user.id,
    });
    await userModel.setActiveWorkspace(user.id, workspace.id);
    await membershipModel.create({
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
    token = createToken({ ...user, activeWorkspaceId: workspace.id });
  });

  afterAll(async () => {
    await closeQueues();
    if (workspace) {
      await workspaceModel.deleteOne({ _id: workspace.id });
      await membershipModel.deleteOne({ workspaceId: workspace.id });
      await postModel.deleteOne({ workspaceId: workspace.id });
    }
    adapterRegistry.resetDefaults();
    await teardownTestDB();
  });

  afterEach(() => {
    adapterRegistry.resetDefaults();
  });

  describe("InMemoryJobQueue Core Engine", () => {
    it("processes immediate job with zero delay", async () => {
      const queue = new InMemoryJobQueue("test_immediate");
      let executed = false;

      queue.setProcessor(async (job) => {
        executed = true;
        return { success: true, postId: job.data.postId };
      });

      const job = await queue.add("test_job", { postId: "post_123" }, { delay: 0 });
      expect(job.status).toBe("waiting");

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(executed).toBe(true);
      expect(queue.getJob(job.id).status).toBe("completed");
    });

    it("delays execution and allows cancellation", async () => {
      const queue = new InMemoryJobQueue("test_delay");
      let executed = false;

      queue.setProcessor(async () => {
        executed = true;
      });

      const job = await queue.add("delayed_job", { postId: "post_delay_test" }, { delay: 300 });
      expect(queue.timers.has(job.id)).toBe(true);

      const cancelled = queue.cancel(job.id);
      expect(cancelled).toBe(true);
      expect(queue.getJob(job.id).status).toBe("cancelled");

      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(executed).toBe(false);
    });

    it("retries failures with exponential backoff until maxRetries", async () => {
      const queue = new InMemoryJobQueue("test_retry");
      let attempts = 0;

      queue.setProcessor(async () => {
        attempts += 1;
        throw new Error(`Transient API rate limit (attempt ${attempts})`);
      });

      const job = await queue.add(
        "failing_job",
        { postId: "post_retry_test" },
        { delay: 0, maxRetries: 3, backoff: 30 }
      );

      // Wait for 3 attempts (initial + 30ms + 60ms + margin)
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(attempts).toBe(3);
      expect(queue.getJob(job.id).status).toBe("failed");
    });
  });

  describe("processPublishJob Integration & Metrics Collection", () => {
    it("publishes post and records resulting postMetrics in DB", async () => {
      const post = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "twitter",
        content: { title: "Metrics Test Post", body: "Check our metrics!" },
        status: "scheduled",
      });

      // Custom mock adapter that returns predictable publish and metrics
      class TestMetricsAdapter extends BaseAdapter {
        constructor() {
          super("twitter");
        }
        async publish() {
          return {
            platform: "twitter",
            externalId: `tweet_ext_${post.id}`,
            publishedAt: new Date().toISOString(),
          };
        }
        async getMetrics() {
          return {
            reach: 250,
            likes: 42,
            comments: 7,
            shares: 12,
            clicks: 18,
          };
        }
      }

      adapterRegistry.register("twitter", new TestMetricsAdapter());

      const result = await processPublishJob({
        id: "job_metric_1",
        data: {
          postId: post.id,
          platform: "twitter",
          content: post.content.body,
          workspaceId: workspace.id,
        },
      });

      expect(result.externalId).toBe(`tweet_ext_${post.id}`);

      // Check Post status updated to published
      const updatedPost = await postModel.findById(post.id);
      expect(updatedPost.status).toBe("published");
      expect(updatedPost.externalPostId).toBe(`tweet_ext_${post.id}`);

      // Check resulting PostMetrics recorded in database
      const metrics = await postMetricsModel.getLatestByPostId(post.id);
      expect(metrics).not.toBeNull();
      expect(metrics.reach).toBe(250);
      expect(metrics.likes).toBe(42);
      expect(metrics.comments).toBe(7);
      expect(metrics.shares).toBe(12);
      expect(metrics.clicks).toBe(18);
    });

    it("updates post with retry status on transient failure and failed after max attempts", async () => {
      const failingPost = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "facebook",
        content: { title: "Failing Post", body: "Will fail temporarily" },
        status: "scheduled",
      });

      class AlwaysFailingAdapter extends BaseAdapter {
        constructor() {
          super("facebook");
        }
        async publish() {
          throw new Error("Network timeout: Meta API unresponsive");
        }
      }

      adapterRegistry.register("facebook", new AlwaysFailingAdapter());

      // Simulate attempt 1 of 3
      await expect(
        processPublishJob({
          id: "job_fail_1",
          attemptsMade: 0,
          opts: { maxRetries: 3 },
          data: {
            postId: failingPost.id,
            platform: "facebook",
            content: failingPost.content.body,
            workspaceId: workspace.id,
          },
        })
      ).rejects.toThrow("Network timeout: Meta API unresponsive");

      const afterAttempt1 = await postModel.findById(failingPost.id);
      expect(afterAttempt1.status).toBe("scheduled"); // remains scheduled for retry
      expect(afterAttempt1.errorMessage).toContain("Attempt 1 failed");

      // Simulate attempt 3 of 3 (final attempt)
      await expect(
        processPublishJob({
          id: "job_fail_3",
          attemptsMade: 2,
          opts: { maxRetries: 3 },
          data: {
            postId: failingPost.id,
            platform: "facebook",
            content: failingPost.content.body,
            workspaceId: workspace.id,
          },
        })
      ).rejects.toThrow("Network timeout: Meta API unresponsive");

      const afterAttempt3 = await postModel.findById(failingPost.id);
      expect(afterAttempt3.status).toBe("failed");
      expect(afterAttempt3.errorMessage).toContain("Publishing failed after 3 attempts");
    });

    it("clears errorMessage and marks post published when retry eventually succeeds via BullMQ attempts opt", async () => {
      const recoveringPost = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "linkedin",
        content: { title: "Recovering Post", body: "Fails once then succeeds" },
        status: "scheduled",
      });

      let calls = 0;
      class FlakyAdapter extends BaseAdapter {
        constructor() {
          super("linkedin");
        }
        async publish() {
          calls += 1;
          if (calls === 1) throw new Error("Temporary 429 rate limit");
          return {
            platform: "linkedin",
            externalId: `li_recovered_${recoveringPost.id}`,
            publishedAt: new Date().toISOString(),
          };
        }
        async getMetrics() {
          return { reach: 400, likes: 19, comments: 4, shares: 3, clicks: 27 };
        }
      }

      adapterRegistry.register("linkedin", new FlakyAdapter());

      // Attempt 1 fails with BullMQ-style `attempts: 2` option (not `maxRetries`)
      await expect(
        processPublishJob({
          id: "job_bull_style_1",
          attemptsMade: 0,
          opts: { attempts: 2 },
          data: {
            postId: recoveringPost.id,
            platform: "linkedin",
            content: recoveringPost.content.body,
            workspaceId: workspace.id,
            options: { metricsFollowUpDelayMs: -1 },
          },
        })
      ).rejects.toThrow("Temporary 429 rate limit");

      const mid = await postModel.findById(recoveringPost.id);
      expect(mid.status).toBe("scheduled");
      expect(mid.errorMessage).toContain("Attempt 1 failed");

      // Attempt 2 succeeds -> clears errorMessage and transitions to published
      await processPublishJob({
        id: "job_bull_style_2",
        attemptsMade: 1,
        opts: { attempts: 2 },
        data: {
          postId: recoveringPost.id,
          platform: "linkedin",
          content: recoveringPost.content.body,
          workspaceId: workspace.id,
          options: { metricsFollowUpDelayMs: -1 },
        },
      });

      const recovered = await postModel.findById(recoveringPost.id);
      expect(recovered.status).toBe("published");
      expect(recovered.errorMessage).toBeNull();
      expect(recovered.externalPostId).toBe(`li_recovered_${recoveringPost.id}`);
    });

    it("enqueues follow-up delayed metrics collection and serves GET/POST /posts/:id/metrics", async () => {
      const post = await postModel.create({
        workspaceId: workspace.id,
        authorId: user.id,
        channel: "gbp",
        content: { title: "GBP Metrics Follow-up", body: "Visit our bakery!" },
        status: "scheduled",
      });

      let metricsCalls = 0;
      class ProgressiveGbpAdapter extends BaseAdapter {
        constructor() {
          super("gbp");
        }
        async publish() {
          return {
            platform: "gbp",
            externalId: `gbp_ext_${post.id}`,
            publishedAt: new Date().toISOString(),
          };
        }
        async getMetrics() {
          metricsCalls += 1;
          return {
            reach: 100 * metricsCalls,
            likes: 10 * metricsCalls,
            comments: 1,
            shares: metricsCalls,
            clicks: 15 * metricsCalls,
          };
        }
      }

      adapterRegistry.register("gbp", new ProgressiveGbpAdapter());

      await processPublishJob({
        id: "job_followup_1",
        data: {
          postId: post.id,
          platform: "gbp",
          content: post.content.body,
          workspaceId: workspace.id,
          options: { metricsFollowUpDelayMs: 40 },
        },
      });

      // Wait for follow-up delayed metrics job (~40ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 140));

      const historyBefore = await postMetricsModel.findByPostId(post.id);
      expect(historyBefore.length).toBeGreaterThanOrEqual(2);
      expect(historyBefore[0].reach).toBeGreaterThanOrEqual(100);

      // REST read endpoint
      const getRes = await request(app)
        .get(`/api/v1/posts/${post.id}/metrics`)
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id);
      expect(getRes.status).toBe(200);
      expect(getRes.body.postId).toBe(post.id);
      expect(getRes.body.history.length).toBeGreaterThanOrEqual(2);
      expect(getRes.body.latestMetrics).toBeTruthy();

      // REST refresh endpoint collects an additional snapshot
      const refreshRes = await request(app)
        .post(`/api/v1/posts/${post.id}/metrics/refresh`)
        .set("Authorization", `Bearer ${token}`)
        .set("X-Workspace-Id", workspace.id);
      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.latestMetrics.reach).toBeGreaterThanOrEqual(300);
    });
  });

  describe("BullMQ Redis Queue Integration Mode", () => {
    it("initializes BullMQ queues/workers when REDIS_URL is configured and closes cleanly", async () => {
      const addMock = jest.fn().mockResolvedValue({ id: "bull_job_1" });
      const closeMock = jest.fn().mockResolvedValue(undefined);
      const createdQueues = [];
      const createdWorkers = [];

      const origRedisUrl = process.env.REDIS_URL;
      process.env.REDIS_URL = "redis://127.0.0.1:6379";

      try {
        await jest.isolateModulesAsync(async () => {
          jest.doMock("bullmq", () => ({
            Queue: jest.fn().mockImplementation((name, opts) => {
              const q = { name, opts, add: addMock, close: closeMock };
              createdQueues.push(q);
              return q;
            }),
            Worker: jest.fn().mockImplementation((name, processor, opts) => {
              const w = { name, processor, opts, close: closeMock };
              createdWorkers.push(w);
              return w;
            }),
          }));

          const jobQueue = require("../src/queue/jobQueue");
          const pubProc = jest.fn();
          const metProc = jest.fn();

          jobQueue.initQueues({ processPublishJob: pubProc, processMetricsJob: metProc });
          expect(jobQueue.isBullMqMode()).toBe(true);
          expect(createdQueues.map((q) => q.name)).toEqual(["publish_jobs", "metrics_jobs"]);
          expect(createdWorkers.map((w) => w.name)).toEqual(["publish_jobs", "metrics_jobs"]);

          await jobQueue.enqueuePublishJob(
            { postId: "post_bull_1", platform: "facebook", content: "Hello BullMQ" },
            { delay: 5000, maxRetries: 4, backoff: 1500 }
          );

          expect(addMock).toHaveBeenCalledWith("publish", expect.objectContaining({ postId: "post_bull_1" }), {
            delay: 5000,
            attempts: 4,
            backoff: { type: "exponential", delay: 1500 },
            removeOnComplete: true,
          });

          await jobQueue.enqueueMetricsJob({ postId: "post_bull_1", platform: "facebook" }, { delay: 60000 });
          expect(addMock).toHaveBeenCalledWith(
            "collect_metrics",
            expect.objectContaining({ postId: "post_bull_1" }),
            { delay: 60000, attempts: 2, removeOnComplete: true }
          );

          await jobQueue.closeQueues();
          expect(jobQueue.isBullMqMode()).toBe(false);
          expect(closeMock).toHaveBeenCalledTimes(4);
        });
      } finally {
        if (origRedisUrl === undefined) {
          delete process.env.REDIS_URL;
        } else {
          process.env.REDIS_URL = origRedisUrl;
        }
      }
    });
  });
});
