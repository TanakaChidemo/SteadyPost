const logger = require("../config/logger");
const {
  initQueues: initJobQueues,
  enqueuePublishJob,
  enqueueMetricsJob,
  cancelPublishJob,
  getPublishQueue,
  getMetricsQueue,
  closeQueues,
} = require("./jobQueue");
const { processPublishJob, processMetricsJob } = require("./publishProcessor");

async function initQueues() {
  initJobQueues({
    processPublishJob,
    processMetricsJob,
  });
  logger.info("Publish and metrics queues initialized successfully");
}

// Auto-initialize queues on require so jobs can be enqueued immediately
initQueues().catch((err) => {
  logger.error({ err: err.message }, "Error during queue auto-init");
});

module.exports = {
  InMemoryJobQueue: require("./jobQueue").InMemoryJobQueue,
  initQueues,
  enqueuePublishJob,
  enqueueMetricsJob,
  cancelPublishJob,
  getPublishQueue,
  getMetricsQueue,
  closeQueues,
};
