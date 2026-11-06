const devDataset = require("./fixtures/trendSensitivityDataset.json");
const heldOutDataset = require("./fixtures/trendSensitivityHeldOut.json");
const { checkTrendSensitivity } = require("../src/services/guardrails/sensitivityFilter");

jest.setTimeout(30000);

async function evaluateSplit(items) {
  const sensitiveItems = items.filter((d) => d.isSensitive);
  const safeItems = items.filter((d) => !d.isSensitive);

  let truePositives = 0;
  let falseNegatives = 0;
  const missedSensitive = [];

  for (const item of sensitiveItems) {
    const res = await checkTrendSensitivity({ topic: item.topic, snippet: item.snippet });
    if (res.isSensitive) {
      truePositives++;
    } else {
      falseNegatives++;
      missedSensitive.push(item);
    }
  }

  let falsePositives = 0;
  let trueNegatives = 0;
  const falseAlarms = [];

  for (const item of safeItems) {
    const res = await checkTrendSensitivity({ topic: item.topic, snippet: item.snippet });
    if (res.isSensitive) {
      falsePositives++;
      falseAlarms.push({ item, res });
    } else {
      trueNegatives++;
    }
  }

  const recall = truePositives / sensitiveItems.length;
  const falseAlarmRate = falsePositives / safeItems.length;

  return {
    total: items.length,
    sensitiveCount: sensitiveItems.length,
    safeCount: safeItems.length,
    truePositives,
    falseNegatives,
    falsePositives,
    trueNegatives,
    recall,
    falseAlarmRate,
    missedSensitive,
    falseAlarms,
  };
}

describe("F09 Trend Sensitivity Filter Benchmark (Evaluation Plan)", () => {
  it("verifies dataset integrity for both development (60) and held-out real-world (40) sets", () => {
    expect(devDataset.filter((d) => d.isSensitive).length).toBe(30);
    expect(devDataset.filter((d) => !d.isSensitive).length).toBe(30);
    expect(devDataset.length).toBe(60);

    expect(heldOutDataset.filter((d) => d.isSensitive).length).toBe(20);
    expect(heldOutDataset.filter((d) => !d.isSensitive).length).toBe(20);
    expect(heldOutDataset.length).toBe(40);
  });

  it("evaluates recall and false-alarm rate on both tuning set and independent held-out real-world headlines", async () => {
    const baselineRecall = 0.0;
    const baselineFalseAlarmRate = 0.0;

    const devMetrics = await evaluateSplit(devDataset);
    const heldOutMetrics = await evaluateSplit(heldOutDataset);

    const benchmarkReport = [
      "\n==================================================================",
      "       F09 SENSITIVITY FILTER BENCHMARK REPORT (ACCEPTANCE BAR)   ",
      "==================================================================",
      `Baseline (No Filter)    : Recall = ${(baselineRecall * 100).toFixed(1)}% | False Alarm Rate = ${(baselineFalseAlarmRate * 100).toFixed(1)}%`,
      "------------------------------------------------------------------",
      `[1] Development / Tuning Set (${devMetrics.total} examples: ${devMetrics.sensitiveCount} sensitive, ${devMetrics.safeCount} safe)`,
      `    Recall              : ${(devMetrics.recall * 100).toFixed(1)}% (${devMetrics.truePositives}/${devMetrics.sensitiveCount})`,
      `    False Alarm Rate    : ${(devMetrics.falseAlarmRate * 100).toFixed(1)}% (${devMetrics.falsePositives}/${devMetrics.safeCount})`,
      "------------------------------------------------------------------",
      `[2] Held-Out Real-World Set (${heldOutMetrics.total} examples: ${heldOutMetrics.sensitiveCount} sensitive, ${heldOutMetrics.safeCount} safe)`,
      `    Recall              : ${(heldOutMetrics.recall * 100).toFixed(1)}% (${heldOutMetrics.truePositives}/${heldOutMetrics.sensitiveCount})`,
      `    False Alarm Rate    : ${(heldOutMetrics.falseAlarmRate * 100).toFixed(1)}% (${heldOutMetrics.falsePositives}/${heldOutMetrics.safeCount})`,
      `    Missed Held-Out     : ${heldOutMetrics.missedSensitive.map((m) => m.id).join(", ") || "none"}`,
      `    False Alarms        : ${heldOutMetrics.falseAlarms.map((f) => f.item.id).join(", ") || "none"}`,
      "==================================================================\n",
    ].join("\n");

    console.log(benchmarkReport);

    // Development set bar
    expect(devMetrics.recall).toBeGreaterThanOrEqual(0.90);
    expect(devMetrics.falseAlarmRate).toBeLessThanOrEqual(0.10);

    // Held-out real-world headline set bar (honest generalization without overfitting)
    expect(heldOutMetrics.recall).toBeGreaterThanOrEqual(0.70);
    expect(heldOutMetrics.falseAlarmRate).toBeLessThanOrEqual(0.10);
  });
});
