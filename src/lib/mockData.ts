import type { AllergenTag, Dish } from "./contract";

export const MOCK_RESTAURANT_IDS = ["mawangzi", "lei-garden", "beijing-cuisine"] as const;
export type MockRestaurantId = (typeof MOCK_RESTAURANT_IDS)[number];

export interface MockRestaurant {
  id: MockRestaurantId;
  name: string;
  cuisine: string;
  dishes: Omit<Dish, "id">[];
}

type Row = [category: string, nameCn: string, price: string];

interface DishHints {
  name?: string;
  description?: string;
  pinyin?: string;
  spicy?: 0 | 1 | 2 | 3;
  vegetarian?: boolean;
  allergens?: AllergenTag[];
  ingredients?: string[];
  textures?: string[];
  story?: string | null;
}

function hints(nameCn: string): DishHints {
  if (nameCn.includes("豆腐")) return { allergens: [{ type: "soy", level: "contains" }], ingredients: ["tofu", "sauce"] };
  if (nameCn.includes("面") || nameCn.includes("饼") || nameCn.includes("包") || nameCn.includes("糕") || nameCn.includes("粉皮")) {
    return { allergens: [{ type: "gluten", level: "contains" }], ingredients: ["wheat or starch", "seasoning"] };
  }
  if (nameCn.includes("虾") || nameCn.includes("蟹") || nameCn.includes("龙虾") || nameCn.includes("蛤蜊") || nameCn.includes("蚝") || nameCn.includes("蛏")) {
    return { allergens: [{ type: "shellfish", level: "contains" }], ingredients: ["shellfish", "seasoning"] };
  }
  if (nameCn.includes("鱼") || nameCn.includes("鲍") || nameCn.includes("花胶") || nameCn.includes("鱼翅")) {
    return { allergens: [{ type: "fish", level: "contains" }], ingredients: ["fish or seafood", "seasoning"] };
  }
  if (nameCn.includes("芝麻")) return { allergens: [{ type: "sesame", level: "contains" }], ingredients: ["sesame", "vegetables"] };
  if (nameCn.includes("蛋")) return { allergens: [{ type: "egg", level: "contains" }], ingredients: ["egg", "seasoning"] };
  return {};
}

function spicyLevel(nameCn: string): 0 | 1 | 2 | 3 {
  if (/(麻辣|毛血旺|水煮|麻婆|藤椒|鲜花椒|双椒)/.test(nameCn)) return 3;
  if (/(辣|椒|红油|担担|口水|酸辣|川汁|热卤)/.test(nameCn)) return 2;
  return 0;
}

function isVegetarian(category: string, nameCn: string): boolean {
  if (/(肉|鸡|鸭|鹅|鱼|虾|蟹|鲍|蚝|蛤|牛|羊|猪|肚|血|鳝|蛏|鸽|翅|海参|花胶|排骨|肥肠|毛肚|龙虾)/.test(nameCn)) return false;
  return /(素菜|甜品|饮品)/.test(category) || /(青瓜|萝卜|白菜|豆腐|豆角|四季豆|豌豆|丝瓜|菠菜|时蔬|凉粉|冰粉|茶|汁|酸梅汤|杏仁|核桃|银杏|山药|糖油饼|果子|年糕)/.test(nameCn);
}

function makeDish(cuisine: string, [category, nameCn, price]: Row, override: DishHints = {}): Omit<Dish, "id"> {
  const auto = hints(nameCn);
  return {
    category,
    nameCn,
    pinyin: override.pinyin ?? "",
    name: override.name ?? nameCn,
    description:
      override.description ??
      `A ${cuisine} menu item from the reference screenshots. Use the Chinese name and price as the source of truth.`,
    price,
    spicy: override.spicy ?? spicyLevel(nameCn),
    vegetarian: override.vegetarian ?? isVegetarian(category, nameCn),
    allergens: override.allergens ?? auto.allergens ?? [],
    textures: override.textures ?? [],
    ingredients: override.ingredients ?? auto.ingredients ?? [nameCn, "seasoning"],
    story: override.story ?? null,
  };
}

