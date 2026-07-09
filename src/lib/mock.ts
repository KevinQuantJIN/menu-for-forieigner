import { getMockRestaurant } from "./mockData";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* mockModelStream(restaurantId?: unknown): AsyncGenerator<string> {
  const delay = Number(process.env.MOCK_DELAY_MS ?? "80");
  for (const dish of getMockRestaurant(restaurantId).dishes) {
    await sleep(delay);
    const line = JSON.stringify(dish) + "\n";
    const mid = Math.floor(line.length / 2);
    yield line.slice(0, mid);
    yield line.slice(mid);
  }
}
