import { describe, expect, it } from "vitest";

const core = await import("../../scripts/lib/vision-gemini-benchmark-core.mjs");

function dish(id = 1, nameCn = "宫保鸡丁", price: string | null = "¥28") {
  return {
    id,
    category: "Poultry",
    nameCn,
    pinyin: "gōng bǎo jī dīng",
    name: "Kung Pao Chicken",
    description: "Chicken with peanuts.",
    price,
    spicy: 2,
    vegetarian: false,
    allergens: [{ type: "peanut", level: "contains" }],
    textures: ["crunchy"],
    ingredients: ["chicken", "peanuts"],
    story: null,
  };
}

function line(event: unknown): string {
  return `${JSON.stringify(event)}\n`;
}

function streamWithClock(
  steps: Array<{ at: number; text?: string }>,
  setNow: (value: number) => void,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      const step = steps[index++];
      setNow(step.at);
      if (step.text === undefined) controller.close();
      else controller.enqueue(encoder.encode(step.text));
    },
  });
}

describe("benchmark CSV parsing", () => {
  it("parses quoted commas, escaped quotes, CRLF, and BOM", () => {
    const rows = core.parseGoldCsv(
      '\uFEFFmenu_id,image_file,dish_order,name_cn,price,note\r\nM1,p.jpg,1,"鱼香,肉丝",28元,"say ""hi"""\r\n',
    );
    expect(rows).toEqual([
      {
        menuId: "M1",
        imageFile: "p.jpg",
        dishOrder: 1,
        nameCn: "鱼香,肉丝",
        price: "28元",
        note: 'say "hi"',
      },
    ]);
  });

  it.each([
    ["unterminated quote", 'menu_id,image_file,dish_order,name_cn,price,note\nM1,p.jpg,1,"dish,28,'],
    ["wrong column count", "menu_id,image_file,dish_order,name_cn,price,note\nM1,p.jpg,1,dish,28"],
    ["bad dish order", "menu_id,image_file,dish_order,name_cn,price,note\nM1,p.jpg,no,dish,28,"],
  ])("rejects malformed CSV: %s", (_label, csv) => {
    expect(() => core.parseGoldCsv(csv)).toThrow();
  });
});

describe("strict NDJSON state machine", () => {
  it("accepts a valid done stream", () => {
    const machine = core.createNdjsonStateMachine();
    machine.consume(line({ type: "dish", data: dish(1) }));
    machine.consume(line({ type: "done", total: 1 }));
    expect(machine.finish()).toMatchObject({
      valid: true,
      terminal: "done",
      doneTotal: 1,
      invalidJsonLines: 0,
      unknownEvents: 0,
    });
  });

  it.each([
    ["invalid JSON", ["{bad", line({ type: "done", total: 0 })]],
    ["unknown event", [line({ type: "progress" }), line({ type: "done", total: 0 })]],
    ["missing terminal", [line({ type: "dish", data: dish(1) })]],
    ["duplicate terminal", [line({ type: "done", total: 0 }), line({ type: "done", total: 0 })]],
    ["terminal not last", [line({ type: "done", total: 0 }), line({ type: "dish", data: dish(1) })]],
    ["done total mismatch", [line({ type: "dish", data: dish(1) }), line({ type: "done", total: 2 })]],
    ["error with dishes", [line({ type: "dish", data: dish(1) }), line({ type: "error", code: "upstream_error" })]],
    ["unknown error", [line({ type: "error", code: "provider_secret" })]],
    ["missing type", [line({ foo: "bar" }), line({ type: "done", total: 0 })]],
    ["invalid dish shape", [line({ type: "dish", data: { nameCn: "宫保鸡丁" } }), line({ type: "done", total: 0 })]],
  ])("rejects %s", (_label, lines) => {
    const machine = core.createNdjsonStateMachine();
    lines.forEach((value) => machine.consume(value));
    expect(machine.finish().valid).toBe(false);
  });

  it("accepts a valid error terminal only when there are no dishes", () => {
    const machine = core.createNdjsonStateMachine();
    machine.consume(line({ type: "error", code: "unreadable" }));
    expect(machine.finish()).toMatchObject({ valid: true, terminal: "error", errorCode: "unreadable" });
  });
});

