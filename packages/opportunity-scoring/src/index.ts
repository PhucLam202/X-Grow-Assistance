export type OpportunityLabel = 'skip' | 'low' | 'medium' | 'high' | 'urgent';

export type RecommendedAction =
  | 'skip'
  | 'like_only'
  | 'comment_short'
  | 'comment_with_question'
  | 'quote_post'
  | 'save_as_content_idea';

export type OpportunityDimensions = {
  nicheMatch: number;
  freshness: number;
  engagementVelocity: number;
  replySurface: number;
  mediaContext: number;
  authorQuality: number;
  competitionLevel: number;
  spamRisk: number;
  negativeTopicRisk: number;
};

export type OpportunityScore = {
  total: number;
  label: OpportunityLabel;
  dimensions: OpportunityDimensions;
  recommendedAction: RecommendedAction;
  suggestedCommentAngle: string;
  reasonVi: string[];
  warnings: string[];
};

export type OpportunityMedia = {
  type: 'image';
  url: string;
  altText?: string;
};

export type OpportunityCandidate = {
  id?: string;
  postUrl?: string;
  tweetId?: string;
  username?: string;
  authorName?: string;
  text: string;
  detectedLanguage?: string;
  detectedNiche?: string;
  detectedTopic?: string;
  contentType?: 'text' | 'image' | 'image_meme_candidate' | 'mixed' | 'unknown' | string;
  media?: OpportunityMedia[];
  mediaCount?: number;
  metrics?: {
    replies?: number;
    reposts?: number;
    likes?: number;
    views?: number;
  };
  timestamps?: {
    postedAt?: string;
    postedAtText?: string;
    extractedAt: string;
  };
  hasQuestion?: boolean;
  needsVisionAnalysis?: boolean;
  feedScore?: number;
};

export type OpportunityUserContext = {
  targetNiches?: string[];
  preferredCommentLanguages?: string[];
  recentUsedComments?: string[];
};

export type OpportunityScoringInput = {
  candidate: OpportunityCandidate;
  userContext?: OpportunityUserContext;
};

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function keywordScore(
  text: string,
  patterns: RegExp[],
  pointsPerMatch: number,
  base = 0,
): number {
  const matches = patterns.filter((pattern) => pattern.test(text)).length;
  return clampScore(base + matches * pointsPerMatch);
}

export function safeNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

export function getAgeMinutes(
  input: OpportunityScoringInput,
): number | undefined {
  const postedAt = input.candidate.timestamps?.postedAt;
  if (postedAt) {
    const timestamp = Date.parse(postedAt);
    if (!Number.isNaN(timestamp)) {
      return Math.max(0, (Date.now() - timestamp) / 60_000);
    }
  }

  const postedAtText = normalizeText(
    input.candidate.timestamps?.postedAtText ?? '',
  );
  if (!postedAtText) return undefined;

  const relativeMatch = postedAtText.match(
    /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)/,
  );
  if (!relativeMatch) return undefined;

  const value = Number(relativeMatch[1]);
  const unit = relativeMatch[2];
  if (unit.startsWith('s')) return value / 60;
  if (unit.startsWith('m')) return value;
  if (unit.startsWith('h')) return value * 60;
  if (unit.startsWith('d')) return value * 1440;
  return undefined;
}

function scoreNicheMatch(input: OpportunityScoringInput): number {
  const niche = normalizeText(input.candidate.detectedNiche ?? 'general');
  const topic = normalizeText(input.candidate.detectedTopic ?? 'general');
  const text = normalizeText(input.candidate.text);
  const targets = (
    input.userContext?.targetNiches?.length
      ? input.userContext.targetNiches
      : ['anime_manga', 'anime', 'football', 'ai-tech', 'tech', 'business']
  ).map(normalizeText);

  if (niche === 'general' && topic === 'general') return 35;
  if (
    targets.some(
      (target) => target === niche || niche.includes(target) || target.includes(niche),
    )
  ) {
    return 95;
  }
  if (
    targets.some(
      (target) => text.includes(target.replace('-', ' ')) || topic.includes(target),
    )
  ) {
    return 82;
  }
  if (niche !== 'general') return 62;
  return clampScore(30);
}

