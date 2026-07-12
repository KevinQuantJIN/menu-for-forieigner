/** Chopstory analyze contract v1 — frozen. Change only with explicit product+eng agreement. */

export const MAX_IMAGES = 9;

/** US Big 9. shellfish = crustacean + mollusk combined. */
export const ALLERGENS = [
  "peanut",
  "tree_nut",
  "egg",
  "dairy",
  "fish",
  "shellfish",
  "soy",
  "gluten",
  "sesame",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export interface AllergenTag {
  type: Allergen;
  level: "contains" | "may_contain";
}

export interface Dish {
  /** Server-assigned order across the merged multi-image menu, 1-based. */
  id: number;
  /** Free-form English section label; identical string for same section within one request. */
  category: string | null;
  nameCn: string;
  pinyin: string;
  name: string;
  description: string;
  /** Menu price as printed; null if absent. */
  price: string | null;
  /** 0 none … 3 hot, calibrated for Western diners. */
  spicy: 0 | 1 | 2 | 3;
  vegetarian: boolean;
  allergens: AllergenTag[];
  /** Free-form short English heads-up tags (offal, fatty, etc.); empty if none. */
  textures: string[];
  ingredients: string[];
  /** Cultural origin; null if unknown — UI hides the whole story block. */
  story: string | null;
}

export const ERROR_CODES = ["not_a_menu", "unreadable", "upstream_error"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type AnalyzeEvent =
  | { type: "dish"; data: Dish }
  | { type: "error"; code: ErrorCode }
  | { type: "done"; total: number };

/** Request-validation failures (HTTP 400 JSON, not NDJSON stream). */
export type RequestErrorCode =
  | "invalid_json"
  | "invalid_images"
  | "too_many_images";