describe("stream parsing and one-clock timing", () => {
  it("handles split JSON, multiple lines per chunk, and a final line without newline", async () => {
    let now = 100;
    const validDish = line({ type: "dish", data: dish(1) });
    const midpoint = Math.floor(validDish.length / 2);
    const body = streamWithClock(
      [
        { at: 150, text: validDish.slice(0, midpoint) },
        { at: 150, text: `${validDish.slice(midpoint)}\n` },
        { at: 170, text: JSON.stringify({ type: "done", total: 1 }) },
        { at: 170 },
      ],
      (value) => {
        now = value;
      },
    );

    const result = await core.consumeNdjsonBody(body, {
      requestStart: 0,
      headerAt: 100,
      now: () => now,
    });

    expect(result.protocol.valid).toBe(true);
    expect(result.protocol.dishes).toHaveLength(1);
    expect(result.timing).toEqual({ headerMs: 100, firstDishMs: 150, totalMs: 170 });
    expect(result.timingValid).toBe(true);
  });

  it("keeps firstDishMs null for an error terminal", async () => {
    let now = 50;
    const body = streamWithClock(
      [{ at: 80, text: line({ type: "error", code: "not_a_menu" }) }, { at: 90 }],
      (value) => {
        now = value;
      },
    );
    const result = await core.consumeNdjsonBody(body, { requestStart: 0, headerAt: 50, now: () => now });
    expect(result.protocol.valid).toBe(true);
    expect(result.timing).toEqual({ headerMs: 50, firstDishMs: null, totalMs: 90 });
  });

  it.each([
    [{ headerMs: 10, firstDishMs: 9, totalMs: 20 }, false],
    [{ headerMs: 10, firstDishMs: 21, totalMs: 20 }, false],
    [{ headerMs: 21, firstDishMs: null, totalMs: 20 }, false],
    [{ headerMs: 10, firstDishMs: 15, totalMs: 20 }, true],
  ])("validates timing invariant %#", (timing, expected) => {
    expect(core.validateTiming(timing).valid).toBe(expected);
  });
});

describe("benchmark scoring and ordering", () => {
  const gold = [
    { menuId: "M", imageFile: "p1.jpg", dishOrder: 1, nameCn: "A", price: "10", note: "" },
    { menuId: "M", imageFile: "p1.jpg", dishOrder: 2, nameCn: "B", price: "20", note: "" },
    { menuId: "M", imageFile: "p2.jpg", dishOrder: 1, nameCn: "C", price: "30", note: "" },
    { menuId: "M", imageFile: "p2.jpg", dishOrder: 2, nameCn: "D", price: "40", note: "" },
  ];

  it("matches names one-to-one and counts prices, misses, and hallucinations", () => {
    const score = core.scorePage(
      [{ nameCn: "A", price: "10" }, { nameCn: "B", price: "wrong" }, { nameCn: "X", price: null }],
      gold,
      "p1.jpg",
    );
    expect(score).toMatchObject({
      goldCount: 2,
      predictionCount: 3,
      matchedNames: 2,
      hallucinationCount: 1,
      priceCompared: 2,
      priceMatched: 1,
    });
  });

  it("reports within-page inversions and Kendall-style score", () => {
    expect(core.scoreWithinPageOrder([{ goldIndex: 1 }, { goldIndex: 0 }, { goldIndex: 2 }])).toMatchObject({
      comparablePairs: 3,
      inversions: 1,
      orderOk: false,
    });
  });

  it("separates within-page inversions from cross-page boundary violations", () => {
    const withinOnly = core.scoreMultiPageOrder(
      [{ nameCn: "B" }, { nameCn: "A" }, { nameCn: "C" }, { nameCn: "D" }],
      gold,
      ["p1.jpg", "p2.jpg"],
    );
    expect(withinOnly).toMatchObject({
      crossPageBoundaryViolations: 0,
      crossPageOrderOk: true,
      withinPageInversions: 1,
    });

    const boundaryOnly = core.scoreMultiPageOrder(
      [{ nameCn: "A" }, { nameCn: "C" }, { nameCn: "B" }, { nameCn: "D" }],
      gold,
      ["p1.jpg", "p2.jpg"],
    );
    expect(boundaryOnly).toMatchObject({
      crossPageBoundaryViolations: 1,
      crossPageOrderOk: false,
      withinPageInversions: 0,
    });
    expect(boundaryOnly.crossPageBoundaryDetails).toHaveLength(1);
  });

  it("prefers a monotonic page assignment for duplicate names", () => {
    const duplicateGold = [
      ...gold,
      { menuId: "M", imageFile: "p2.jpg", dishOrder: 3, nameCn: "B", price: "50", note: "" },
    ];
    const result = core.scoreMultiPageOrder(
      [{ nameCn: "A" }, { nameCn: "C" }, { nameCn: "B" }, { nameCn: "D" }],
      duplicateGold,
      ["p1.jpg", "p2.jpg"],
    );
    expect(result.crossPageBoundaryViolations).toBe(0);
  });

  it("does not let an earlier extra duplicate consume a later-page gold match", () => {
    const duplicatePredictionGold = [
      { menuId: "M", imageFile: "p1.jpg", dishOrder: 1, nameCn: "A", price: "10", note: "" },
      { menuId: "M", imageFile: "p1.jpg", dishOrder: 2, nameCn: "X", price: "20", note: "" },
      { menuId: "M", imageFile: "p2.jpg", dishOrder: 1, nameCn: "B", price: "30", note: "" },
      { menuId: "M", imageFile: "p2.jpg", dishOrder: 2, nameCn: "C", price: "40", note: "" },
    ];
    const result = core.scoreMultiPageOrder(
      [{ nameCn: "A" }, { nameCn: "B" }, { nameCn: "X" }, { nameCn: "B" }, { nameCn: "C" }],
      duplicatePredictionGold,
      ["p1.jpg", "p2.jpg"],
    );
    expect(result.crossPageBoundaryViolations).toBe(0);
    expect(result.matchedItems).toBe(4);
  });
});

