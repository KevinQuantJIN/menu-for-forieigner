/* ChopStory · 数据层：汇率/菜品/文案标签 —— 内容改这里 */
/* 货币系统（7.13 A 案）：¥ 原价永远保留在价签，仅切换 ≈ 换算行。
   静态汇率、approximate / for reference only（诚实红线）。JPY 符号用 JP¥ 避免与人民币 ¥ 混淆 */
/* unit = 弹层里展示换算的惯例基数（外汇牌价习惯：小额货币用 100/1000） */
const CURRENCIES = [
  { code:"USD", sym:"$",   flag:"🇺🇸", name:"US Dollar",         perCny: 0.140, unit: 1 },
  { code:"EUR", sym:"€",   flag:"🇪🇺", name:"Euro",              perCny: 0.128, unit: 1 },
  { code:"GBP", sym:"£",   flag:"🇬🇧", name:"British Pound",     perCny: 0.110, unit: 1 },
  { code:"JPY", sym:"JP¥", flag:"🇯🇵", name:"Japanese Yen",      perCny: 21.5,  unit: 100 },
  { code:"KRW", sym:"₩",   flag:"🇰🇷", name:"Korean Won",        perCny: 193,   unit: 1000 },
  { code:"AUD", sym:"A$",  flag:"🇦🇺", name:"Australian Dollar", perCny: 0.213, unit: 1 },
];
let curCode = localStorage.getItem("ml.currency") || "USD";
function curDef() { return CURRENCIES.find(c => c.code === curCode) || CURRENCIES[0]; }
function curSym() { return curDef().sym; }
function fxFmt(v) { return v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(v >= 10 ? 0 : 1); }
function fxN(cny) { return fxFmt(cny * curDef().perCny); } // number only, symbol added by caller
const usdN = fxN;                                  // 兼容旧调用名
const usd = (cny) => `≈ ${curSym()}${fxN(cny)}`;   // 兼容旧调用名

