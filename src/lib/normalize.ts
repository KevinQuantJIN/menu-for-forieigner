import { ALLERGENS } from "./contract";
import type { Allergen, AllergenTag, Dish } from "./contract";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strOrNull(v: unknown): string | null {
  const s = str(v);
  return s ? s : null;
}

function normalizeTextures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const t = str(item);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function normalizeAllergens(raw: unknown): AllergenTag[] {
  if (!Array.isArray(raw)) return [];
  const out: AllergenTag[] = [];
  const seen = new Set<Allergen>();
  for (const a of raw) {
    if (typeof a !== "object" || a === null) continue;
    const t = (a as Record<string, unknown>).type;
    const level = (a as Record<string, unknown>).level;
    if (!(ALLERGENS as readonly string[]).includes(t as string)) continue;
    const type = t as Allergen;
    if (seen.has(type)) continue;
    seen.add(type);
    out.push({
      type,
      level: level === "contains" ? "contains" : "may_contain",
    });
  }
  return out;
}

export function normalizeDish(raw: unknown, id: number): Dish | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const nameCn = str(r.nameCn);
  const name = str(r.name);
  if (!nameCn && !name) return null;

  const spicyNum = typeof r.spicy === "number" ? Math.round(r.spicy) : 0;
  const spicy = Math.min(3, Math.max(0, spicyNum)) as Dish["spicy"];

  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients
        .filter((i): i is string => typeof i === "string" && i.trim() !== "")
        .map((i) => i.trim())
        .slice(0, 8)
    : [];

  return {
    id,
    category: strOrNull(r.category),
    nameCn: nameCn || name,
    pinyin: str(r.pinyin),
    name: name || nameCn,
    description: str(r.description),
    price: strOrNull(r.price),
    spicy,
    vegetarian: r.vegetarian === true,
    allergens: normalizeAllergens(r.allergens),
    textures: normalizeTextures(r.textures),
    ingredients,
    story: strOrNull(r.story),
  };
}
