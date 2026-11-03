const dataset = require("./fixtures/trendSensitivityDataset.json");
const { checkTrendSensitivity } = require("../src/services/guardrails/sensitivityFilter");

jest.setTimeout(30000);

describe("F09 Trend Sensitivity Filter Benchmark (Evaluation Plan)", () => {
  const sensitiveItems = dataset.filter((d) => d.isSensitive);
  const safeItems = dataset.filter((d) => !d.isSensitive);

  it("verifies dataset integrity (30 sensitive, 30 safe)", () => {
    expect(sensitiveItems.length).toBe(30);
    expect(safeItems.length).toBe(30);
    expect(dataset.length).toBe(60);
  });

  it("evaluates recall on sensitive items and false-alarm rate against 'no filter' baseline", async () => {
    // Baseline: "No filter"
    const baselineRecall = 0.0;
    const baselineFalseAlarmRate = 0.0;

    // Filter evaluation
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

    // Format benchmark report
    const benchmarkReport = [
      "\n==================================================================",
      "       F09 SENSITIVITY FILTER BENCHMARK REPORT (ACCEPTANCE BAR)   ",
      "==================================================================",
      `Total Labelled Examples : ${dataset.length}`,
      `Sensitive Examples      : ${sensitiveItems.length}`,
      `Safe / Benign Examples  : ${safeItems.length}`,
      "------------------------------------------------------------------",
      `Baseline (No Filter)    : Recall = ${(baselineRecall * 100).toFixed(1)}% | False Alarm Rate = ${(baselineFalseAlarmRate * 100).toFixed(1)}%`,
      `Guardrail Filter        : Recall = ${(recall * 100).toFixed(1)}% (${truePositives}/${sensitiveItems.length}) | False Alarm Rate = ${(falseAlarmRate * 100).toFixed(1)}% (${falsePositives}/${safeItems.length})`,
      "------------------------------------------------------------------",
      `Acceptance Criteria     : Recall >= 93% (Passed: ${recall >= 0.93})`,
      `                          False Alarm Rate <= 10% (Passed: ${falseAlarmRate <= 0.10})`,
      "==================================================================\n",
    ].join("\n");

    console.log(benchmarkReport);

    if (missedSensitive.length > 0) {
      console.warn("Missed sensitive items:", missedSensitive.map((m) => m.topic));
    }
    if (falseAlarms.length > 0) {
      console.warn("False alarm items:", falseAlarms.map((f) => ({ topic: f.item.topic, reason: f.res.reason })));
    }

    // Acceptance bar assertions:
    // 1. Recall on sensitive items must be >= 93% (at least 28/30)
    expect(recall).toBeGreaterThanOrEqual(0.93);

    // 2. False-alarm rate on safe items must be <= 10% (no more than 3/30)
    expect(falseAlarmRate).toBeLessThanOrEqual(0.10);
  });
});
