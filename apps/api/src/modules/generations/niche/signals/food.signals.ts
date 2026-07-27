import type { NicheSignalDefinition } from '../niche.types';
import { any, en, ja, vi } from './kw';

export const FOOD_SIGNALS: NicheSignalDefinition = {
  niche: 'food',
  version: '1.0.0',
  strong: [
    en('recipe', /\brecipes?\b/),
    en('baking', /\b(sourdough|proofing|baking sheet|pastry dough)\b/),
    any('dish', /\b(ramen|sushi|pho|banh mi|dim sum|tacos)\b/),
    en('dining', /\b(michelin (star|guide)|tasting menu|omakase)\b/),
    en('coffee', /\b(barista|espresso shot|pour over|latte art)\b/),
    en('mealprep', /\bmeal prep(ping)?\b/),
    en('technique', /\b(fermentation|sous vide|air fryer|cast iron)\b/),
    en('streetfood', /\bstreet food\b/),
    vi('am-thuc', /ẩm thực|món ăn|nấu ăn|quán ăn|công thức nấu/),
    ja('ryouri', /料理|ラーメン|寿司|グルメ|レシピ/),
  ],
  weak: [
    en('food', /\bfoods?\b/),
    en('cook', /\bcook(ing|ed)?\b/),
    en('restaurant', /\brestaurants?\b/),
    en('taste', /\b(tast(y|e)|delicious|flavou?r)\b/),
    en('dish-weak', /\bdish(es)?\b/),
    ja('oishii', /美味しい|食べ/),
  ],
  hashtagAliases: [
    'food',
    'foodie',
    'cooking',
    'recipe',
    'baking',
    'coffee',
    'foodporn',
  ],
  cashtags: [],
  domains: ['seriouseats.com', 'allrecipes.com'],
};
