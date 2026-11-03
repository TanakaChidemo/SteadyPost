const mongoose = require("mongoose");
const { newId, withId } = require("../utils/id");

const postMetricsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId("pm") },
    postId: { type: String, required: true, index: true, ref: "Post" },
    captureTime: { type: Date, default: Date.now, index: true },
    reach: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const PostMetrics = mongoose.models.PostMetrics || mongoose.model("PostMetrics", postMetricsSchema);

async function findByPostId(postId, { limit = 30 } = {}) {
  const docs = await PostMetrics.find({ postId }).sort({ captureTime: -1 }).limit(limit).lean();
  return docs.map(withId);
}

async function getLatestByPostId(postId) {
  return withId(await PostMetrics.findOne({ postId }).sort({ captureTime: -1 }).lean());
}

async function create(data) {
  const doc = await PostMetrics.create(data);
  return withId(doc.toObject());
}

async function getTopPerformingForWorkspace(workspaceId, { limit = 10, channel, metric = "engagement" } = {}) {
  const Post = mongoose.models.Post;
  if (!Post) {
    return { items: [], hasMetrics: false, total: 0, metricUsed: metric };
  }

  const query = { workspaceId, status: "published" };
  if (channel) query.channel = channel;

  const posts = await Post.find(query).sort({ updatedAt: -1 }).limit(100).lean();
  if (!posts || posts.length === 0) {
    return { items: [], hasMetrics: false, total: 0, metricUsed: metric };
  }

  const postIds = posts.map((p) => p._id);
  const allMetrics = await PostMetrics.find({ postId: { $in: postIds } })
    .sort({ captureTime: -1 })
    .lean();

  const latestMetricByPostId = new Map();
  for (const m of allMetrics) {
    if (!latestMetricByPostId.has(m.postId)) {
      latestMetricByPostId.set(m.postId, m);
    }
  }

  const hasMetrics = latestMetricByPostId.size > 0;

  const scoredPosts = posts.map((p) => {
    const m = latestMetricByPostId.get(p._id) || {
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      clicks: 0,
    };

    const likes = Number(m.likes) || 0;
    const comments = Number(m.comments) || 0;
    const shares = Number(m.shares) || 0;
    const clicks = Number(m.clicks) || 0;
    const reach = Number(m.reach) || 0;

    const engagementScore =
      likes * 1 +
      comments * 2 +
      shares * 3 +
      clicks * 1.5 +
      Math.round(reach * 0.05);

    let scoreValue = engagementScore;
    if (metric === "likes") scoreValue = likes;
    else if (metric === "comments") scoreValue = comments;
    else if (metric === "shares") scoreValue = shares;
    else if (metric === "clicks") scoreValue = clicks;
    else if (metric === "reach") scoreValue = reach;

    return {
      ...withId(p),
      metrics: {
        likes,
        comments,
        shares,
        clicks,
        reach,
        engagementScore,
        captureTime: m.captureTime || null,
        hasMetrics: latestMetricByPostId.has(p._id),
      },
      _score: scoreValue,
    };
  });

  if (hasMetrics) {
    scoredPosts.sort((a, b) => b._score - a._score);
  } else {
    scoredPosts.sort((a, b) => {
      const timeA = new Date(a.publishedAt || a.updatedAt || 0).getTime();
      const timeB = new Date(b.publishedAt || b.updatedAt || 0).getTime();
      return timeB - timeA;
    });
  }

  const items = scoredPosts.slice(0, Number(limit) || 10).map(({ _score, ...rest }) => rest);

  return {
    items,
    hasMetrics,
    total: posts.length,
    metricUsed: metric,
  };
}

module.exports = {
  PostMetrics,
  findByPostId,
  getLatestByPostId,
  getTopPerformingForWorkspace,
  create,
};
