import { describe, expect, it } from "vitest";
import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://test/api/lab/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const csv =
  "menu_id,image_file,dish_order,name_cn,price,note\n" +
  "M001,M001_P01.jpg,1,糖醋里脊,¥69,\n";

describe("POST /api/lab/score", () => {
  it("scores predictions against the uploaded simple CSV", async () => {
    const res = await POST(
      request({
        csv,
        imageNames: ["M001_P01.jpg"],
        predictions: [{ page: 1, ordinal: 1, nameCn: "糖醋里脊", price: "¥69" }],
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      nameRecall: 1,
      hallucinationCount: 0,
      matchedNames: 1,
      priceExact: 1,
    });
  });

  it("rejects CSV image names that do not match uploaded images", async () => {
    const res = await POST(
      request({ csv, imageNames: ["other.jpg"], predictions: [] }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "gold_image_mismatch" });
  });

  it("rejects oversized prediction arrays", async () => {
    const res = await POST(
      request({
        csv,
        imageNames: ["M001_P01.jpg"],
        predictions: Array.from({ length: 5001 }, () => ({
          page: 1,
          ordinal: 1,
          nameCn: "糖醋里脊",
          price: "¥69",
        })),
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "too_many_predictions" });
  });
});
