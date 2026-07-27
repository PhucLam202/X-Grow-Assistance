export interface RequestContext {
  requestId: string;
  userId?: string;
  postId?: string;
  generationRunId?: string;
  idempotencyKey?: string;
}
