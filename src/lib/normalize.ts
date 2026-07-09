import { ALLERGENS } from "./contract";
import type { Allergen, AllergenTag, Dish } from "./contract";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strOrNull(v: unknown): string | null {
  const s = str(v);
  return s ? s : null;
}

export function normalizeDish(raw: unknown, id: number): Dish | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const nameCn = str(r.nameCn);
  const name = str(r.name);
  if (!nameCn && !name) return null;

  const spicyNum = typeof r.spicy === "number" ? Math.round(r.spicy) : 0;
  const spicy = Math.min(3, Math.max(0, spicyNum)) as Dish["spicy"];

  const allergens: AllergenTag[] = Array.isArray(r.allergens)
    ? r.allergens.flatMap((a): AllergenTag[] => {
        if (typeof a !== "object" || a === null) return [];
        const t = (a as Record<string, unknown>).type;
        const level = (a as Record<string, unknown>).level;
        if (!(ALLERGENS as readonly string[]).includes(t as string)) return [];
        return [
          {
            type: t as Allergen,
            level: level === "contains" ? "contains" : "may_contain",
          },
        ];
      })
    : [];

  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients.filter((i): i is string => typeof i === "string" && i.trim() !== "")
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
    allergens,
    ingredients,
  };
}
