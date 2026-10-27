const BaseAdapter = require("./BaseAdapter");

class TwitterAdapter extends BaseAdapter {
  constructor() {
    super("twitter");
  }

  isLiveAccount(account) {
    return Boolean(
      account &&
      account.accessToken &&
      account.externalAccountId &&
      !account.isMock &&
      (process.env.TWITTER_API_KEY || process.env.TWITTER_BEARER_TOKEN)
    );
  }

  formatTweetText(content = "", hashtags = []) {
    let text = content.trim();
    if (hashtags && hashtags.length > 0) {
      const tags = hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
      if (!text.includes(tags)) {
        text = `${text}\n\n${tags}`.trim();
      }
    }
    // Limit to 280 characters for Twitter
    if (text.length > 280) {
      text = text.substring(0, 277) + "...";
    }
    return text;
  }

  async publish({ postId, content, _mediaUrls = [], hashtags = [], account }) {
    const isLive = this.isLiveAccount(account);

    if (!isLive) {
      this.logger.info({ postId }, "Publishing via Twitter Sandbox Simulator");
      const fakeId = `tweet_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      return {
        platform: "twitter",
        externalId: fakeId,
        url: `https://twitter.com/i/status/${fakeId}`,
        simulated: true,
        publishedAt: new Date().toISOString(),
      };
    }

    const tweetText = this.formatTweetText(content, hashtags);

    try {
      const response = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${account.accessToken}`,
        },
        body: JSON.stringify({
          text: tweetText,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(`Twitter publish failed: ${JSON.stringify(data)}`);
      }

      return {
        platform: "twitter",
        externalId: data.data?.id,
        url: `https://twitter.com/i/status/${data.data?.id}`,
        raw: data,
        publishedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error({ err: err.message, postId }, "Twitter API call failed");
      throw err;
    }
  }

  async getMetrics({ externalPostId, account }) {
    const isLive = this.isLiveAccount(account);

    if (!isLive || !externalPostId) {
      const likes = Math.floor(Math.random() * 25) + 3;
      const retweets = Math.floor(Math.random() * 8);
      const comments = Math.floor(Math.random() * 5);
      const clicks = Math.floor(Math.random() * 15) + 1;
      const reach = (likes + retweets + comments) * 15 + Math.floor(Math.random() * 100);

      return {
        reach,
        likes,
        comments,
        shares: retweets,
        clicks,
        simulated: true,
      };
    }

    try {
      const url = `https://api.twitter.com/2/tweets/${externalPostId}?tweet.fields=public_metrics`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`Twitter metrics fetch failed: ${JSON.stringify(data)}`);
      }

      const m = data.data?.public_metrics || {};
      const likes = m.like_count || 0;
      const shares = (m.retweet_count || 0) + (m.quote_count || 0);
      const comments = m.reply_count || 0;
      const reach = m.impression_count || (likes + shares + comments) * 20;
      const clicks = m.url_link_clicks || 0;

      return { reach, likes, comments, shares, clicks, raw: data, simulated: false };
    } catch (err) {
      this.logger.warn({ err: err.message, externalPostId }, "Failed to fetch live Twitter metrics");
      return { reach: 15, likes: 3, comments: 1, shares: 0, clicks: 1, simulated: true };
    }
  }
}

module.exports = TwitterAdapter;
