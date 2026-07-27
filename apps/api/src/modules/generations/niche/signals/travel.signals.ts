import type { NicheSignalDefinition } from '../niche.types';
import { en, ja, vi } from './kw';

export const TRAVEL_SIGNALS: NicheSignalDefinition = {
  niche: 'travel',
  version: '1.0.0',
  strong: [
    en('itinerary', /\bitinerar(y|ies)\b/),
    en('backpacking', /\b(backpacking|solo travel(l)?ing)\b/),
    en('visa', /\b(visa application|visa[- ]free|passport renewal)\b/),
    en('flight', /\b(layover|boarding pass|red[- ]eye flight|jet lag)\b/),
    en('stay', /\b(airbnb|hostel|ryokan|guesthouse)\b/),
    en('roadtrip', /\broad ?trips?\b/),
    en('nomad', /\bdigital nomads?\b/),
    en('sightseeing', /\b(sightseeing|travel insurance|tourist trap)\b/),
    vi('du-lich', /du lịch|chuyến đi|vé máy bay|đặt phòng/),
    ja('ryokou', /旅行|観光|温泉|絶景/),
  ],
  weak: [
    en('travel', /\btravel(ing|led)?\b/),
    en('trip', /\btrips?\b/),
    en('flight-weak', /\bflights?\b/),
    en('hotel', /\bhotels?\b/),
    en('destination', /\bdestinations?\b/),
    ja('tabi', /旅|海外/),
  ],
  hashtagAliases: [
    'travel',
    'travelling',
    'traveling',
    'wanderlust',
    'backpacking',
    'digitalnomad',
    'roadtrip',
  ],
  cashtags: [],
  domains: ['airbnb.com', 'booking.com', 'tripadvisor.com'],
};