function scoreFreshness(input: OpportunityScoringInput): number {
  const ageMinutes = getAgeMinutes(input);
  if (ageMinutes === undefined) return 55;
  if (ageMinutes < 10) return 96;
  if (ageMinutes < 30) return 88;
  if (ageMinutes < 120) return 72;
  if (ageMinutes < 720) return 48;
  if (ageMinutes < 1440) return 32;
  return 18;
}

function scoreEngagementVelocity(input: OpportunityScoringInput): number {
  const metrics = input.candidate.metrics;
  if (!metrics)
    return input.candidate.feedScore ? clampScore(input.candidate.feedScore * 0.65) : 42;

  const ageMinutes = Math.max(getAgeMinutes(input) ?? 90, 1);
  const weightedEngagement =
    safeNumber(metrics.likes) +
    safeNumber(metrics.replies) * 2 +
    safeNumber(metrics.reposts) * 3;
  const engagementVelocity = weightedEngagement / ageMinutes;
  const viewVelocity =
    metrics.views !== undefined ? safeNumber(metrics.views) / ageMinutes : 0;
  const velocityScore =
    Math.log10(engagementVelocity + 1) * 32 + Math.log10(viewVelocity + 1) * 12;

  return clampScore(velocityScore);
}

function scoreReplySurface(input: OpportunityScoringInput): number {
  const text = normalizeText(input.candidate.text);
  const length = text.length;
  const patterns = [
    /\?/, 
    /\b(why|how|what|which|should|would you|do you|agree|thoughts)\b/,
    /\b(rank|ranking|top \d+|tier list|prediction|hot take|unpopular opinion)\b/,
    /\b(before|after|vs|versus|compare|chart|graph|data)\b/,
    /\b(won|launched|built|hit|reached|milestone|congrats|achievement)\b/,
    /😂|🤣|笑|ｗｗ|lol|lmao/,
  ];
  const matches = patterns.filter((pattern) => pattern.test(text)).length;
  let score = clampScore(30 + matches * 12);

  if (input.candidate.hasQuestion) score += 24;
  if (length >= 40 && length <= 280) score += 14;
  if (length > 280 && length <= 700) score += 8;
  if (length < 20 && !input.candidate.mediaCount) score -= 18;
  if (input.candidate.contentType === 'image_meme_candidate') score += 16;
  if (input.candidate.contentType === 'mixed') score += 10;

  return clampScore(score);
}

function scoreMediaContext(input: OpportunityScoringInput): number {
  const mediaCount = input.candidate.mediaCount ?? input.candidate.media?.length ?? 0;
  if (mediaCount === 0) return 28;

  const text = normalizeText(input.candidate.text);
  const patterns = [/meme|😂|🤣|笑|ｗｗ|lol|lmao/, /chart|graph|screenshot|infographic|panel|manga|anime|before|after/, /image|photo|look at|visual|design|ui|ranking|tier list/];
  let score = clampScore(keywordScore(text, patterns, 14, 56));
  if (input.candidate.contentType === 'image_meme_candidate') score += 20;
  if (input.candidate.contentType === 'mixed') score += 12;
  if (mediaCount > 1) score += 8;

  return clampScore(score);
}

function scoreAuthorQuality(input: OpportunityScoringInput): number {
  let score = 48;
  if (input.candidate.username) score += 12;
  if (input.candidate.authorName) score += 8;
  if (input.candidate.postUrl) score += 6;

  const metrics = input.candidate.metrics;
  if (metrics) {
    const totalEngagement =
      safeNumber(metrics.likes) + safeNumber(metrics.replies) + safeNumber(metrics.reposts);
    if (totalEngagement >= 100) score += 8;
    if (totalEngagement >= 1000) score += 10;
    if (safeNumber(metrics.views) >= 10000) score += 8;
  }

  return clampScore(score);
}

