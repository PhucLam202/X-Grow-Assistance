import { ValidationError } from 'class-validator';
import { ApplicationError } from '../errors/application.error';
import { ErrorCodes } from '../errors/error-codes';

const KNOWN_CODES = new Set<string>(Object.values(ErrorCodes));

/**
 * DTO gắn error code vào `message` của constraint (ví dụ
 * `@IsIn(NICHE_SELECTIONS, { message: ErrorCodes.INVALID_NICHE })`). Factory này
 * nhặt code đó ra để error response dùng chung `ErrorCodes`/`ApplicationError`
 * thay vì `BAD_REQUEST` chung chung.
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): ApplicationError {
  const messages = collectMessages(errors);
  const code = messages.find((message) => KNOWN_CODES.has(message));

  return new ApplicationError(
    code ?? ErrorCodes.VALIDATION_FAILED,
    messages.length > 0 ? messages.join('; ') : 'Request validation failed.',
    false,
    400,
  );
}

function collectMessages(
  errors: ValidationError[],
  acc: string[] = [],
): string[] {
  for (const error of errors) {
    if (error.constraints) {
      acc.push(...Object.values(error.constraints));
    }
    if (error.children && error.children.length > 0) {
      collectMessages(error.children, acc);
    }
  }
  return acc;
}
