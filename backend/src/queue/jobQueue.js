const EventEmitter = require("events");
const logger = require("../config/logger");

let BullQueue = null;
let BullWorker = null;
try {
  const bullmq = require("bullmq");
  BullQueue = bullmq.Queue;
  BullWorker = bullmq.Worker;
} catch (e) {
  // Optional if bullmq is not used
}

class InMemoryJobQueue extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.timers = new Map();
    this.jobs = new Map();
    this.processor = null;
  }

  setProcessor(processorFn) {
    this.processor = processorFn;
  }

  async add(jobName, data, opts = {}) {
    const delay = typeof opts.delay === "number" && !isNaN(opts.delay) ? Math.max(0, opts.delay) : 0;
    const maxRetries = typeof opts.maxRetries === "number" ? opts.maxRetries : 3;
    const backoff = typeof opts.backoff === "number" ? opts.backoff : 1000;
    const jobId = opts.jobId || `job_${this.name}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const job = {
      id: jobId,
      name: jobName,
      data,
      attemptsMade: opts.attemptsMade || 0,
      opts: { ...opts, delay, maxRetries, backoff },
      status: "waiting",
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);

    const execute = async () => {
      this.timers.delete(jobId);
      if (data.postId) {
        this.timers.delete(data.postId);
      }

      job.status = "active";
      job.processedAt = new Date();

      try {
        if (!this.processor) {
          throw new Error(`No processor registered for queue: ${this.name}`);
        }
        const result = await this.processor(job);
        job.status = "completed";
        job.result = result;
        this.emit("completed", job, result);
        return result;
      } catch (err) {
        job.attemptsMade += 1;
        job.lastError = err.message;

        if (job.attemptsMade < maxRetries) {
          job.status = "retrying";
          const retryDelay = backoff * Math.pow(2, job.attemptsMade - 1);
          logger.warn(
            { queue: this.name, jobId, attemptsMade: job.attemptsMade, maxRetries, retryDelay, err: err.message },
            "Job failed, scheduling retry with backoff"
          );

          this.emit("retrying", job, err, retryDelay);

          const retryTimer = setTimeout(execute, retryDelay);
          if (typeof retryTimer.unref === "function") {
            retryTimer.unref();
          }
          this.timers.set(jobId, retryTimer);
          if (data.postId) {
            this.timers.set(data.postId, retryTimer);
          }
        } else {
          job.status = "failed";
          logger.error(
            { queue: this.name, jobId, attemptsMade: job.attemptsMade, maxRetries, err: err.message },
            "Job failed permanently after max retries"
          );
          this.emit("failed", job, err);
        }
      }
    };

    if (delay === 0) {
      setImmediate(execute);
    } else {
      const timer = setTimeout(execute, delay);
      if (typeof timer.unref === "function") {
        timer.unref();
      }
      this.timers.set(jobId, timer);
      if (data.postId) {
        this.timers.set(data.postId, timer);
      }
    }

    return job;
  }

  cancel(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
      const job = this.jobs.get(key);
      if (job) job.status = "cancelled";
      return true;
    }
    return false;
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.jobs.clear();
  }
}

// Global queue instances
let publishQueueInstance = null;
let metricsQueueInstance = null;
let isRedisBullMode = false;

function initQueues({ processPublishJob, processMetricsJob } = {}) {
  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST;

  if (BullQueue && BullWorker && (redisUrl || redisHost)) {
    try {
      const connection = redisUrl ? { url: redisUrl } : { host: redisHost, port: process.env.REDIS_PORT || 6379 };
      publishQueueInstance = new BullQueue("publish_jobs", { connection });
      metricsQueueInstance = new BullQueue("metrics_jobs", { connection });

      if (processPublishJob) {
        new BullWorker("publish_jobs", processPublishJob, { connection });
      }
      if (processMetricsJob) {
        new BullWorker("metrics_jobs", processMetricsJob, { connection });
      }

      isRedisBullMode = true;
      logger.info("BullMQ queue initialized with Redis backend");
      return;
    } catch (err) {
      logger.warn({ err: err.message }, "Failed to connect BullMQ to Redis, falling back to In-Memory Job Queue");
    }
  }

  // Fallback to In-Memory Queue
  isRedisBullMode = false;
  publishQueueInstance = new InMemoryJobQueue("publish_jobs");
  metricsQueueInstance = new InMemoryJobQueue("metrics_jobs");

  if (processPublishJob) {
    publishQueueInstance.setProcessor(processPublishJob);
  }
  if (processMetricsJob) {
    metricsQueueInstance.setProcessor(processMetricsJob);
  }

  logger.info("In-memory publish & metrics job queue initialized");
}

/**
 * Enqueue a scheduled or immediate publish job with retry support.
 * @param {Object} payload - { postId, platform, content, mediaUrls, hashtags, socialAccountId, workspaceId, options }
 * @param {Object} opts - { delay, maxRetries, backoff }
 */
async function enqueuePublishJob(payload, opts = {}) {
  if (!publishQueueInstance) {
    initQueues();
  }

  const delay = typeof opts.delay === "number" && !isNaN(opts.delay) ? Math.max(0, opts.delay) : 0;
  const maxRetries = typeof opts.maxRetries === "number" ? opts.maxRetries : 3;
  const backoff = typeof opts.backoff === "number" ? opts.backoff : 1000;

  if (isRedisBullMode) {
    return publishQueueInstance.add("publish", payload, {
      delay,
      attempts: maxRetries,
      backoff: { type: "exponential", delay: backoff },
      removeOnComplete: true,
    });
  }

  return publishQueueInstance.add("publish", payload, {
    delay,
    maxRetries,
    backoff,
    jobId: `pub_${payload.postId}_${Date.now()}`,
  });
}

/**
 * Enqueue a metrics collection job.
 * @param {Object} payload - { postId, externalPostId, platform, socialAccountId, workspaceId }
 * @param {Object} opts - { delay, maxRetries }
 */
async function enqueueMetricsJob(payload, opts = {}) {
  if (!metricsQueueInstance) {
    initQueues();
  }

  const delay = typeof opts.delay === "number" && !isNaN(opts.delay) ? Math.max(0, opts.delay) : 0;
  const maxRetries = typeof opts.maxRetries === "number" ? opts.maxRetries : 2;

  if (isRedisBullMode) {
    return metricsQueueInstance.add("collect_metrics", payload, {
      delay,
      attempts: maxRetries,
      removeOnComplete: true,
    });
  }

  return metricsQueueInstance.add("collect_metrics", payload, {
    delay,
    maxRetries,
    jobId: `metrics_${payload.postId}_${Date.now()}`,
  });
}

/**
 * Cancel a scheduled publish job by post ID or job ID.
 * @param {string} key
 */
function cancelPublishJob(key) {
  if (publishQueueInstance && typeof publishQueueInstance.cancel === "function") {
    return publishQueueInstance.cancel(key);
  }
  return false;
}

function getPublishQueue() {
  return publishQueueInstance;
}

function getMetricsQueue() {
  return metricsQueueInstance;
}

function closeQueues() {
  if (publishQueueInstance && typeof publishQueueInstance.clear === "function") {
    publishQueueInstance.clear();
  }
  if (metricsQueueInstance && typeof metricsQueueInstance.clear === "function") {
    metricsQueueInstance.clear();
  }
}

module.exports = {
  InMemoryJobQueue,
  initQueues,
  enqueuePublishJob,
  enqueueMetricsJob,
  cancelPublishJob,
  getPublishQueue,
  getMetricsQueue,
  closeQueues,
};