describe("benchmark utilities", () => {
  it("mapPool bounds concurrency and preserves output order", async () => {
    let active = 0;
    let maxActive = 0;
    const result = await core.mapPool([30, 5, 20, 1], 2, async (delay: number, index: number) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return index;
    });
    expect(result).toEqual([0, 1, 2, 3]);
    expect(maxActive).toBe(2);
  });

  it("computes percentiles for empty, single, and even samples", () => {
    expect(core.percentile([], 0.5)).toBeNull();
    expect(core.percentile([7], 0.95)).toBe(7);
    expect(core.percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(core.percentile([1, 2, 3, 4], 0.95)).toBeCloseTo(3.85);
  });

  it("resolves output extensions without producing .json.md", () => {
    expect(core.resolveOutputPaths("/tmp/run.json")).toEqual({
      jsonPath: "/tmp/run.json",
      markdownPath: "/tmp/run.md",
    });
    expect(core.resolveOutputPaths("/tmp/run.md")).toEqual({
      jsonPath: "/tmp/run.json",
      markdownPath: "/tmp/run.md",
    });
  });

  it("hashes deterministically and removes credentials/query from base URLs", () => {
    expect(core.sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const sanitized = core.sanitizeBaseUrl("https://user:secret@example.com/path?key=AIza-secret#token");
    expect(sanitized).toBe("https://example.com/path");
    expect(sanitized).not.toContain("secret");
    expect(sanitized).not.toContain("key=");
  });

  it("aggregates only compatible strict runs and uses percentage points for baseline deltas", () => {
    const run = (label: string, recall: number) => ({
      meta: {
        schemaVersion: core.BENCHMARK_SCHEMA_VERSION,
        harnessVersion: core.HARNESS_VERSION,
        runLabel: label,
        mock: false,
        harness: { cliSha256: "a", coreSha256: "b" },
        model: { name: "gemini-2.5-flash", generationConfig: { temperature: 0.2 } },
        dataset: {
          goldCsvSha256: "gold",
          images: [{ file: "x.jpg", sha256: "image" }],
        },
      },
      aggregate: {
        totalImages: 14,
        imagesCompleted: 14,
        multiPageCompleted: 2,
        multiPageTotal: 2,
        invalidJsonLines: 0,
        unknownEvents: 0,
        protocolInvalidRuns: 0,
        timingInvalidRuns: 0,
        crossPageBoundaryViolations: 0,
        nameRecall: recall,
        namePrecision: 0.8,
        priceExact: 0.7,
        hallucinationCount: 10,
        hallucinationRate: 0.1,
        withinPageInversions: 2,
        totalLatencyP50: 100,
        totalLatencyP95: 200,
        firstDishP50: 80,
        firstDishP95: 150,
      },
    });
    const aggregate = core.aggregateBenchmarkRuns(
      [run("run1", 0.8), run("run2", 0.9), run("run3", 1)],
      { aggregate: { nameRecall: 0.7, namePrecision: 0.75, priceExact: 0.65, hallucinationCount: 12 } },
    );
    expect(aggregate.allHardGatesPassed).toBe(true);
    expect(aggregate.quality.nameRecall.mean).toBeCloseTo(0.9);
    expect(aggregate.deltaVsLegacySingleRun!.nameRecallPp).toBeCloseTo(20);
    expect(aggregate.deltaVsLegacySingleRun!.hallucinationCountDelta).toBeCloseTo(-2);
    expect(core.buildReadinessMarkdown(aggregate)).toContain("Engineering hard-gate status: PASS");
    expect(core.buildReadinessMarkdown(aggregate)).toContain(
      "hallucination count -2.00 dishes (higher is worse)",
    );

    const incompatible = run("bad", 0.9);
    incompatible.meta.harness.cliSha256 = "different";
    expect(() => core.aggregateBenchmarkRuns([run("1", 0.8), run("2", 0.8), incompatible])).toThrow("mixed_cli_hashes");

    const failed = run("failed", 0.9);
    failed.aggregate.imagesCompleted = 13;
    expect(() => core.aggregateBenchmarkRuns([run("1", 0.8), run("2", 0.8), failed])).toThrow("run_failed_hard_gates:failed");
  });
});