/* ---------------- demo dishes · 契约 v1 字段 + 客户端可选字段（emoji/signature/howToEat/catOriginal） ---------------- */
const DISHES = [
  { id:1, category:"Cold Starters", catOriginal:"经典凉菜", nameCn:"夫妻肺片", pinyin:"fū qī fèi piàn", name:"'Couple's Lung Slices' — No Lungs, Promise", emoji:"🥩",
    description:"Despite the terrifying translation, there are no lungs: thin-sliced beef, tripe and tongue in fragrant chili oil. One of Sichuan's most beloved cold starters.",
    story:"Named after a husband-and-wife street vendor duo in 1930s Chengdu whose offal salad became legendary — 'lung' stuck from an old word mix-up.",
    price:"25", spicy:2, vegetarian:false,
    allergens:[{type:"peanut",level:"may_contain"},{type:"sesame",level:"may_contain"}], textures:["offal","sichuan pepper tingle"], ingredients:["Beef & tripe","Chili oil","Celery","Peanut crumbs"] },
  { id:2, category:"Cold Starters", catOriginal:"经典凉菜", nameCn:"口水鸡", pinyin:"kǒu shuǐ jī", name:"Mouthwatering Chicken (Served Cold)", emoji:"🍗",
    description:"Poached chicken served cool under a glossy chili-sesame sauce. 'Saliva chicken' just means it makes your mouth water — and yes, cold chicken is intentional here.",
    story:null, price:"24", spicy:2, vegetarian:false,
    allergens:[{type:"sesame",level:"contains"},{type:"peanut",level:"may_contain"}], textures:["bone_in"], ingredients:["Poached chicken","Chili oil","Sesame","Garlic"] },
  { id:3, category:"Cold Starters", catOriginal:"经典凉菜", nameCn:"钵钵鸡", pinyin:"bō bō jī", name:"Bobo Chicken — Cold Skewers in Chili Broth", emoji:"🍢", signature:true,
    description:"Skewers of chicken and vegetables soaking in a cold, fragrant chili-sesame broth. Not 'Bowl Bowl Chicken' — bō is the clay pot it's served in.",
    story:"From Leshan near Chengdu: vendors carried clay pots (钵) of skewers through the streets; the name is literally the sound of the pot.",
    howToEat:"Pick skewers straight from the pot; you're charged by the empty sticks at the end.",
    price:"28", spicy:2, vegetarian:false,
    allergens:[{type:"sesame",level:"contains"},{type:"peanut",level:"may_contain"}], textures:[], ingredients:["Chicken skewers","Veggie skewers","Cold chili broth","Sesame"] },
  { id:4, category:"Cold Starters", catOriginal:"经典凉菜", nameCn:"蒜泥白肉", pinyin:"suàn ní bái ròu", name:"Sliced Pork Belly in Garlic Sauce", emoji:"🥓",
    description:"Paper-thin pork belly, briefly poached, draped in a punchy garlic-soy dressing. Silky and rich — the soft fat is the point here.",
    story:null, price:"25", spicy:1, vegetarian:false,
    allergens:[{type:"soy",level:"contains"},{type:"gluten",level:"may_contain"}], textures:["fatty"], ingredients:["Pork belly","Garlic","Soy dressing","Cucumber"] },
  { id:5, category:"Cold Starters", catOriginal:"经典凉菜", nameCn:"凉拌皮蛋", pinyin:"liáng bàn pí dàn", name:"Century Egg with Chili Dressing", emoji:"🥚",
    description:"Preserved duck egg — translucent amber white, creamy dark yolk — under a bright chili-garlic dressing. The look surprises first-timers; the taste is mellow and savory.",
    story:null, price:"18", spicy:1, vegetarian:true,
    allergens:[{type:"egg",level:"contains"}], textures:["century egg"], ingredients:["Century egg","Chili dressing","Garlic"] },
  { id:6, category:"Cold Starters", catOriginal:"经典凉菜", nameCn:"凉拌折耳根", pinyin:"liáng bàn zhé ěr gēn", name:"Houttuynia Root Salad — The 'Fishy Herb'", emoji:"🌿",
    description:"Crunchy roots of the houttuynia plant with chili and vinegar. Locals adore it; most visitors find the flavor intensely herbal-fishy. Order it to eat like a local — you've been warned.",
    story:null, price:"15", spicy:1, vegetarian:true,
    allergens:[], textures:["fishy herb"], ingredients:["Houttuynia root","Chili","Vinegar"] },
  { id:7, category:"Mains", catOriginal:"招牌热菜", nameCn:"宫保鸡丁", pinyin:"gōng bǎo jī dīng", name:"Kung Pao Chicken", emoji:"🥜",
    description:"The dish you know from home — diced chicken in a sweet-tangy glaze. But heads up: those crunchy bits are real roasted peanuts, and there are a lot of them.",
    story:"Named after Ding Baozhen, a Qing-dynasty governor of Sichuan whose court title was 'Gongbao' (palace guardian) — his kitchen made this dish famous.",
    price:"42", spicy:1, vegetarian:false,
    allergens:[{type:"peanut",level:"contains"}], textures:[], ingredients:["Diced chicken","Roasted peanuts","Dried chili","Scallion"] },
  { id:8, category:"Mains", catOriginal:"招牌热菜", nameCn:"麻婆豆腐", pinyin:"má pó dòu fu", name:"Mapo Tofu", emoji:"🌶️", signature:true,
    description:"Soft tofu in a bubbling chili-bean sauce with minced beef. The Sichuan pepper makes your lips tingle — like a faint electric buzz. That's 'má' (numbing), not more heat, and it's worth experiencing once.",
    story:"Traced to a pockmarked ('ma') grandma ('po') who ran a tofu eatery by a Chengdu bridge in 1862 — her name is on the dish worldwide.",
    price:"32", spicy:2, vegetarian:false,
    allergens:[{type:"soy",level:"contains"},{type:"gluten",level:"may_contain"}], textures:["sichuan pepper tingle"], ingredients:["Soft tofu","Minced beef","Chili bean paste","Sichuan pepper"] },
  { id:9, category:"Mains", catOriginal:"招牌热菜", nameCn:"水煮鱼", pinyin:"shuǐ zhǔ yú", name:"Fish Fillets in Fiery Chili Oil", emoji:"🔥", signature:true,
    description:"'Water-boiled fish' sounds gentle. It is not: silky fish fillets arrive under a bubbling layer of chili oil, dried chilies and Sichuan pepper. For western palates this is a 3-alarm dish.",
    story:null, price:"58", spicy:3, vegetarian:false,
    allergens:[{type:"fish",level:"contains"}], textures:["sichuan pepper tingle"], ingredients:["Fish fillets","Chili oil","Sichuan pepper","Bean sprouts"] },
  { id:10, category:"Mains", catOriginal:"招牌热菜", nameCn:"鱼香肉丝", pinyin:"yú xiāng ròu sī", name:"'Fish-Fragrant' Pork — No Fish Involved", emoji:"🥢",
    description:"Shredded pork in a glossy sweet-sour-garlicky sauce. 'Fish-fragrant' names the seasoning style once used for fish — there is no fish or seafood in it. Safe for seafood allergies.",
    story:null, price:"36", spicy:1, vegetarian:false,
    allergens:[{type:"soy",level:"contains"}], textures:[], ingredients:["Shredded pork","Bamboo shoots","Wood ear","Pickled chili & garlic"] },
  { id:11, category:"Mains", catOriginal:"招牌热菜", nameCn:"蚂蚁上树", pinyin:"mǎ yǐ shàng shù", name:"'Ants Climbing a Tree' — Glass Noodles & Pork", emoji:"🍝",
    description:"No ants! Glass noodles tossed with minced pork in a savory bean sauce — the pork specks clinging to the noodles look like ants on branches. Comforting, mildly spicy.",
    story:null, price:"30", spicy:1, vegetarian:false,
    allergens:[{type:"soy",level:"contains"}], textures:[], ingredients:["Glass noodles","Minced pork","Bean sauce"] },
  { id:12, category:"Vegetables", catOriginal:"时蔬", nameCn:"干煸四季豆", pinyin:"gān biān sì jì dòu", name:"Dry-Fried Green Beans (Usually Not Vegetarian!)", emoji:"🫛",
    description:"Blistered green beans, wrinkled and smoky. Looks like a vegetable dish — but the classic recipe stir-fries them with minced pork and tiny dried shrimp. Vegetarians: ask first.",
    story:null, price:"28", spicy:1, vegetarian:false,
    allergens:[{type:"shellfish",level:"may_contain"}], textures:["usually has minced pork"], ingredients:["Green beans","Minced pork","Dried shrimp","Dried chili"] },
  { id:13, category:"Rice & Noodles", catOriginal:"主食甜品", nameCn:"龙抄手", pinyin:"lóng chāo shǒu", name:"Long Chao Shou — Silky Pork Wontons", emoji:"🥟",
    description:"Delicate pork wontons in a mellow broth — not 'Copying Hands', whatever the machine translation says. Thin silky wrappers, gentle flavor, a safe and beloved order.",
    story:"'Chāo shǒu' means 'crossed hands': the wrapper folds like arms tucked into sleeves against the cold. Chengdu's Long Chao Shou shop has served them since 1941.",
    price:"18", spicy:0, vegetarian:false,
    allergens:[{type:"gluten",level:"contains"},{type:"egg",level:"may_contain"}], textures:[], ingredients:["Pork wontons","Clear broth","Scallion"] },
  { id:14, category:"Dessert", catOriginal:"主食甜品", nameCn:"红糖糍粑", pinyin:"hóng táng cí bā", name:"Brown-Sugar Sticky Rice Cakes", emoji:"🍡",
    description:"Warm sticky-rice cakes, fried until lightly crisp, drenched in dark brown-sugar syrup. Sweet, chewy, zero spice — the perfect way to land after a fiery meal.",
    story:null, price:"16", spicy:0, vegetarian:true,
    allergens:[], textures:[], ingredients:["Sticky rice","Brown sugar syrup","Soybean flour dusting"] },
];
const DEMO_DISHES = DISHES;