function scoreCompetitionLevel(input: OpportunityScoringInput): number {
  const metrics = input.candidate.metrics;
  if (!metrics) return 45;

  const replies = safeNumber(metrics.replies);
  const views = safeNumber(metrics.views);
  const ageMinutes = getAgeMinutes(input);
  let score = 25;

  if (views > 0) score += Math.min(35, (replies / views) * 1800);
  if (replies > 50) score += 12;
  if (replies > 250) score += 18;
  if (replies > 1000) score += 25;
  if (ageMinutes !== undefined && ageMinutes > 120 && replies > 1000) score += 16;
  if (ageMinutes !== undefined && ageMinutes < 30 && replies < 50) score -= 16;

  return clampScore(score);
}

function scoreSpamRisk(input: OpportunityScoringInput): number {
  const text = normalizeText(input.candidate.text);
  const genericPatterns = [
    /^(nice|cool|great|wow|amazing|interesting|true|facts)[.!]*$/,
    /\b(check dm|follow me|giveaway|airdrop|free money|100x|guaranteed)\b/,
    /🔥{3,}|😂{3,}|🚀{3,}/,
  ];
  let score = 18;

  if (text.length < 20 && !input.candidate.mediaCount) score += 24;
  if (text.length > 900) score += 12;
  if (genericPatterns.some((pattern) => pattern.test(text))) score += 34;
  if (input.candidate.contentType === 'image' && !text) score += 16;
  if (
    input.userContext?.recentUsedComments?.some((comment) =>
      normalizeText(comment).includes(text.slice(0, 40)),
    )
  ) {
    score += 24;
  }

  return clampScore(score);
}

function scoreNegativeTopicRisk(input: OpportunityScoringInput): number {
  const highRiskPatterns = [
    /\b(war|terror|terrorist|death|dead|killed|shooting|tragedy|disaster)\b/,
    /\b(politics|election|president|left wing|right wing|democrat|republican)\b/,
    /\b(racist|harassment|doxx|scam|fraud|misinformation|fake news)\b/,
    /\b(nsfl|graphic|abuse|assault)\b/,
  ];
  const text = normalizeText(`${input.candidate.detectedTopic ?? ''} ${input.candidate.text}`);
  return clampScore(keywordScore(text, highRiskPatterns, 24, 6));
}

function getTotal(dimensions: OpportunityDimensions): number {
  return clampScore(
    dimensions.nicheMatch * 0.25 +
      dimensions.freshness * 0.2 +
      dimensions.engagementVelocity * 0.2 +
      dimensions.replySurface * 0.15 +
      dimensions.mediaContext * 0.1 +
      dimensions.authorQuality * 0.1 -
      dimensions.competitionLevel * 0.1 -
      dimensions.spamRisk * 0.2 -
      dimensions.negativeTopicRisk * 0.2,
  );
}

function getLabel(total: number): OpportunityLabel {
  if (total >= 85) return 'urgent';
  if (total >= 70) return 'high';
  if (total >= 50) return 'medium';
  if (total >= 25) return 'low';
  return 'skip';
}

function getRecommendedAction(
  dimensions: OpportunityDimensions,
  total: number,
): RecommendedAction {
  if (total < 40 || dimensions.negativeTopicRisk >= 70 || dimensions.spamRisk >= 75)
    return 'skip';
  if (dimensions.nicheMatch >= 70 && dimensions.freshness < 35)
    return 'save_as_content_idea';
  if (dimensions.nicheMatch >= 70 && dimensions.replySurface < 45) return 'like_only';
  if (total >= 78 && dimensions.replySurface >= 70 && dimensions.competitionLevel <= 65)
    return 'quote_post';
  if (dimensions.replySurface >= 68) return 'comment_with_question';
  return 'comment_short';
}