const mawangziRows: Row[] = [
  ["Signature Dishes", "砂锅美蛙", "¥148"],
  ["Signature Dishes", "锅巴肉片", "¥68"],
  ["Signature Dishes", "老檀花椒鲈鱼", "¥118"],
  ["Signature Dishes", "椒香盐菜虾", "¥138"],
  ["Signature Dishes", "酸汤花枝煲", "¥56"],
  ["Signature Dishes", "大头菜川汁鲍鱼", "¥88"],
  ["Signature Dishes", "手撕藤椒鸡", "¥79"],
  ["Signature Dishes", "夫妻肺片", "¥79"],
  ["Signature Dishes", "口水鸡", "¥79"],
  ["Signature Dishes", "肝腰合炒", "¥68"],
  ["Signature Dishes", "蒜泥白肉", "¥59"],
  ["Signature Dishes", "回锅肉", "¥56"],
  ["Signature Dishes", "柠檬土鸡爪", "¥79"],
  ["Signature Dishes", "老坛花椒鱼", "¥148"],
  ["Signature Dishes", "双椒雪花牛肉粒", "¥168"],
  ["Signature Dishes", "酥脆咸烧白", "¥48"],
  ["Signature Dishes", "豆瓣鱼", "¥158"],
  ["Signature Dishes", "鱼香肉丝", "¥68"],
  ["Signature Dishes", "糖醋排骨", "¥89"],
  ["Signature Dishes", "水煮牛肉", "¥98"],
  ["Signature Dishes", "毛血旺", "¥118"],
  ["Signature Dishes", "宫保茄香虾球", "¥118"],
  ["Signature Dishes", "甜皮鹅", "¥79"],
  ["Vegetables", "冷灼桑椹尖", "¥39"],
  ["Vegetables", "青豆油丝瓜", "¥42"],
  ["Vegetables", "清炒豌豆尖", "¥59"],
  ["Vegetables", "清炒丝瓜尖", "¥39"],
  ["Vegetables", "风味萝卜", "¥29"],
  ["Vegetables", "豌杂奶白菜", "¥58"],
  ["Vegetables", "麻婆豆腐", "¥49"],
  ["Vegetables", "糊辣儿菜", "¥39"],
  ["Vegetables", "椒汁浸苦瓜", "¥39"],
  ["Vegetables", "热拌油泼香干", "¥39"],
  ["Desserts", "青汁豆泥", "¥39起"],
  ["Desserts", "冰粉", "¥12"],
  ["Snacks", "秘制爽口萝卜", "¥29"],
  ["Snacks", "四川热卤", "¥89"],
  ["Snacks", "夫妻肺片拼旋子凉粉", "¥79"],
  ["Snacks", "糖油果子", "¥5"],
  ["Snacks", "旋子凉粉", "¥28"],
  ["Snacks", "油鸡枞拌辣木苗", "¥69"],
  ["Snacks", "皮蛋双拼", "¥39"],
  ["Snacks", "焦糖荔枝年糕", "¥19"],
  ["Soups", "骨汤冬寒尖", "¥69"],
  ["Soups", "鸡豆花", "¥22"],
  ["Staples", "鲜肉软锅盔", "¥28"],
  ["Staples", "凉面", "¥39"],
  ["Staples", "红油水饺", "¥12"],
  ["Staples", "担担面", "¥13"],
  ["Staples", "川西腊味拌饭", "¥68"],
  ["Staples", "玉米粑粑", "¥5"],
  ["Drinks", "赣南鲜橙汁", "¥28"],
  ["Drinks", "鲜果葡萄汁", "¥28"],
  ["Drinks", "菠萝苹果汁", "¥28"],
];

