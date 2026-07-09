export const LANGS = ["en", "ja", "ko", "es", "fr"] as const;
export type Lang = (typeof LANGS)[number];

export const ALLERGENS = [
  "peanut",
  "tree_nut",
  "gluten",
  "soy",
  "dairy",
  "egg",
  "fish",
  "shellfish",
  "sesame",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export interface AllergenTag {
  type: Allergen;
  level: "contains" | "may_contain";
}

export interface Dish {
  id: number;
  category: string | null;
  nameCn: string;
  pinyin: string;
  name: string;
  description: string;
  price: string | null;
  spicy: 0 | 1 | 2 | 3;
  vegetarian: boolean;
  allergens: AllergenTag[];
  ingredients: string[];
}

export const ERROR_CODES = ["not_a_menu", "unreadable", "upstream_error"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type AnalyzeEvent =
  | { type: "dish"; data: Dish }
  | { type: "error"; code: ErrorCode }
  | { type: "done"; total: number };
