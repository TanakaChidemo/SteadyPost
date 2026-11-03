const { setupTestDB, teardownTestDB } = require("./testHelpers");
const { InMemoryJobQueue, enqueuePublishJob, cancelPublishJob, closeQueues } = require("../src/queue");
const { processPublishJob } = require("../src/queue/publishProcessor");
const { adapterRegistry } = require("../src/services/publishers/adapterRegistry");
const BaseAdapter = require("../src/services/publishers/BaseAdapter");
const postModel = require("../src/models/post.model");
const postMetricsModel = require("../src/models/postMetrics.model");
const workspaceModel = require("../src/models/workspace.model");
const userModel = require("../src/models/user.model");

jest.setTimeout(30000);

describe("Job Queue, Retries & Metrics Collection Tests (#10)", () => {
  let user, workspace;

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
  });

  afterAll(async () => {
    closeQueues();
    if (workspace) {
      await workspaceModel.deleteOne({ _id: workspace.id });
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
  });
});