const leiGardenRows: Row[] = [
  ["Roast & BBQ", "香烧乳鸭仔（1只）", "¥140起"],
  ["Roast & BBQ", "鼓油鸡", "¥0"],
  ["Roast & BBQ", "黑椒脆皮乳鸽", "¥110起"],
  ["Roast & BBQ", "葱油贵妃鸡", "¥128起"],
  ["Seafood", "大老虎斑件（双冬焖）", "¥568"],
  ["Seafood", "鸡翅中", "¥328"],
  ["Seafood", "鸿图蟹皇翅", "¥488"],
  ["Seafood", "啫鲜鲍鱼", "¥2"],
  ["Seafood", "清蒸瓜子斑", "¥980"],
  ["Seafood", "XO酱八爪鱼", "¥168"],
  ["Seafood", "斗门海花竹虾", "¥198"],
  ["Seafood", "美极煎海竹花虾", "¥198"],
  ["Seafood", "石锅烧笋壳鱼", "¥450"],
  ["Seafood", "鲍汁花胶", "¥498"],
  ["Seafood", "XO酱蟹肉粉丝煲", "¥248"],
  ["Seafood", "虾蟹肉蒸蛋白", "¥0"],
  ["Seafood", "龙虾贵妃泡饭", "¥218"],
  ["Seafood", "蟹肉龙虾汤包", "¥70"],
  ["Seafood", "龙虾面", "¥68"],
  ["Seafood", "龙虾汤贵妃泡饭", "¥160"],
  ["Meat Dishes", "古法双冬焖羊腩煲", "¥0"],
  ["Meat Dishes", "冰烧三层肉（小份）", "¥130起"],
  ["Meat Dishes", "酸辣藕芽炒猪爽肉", "¥130"],
  ["Meat Dishes", "陈村粉蒸排骨", "¥45"],
  ["Meat Dishes", "鲍汁凤爪", "¥98"],
  ["Meat Dishes", "葱爆牛柳粒", "¥360"],
  ["Meat Dishes", "椒盐鸭舌", "¥0"],
  ["Vegetables", "罗汉斋", "¥40"],
  ["Vegetables", "芦笋", "¥98"],
  ["Vegetables", "老干妈煸四季豆", "¥98"],
  ["Vegetables", "千叶豆腐", "¥120"],
  ["Vegetables", "虾酱啫唐生菜（小份）", "¥90起"],
  ["Vegetables", "煎酿四季豆", "¥98"],
  ["Dim Sum & Staples", "金馒头", "¥12"],
  ["Dim Sum & Staples", "明火香煲腊味饭", "¥0"],
  ["Dim Sum & Staples", "京川滑饺子", "¥35"],
  ["Dim Sum & Staples", "黑松露小笼包", "¥28"],
  ["Dim Sum & Staples", "原只鲜虾饺 4件", "¥48起"],
  ["Dim Sum & Staples", "野菌贡菜饺", "¥35"],
  ["Dim Sum & Staples", "干炒牛河（小份）", "¥118起"],
  ["Dim Sum & Staples", "利苑小笼包 4件", "¥380起"],
  ["Dim Sum & Staples", "和牛包", "¥33"],
  ["Desserts", "甜品组合", "¥98"],
  ["Desserts", "蜜汁叉烧酥 4件", "¥38起"],
  ["Desserts", "蛋挞", "¥35"],
  ["Desserts", "芝士蓝莓拿破仑", "¥38"],
  ["Desserts", "马拉糕", "¥35"],
  ["Desserts", "杏仁蛋白", "¥38"],
  ["Desserts", "雪山包", "¥33"],
  ["Snacks", "烙烤银杏", "¥45"],
  ["Snacks", "金蒜拍青瓜", "¥40"],
  ["Snacks", "空心煎堆", "¥35"],
  ["Snacks", "香煎萝卜糕", "¥35"],
  ["Snacks", "卤水拼盘", "¥40"],
  ["Snacks", "粉粿", "¥36"],
  ["Snacks", "盐酥鸡脆骨", "¥58"],
  ["Snacks", "咸水角", "¥35"],
  ["Snacks", "海蜇", "¥0"],
  ["Snacks", "琥珀核桃", "¥0"],
  ["Soups", "安南子炖雪莲", "¥45"],
  ["Soups", "金银菜炖白肺", "¥280"],
  ["Soups", "例汤", "¥248"],
  ["Soups", "姬松茸炖老鸽", "¥388"],
  ["Soups", "龙虾汤过桥象拔蚌", "¥120"],
  ["Soups", "炖天山雪莲", "¥42"],
  ["Drinks", "青柠提子汁", "¥15"],
  ["Drinks", "鲜制杨枝甘露", "¥58"],
  ["Set Menus", "午市2位用套餐推介", "¥682"],
  ["Set Menus", "雪岭雄峰 4件", "¥38起"],
  ["Set Menus", "鱼翅捞饭双人餐", "¥0"],
  ["Set Menus", "龙腾四海", "¥100"],
  ["Set Menus", "午市4位用套餐推介", "¥1088"],
];

