import type { ApiError } from '@apex/contracts';

export type DomainErrorCode =
  | 'PRODUCT_NOT_FOUND'
  | 'PLATFORM_NOT_FOUND'
  | 'COMPARE_UNKNOWN_PRODUCTS'
  | 'COMPARE_MIXED_CATEGORIES';

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  PRODUCT_NOT_FOUND: 404,
  PLATFORM_NOT_FOUND: 404,
  COMPARE_UNKNOWN_PRODUCTS: 404,
  COMPARE_MIXED_CATEGORIES: 422,
};

/**
 * Ожидаемая ошибка предметной области. Код стабилен (фронт переводит сообщения по нему),
 * message — человеческое объяснение на языке по умолчанию.
 */
export class DomainError extends Error {
  readonly status: number;

  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
    this.status = HTTP_STATUS[code];
  }

  toApiError(requestId?: string): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
        ...(requestId === undefined ? {} : { requestId }),
      },
    };
  }
}