function getSuggestedAngle(
  input: OpportunityScoringInput,
  dimensions: OpportunityDimensions,
  action: RecommendedAction,
): string {
  const language =
    input.candidate.detectedLanguage && input.candidate.detectedLanguage !== 'unknown'
      ? input.candidate.detectedLanguage
      : 'same language as post';
  if (action === 'skip') return 'Skip this post; risk or opportunity quality is too weak.';
  if (action === 'like_only')
    return `Like only; context is relevant but reply surface is thin. Use ${language} if replying manually.`;
  if (action === 'quote_post')
    return `Add your own take in ${language}; turn the topic into a short content angle.`;
  if (action === 'save_as_content_idea')
    return 'Save the topic as an idea; comment timing is not strong enough.';
  if (dimensions.mediaContext >= 70)
    return `Short native ${language} reply that references the image or meme context.`;
  if (dimensions.replySurface >= 68)
    return `Ask a concise ${language} follow-up question that invites discussion.`;
  return `Short supportive ${language} reply with one specific detail from the post.`;
}

function getReasons(
  input: OpportunityScoringInput,
  dimensions: OpportunityDimensions,
  total: number,
): string[] {
  const reasons: string[] = [];
  if (dimensions.nicheMatch >= 75) reasons.push('Bài viết khớp tốt với niche mục tiêu.');
  if (dimensions.freshness >= 70) reasons.push('Bài còn khá mới nên có cơ hội được thấy sớm.');
  if (dimensions.engagementVelocity >= 70)
    reasons.push('Tốc độ engagement đang tốt so với thời gian hiển thị.');
  if (dimensions.replySurface >= 70)
    reasons.push('Bài có bề mặt phản hồi rõ, dễ viết comment có ý nghĩa.');
  if (dimensions.mediaContext >= 70)
    reasons.push('Media tạo thêm ngữ cảnh để comment tự nhiên hơn.');
  if (dimensions.competitionLevel <= 45)
    reasons.push('Mức cạnh tranh trong comment chưa quá cao.');
  if (total < 50) reasons.push('Tổng điểm chưa đủ mạnh để ưu tiên comment ngay.');
  if (!input.candidate.metrics)
    reasons.push('Chưa có số liệu likes/replies/views nên điểm velocity chỉ là ước lượng.');
  return reasons.slice(0, 5);
}

function getWarnings(dimensions: OpportunityDimensions): string[] {
  const warnings: string[] = [];
  if (dimensions.negativeTopicRisk >= 55)
    warnings.push('Topic có rủi ro tiêu cực hoặc dễ kéo tranh cãi.');
  if (dimensions.spamRisk >= 55)
    warnings.push('Comment dễ bị generic/spam nếu không thêm chi tiết cụ thể.');
  if (dimensions.competitionLevel >= 75)
    warnings.push('Comment section có thể đã quá đông.');
  return warnings;
}

export function scoreOpportunity(input: OpportunityScoringInput): OpportunityScore {
  const dimensions: OpportunityDimensions = {
    nicheMatch: scoreNicheMatch(input),
    freshness: scoreFreshness(input),
    engagementVelocity: scoreEngagementVelocity(input),
    replySurface: scoreReplySurface(input),
    mediaContext: scoreMediaContext(input),
    authorQuality: scoreAuthorQuality(input),
    competitionLevel: scoreCompetitionLevel(input),
    spamRisk: scoreSpamRisk(input),
    negativeTopicRisk: scoreNegativeTopicRisk(input),
  };
  const total = getTotal(dimensions);
  const label = getLabel(total);
  const recommendedAction = getRecommendedAction(dimensions, total);

  return {
    total,
    label,
    dimensions,
    recommendedAction,
    suggestedCommentAngle: getSuggestedAngle(input, dimensions, recommendedAction),
    reasonVi: getReasons(input, dimensions, total),
    warnings: getWarnings(dimensions),
  };
}