const beijingRows: Row[] = [
  ["Meat Dishes", "糖醋里脊", "¥0"],
  ["Meat Dishes", "酸汤蛤蜊煮生蚝", "¥139"],
  ["Meat Dishes", "霉干菜豚骨烧京东栗子", "¥139"],
  ["Meat Dishes", "辣椒炒黑毛猪肉", "¥69"],
  ["Meat Dishes", "干烧黄鱼", "¥169"],
  ["Meat Dishes", "胶东海鲜拼", "¥129"],
  ["Meat Dishes", "青苹果炖老鸭", "¥399"],
  ["Meat Dishes", "麻辣小青龙", "¥499"],
  ["Meat Dishes", "松露烧海参", "¥169"],
  ["Meat Dishes", "青岛大虾烧胶东白菜", "¥99"],
  ["Meat Dishes", "山楂鹅肝", "¥59"],
  ["Meat Dishes", "黑叉烧", "¥59"],
  ["Meat Dishes", "丝瓜烧蛏子", "¥59"],
  ["Meat Dishes", "藤椒火箭鱿鱼", "¥139"],
  ["Meat Dishes", "梅干菜猪软骨烧京东板栗", "¥0"],
  ["Meat Dishes", "芫爆肚丝", "¥139"],
  ["Meat Dishes", "火爆血旺", "¥99"],
  ["Meat Dishes", "葱烧海参", "¥169"],
  ["Meat Dishes", "意大利黑醋酥皮小牛肉", "¥119"],
  ["Meat Dishes", "鲜花椒猪雪花牛肉", "¥799"],
  ["Meat Dishes", "酸菜鸭血", "¥49"],
  ["Meat Dishes", "麻辣大块毛肚", "¥99"],
  ["Snacks", "芝麻酱菠菜", "¥49"],
  ["Snacks", "干炸丸子", "¥69"],
  ["Snacks", "老北京麻酱菠菜", "¥49"],
  ["Snacks", "乾隆白菜", "¥39"],
  ["Snacks", "冷菜四拼盘", "¥99起"],
  ["Snacks", "点心拼盘", "¥79"],
  ["Snacks", "莴笋拌蜇皮", "¥59"],
  ["Snacks", "芒种虾皮拌时蔬", "¥59"],
  ["Soups", "羊肚菌花胶汤", "¥79"],
  ["Soups", "谭府佛跳墙", "¥199"],
  ["Soups", "鸭架汤", "¥25"],
  ["Soups", "松茸菌菇汤", "¥69"],
  ["Soups", "菌菇汤", "¥59"],
  ["Soups", "羊杂汤", "¥98"],
  ["Soups", "青苹果老鸭汤", "¥299"],
  ["Soups", "新会陈皮浓汤极品鲍", "¥339"],
  ["Staples", "炸酱面", "¥0"],
  ["Staples", "黑松露雪花牛肉煲仔饭", "¥169"],
  ["Staples", "小花菇鲍鱼捞饭", "¥199"],
  ["Staples", "老北京糖油饼配意大利黑醋", "¥39"],
  ["Staples", "虾饺", "¥54"],
  ["Staples", "老北京酱肉卷饼", "¥139"],
  ["Staples", "肉汁炖老家粉皮", "¥10"],
  ["Staples", "桂花山药烙", "¥16"],
  ["Staples", "老北京糖油饼", "¥19"],
  ["Drinks", "鸭屎香手打柠檬茶", "¥18"],
  ["Drinks", "长和翡翠霞多丽干白葡萄酒", "¥79"],
  ["Drinks", "橙皮酸奶", "¥16"],
  ["Drinks", "罗圣山马尔堡珍藏黑皮诺红葡萄酒", "¥79"],
  ["Drinks", "一品黄坛子", "¥99"],
  ["Drinks", "手打柠檬茶", "¥18"],
  ["Drinks", "茉莉龙珠茶", "¥28"],
  ["Drinks", "（古法熬制）老北京酸梅汤", "¥16"],
  ["Drinks", "海底椰无花果雪梨水", "¥28"],
  ["Other", "袁枚梨撞虾/豆豆蛙（二选一）", "¥99"],
  ["Other", "0.1元+收藏打卡门店送桂花山药酪", "¥16"],
  ["Other", "老北京头条", "¥19"],
  ["Other", "0.1元", "¥16"],
];

const special: Record<string, DishHints> = {
  麻婆豆腐: { name: "Mapo Tofu", pinyin: "Mápó Dòufu", spicy: 3, vegetarian: false },
  口水鸡: { name: "Mouthwatering Chicken", pinyin: "Kǒushuǐ Jī", spicy: 2, allergens: [{ type: "sesame", level: "contains" }] },
  夫妻肺片: {
    name: "Sliced Beef Offal in Chili Oil",
    pinyin: "Fūqī Fèipiàn",
    spicy: 2,
    allergens: [
      { type: "peanut", level: "contains" },
      { type: "sesame", level: "may_contain" },
    ],
    textures: ["offal"],
    description:
      "Despite the scary name, there are no lungs: thin-sliced beef and offal in fragrant chili oil — a classic Sichuan cold starter.",
    story:
      "Named after a husband-and-wife street vendor duo in 1930s Chengdu; 'lung' stuck from an old word mix-up.",
  },
  担担面: { name: "Dan Dan Noodles", pinyin: "Dàndàn Miàn", spicy: 2, allergens: [{ type: "gluten", level: "contains" }, { type: "sesame", level: "contains" }] },
  香烧乳鸭仔: { name: "Roasted Young Duck", spicy: 0 },
  "香烧乳鸭仔（1只）": { name: "Roasted Young Duck", spicy: 0 },
  炸酱面: { name: "Beijing Noodles with Soybean Pork Sauce", spicy: 0, allergens: [{ type: "gluten", level: "contains" }, { type: "soy", level: "contains" }] },
};

export const MOCK_RESTAURANTS: MockRestaurant[] = [
  {
    id: "mawangzi",
    name: "马旺子",
    cuisine: "Sichuan",
    dishes: mawangziRows.map((row) => makeDish("Sichuan", row, special[row[1]])),
  },
  {
    id: "lei-garden",
    name: "利苑酒家",
    cuisine: "Cantonese",
    dishes: leiGardenRows.map((row) => makeDish("Cantonese", row, special[row[1]])),
  },
  {
    id: "beijing-cuisine",
    name: "北京菜餐厅",
    cuisine: "Beijing",
    dishes: beijingRows.map((row) => makeDish("Beijing", row, special[row[1]])),
  },
];

export function getMockRestaurant(id: unknown): MockRestaurant {
  return MOCK_RESTAURANTS.find((r) => r.id === id) ?? MOCK_RESTAURANTS[0];
}
