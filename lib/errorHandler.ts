// Error types
export enum ErrorType {
  NETWORK = 'NETWORK',
  IPFS = 'IPFS',
  FIRESTORE = 'FIRESTORE',
  PINNING = 'PINNING',
  AUTH = 'AUTH',
  VALIDATION = 'VALIDATION',
  UNKNOWN = 'UNKNOWN'
}

export interface AppError {
  type: ErrorType;
  message: string;
  userMessage: string;
  originalError?: any;
  retryable: boolean;
  code?: string;
}

// User-friendly error messages
const ERROR_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.NETWORK]: 'Network connection issue. Please check your internet connection and try again.',
  [ErrorType.IPFS]: 'Failed to access decentralized storage. The content may be temporarily unavailable.',
  [ErrorType.FIRESTORE]: 'Database error occurred. Your changes may not have been saved.',
  [ErrorType.PINNING]: 'Failed to pin file. The file may not persist long-term.',
  [ErrorType.AUTH]: 'Authentication error. Please sign in again.',
  [ErrorType.VALIDATION]: 'Invalid input. Please check your data and try again.',
  [ErrorType.UNKNOWN]: 'An unexpected error occurred. Please try again.'
};

// Error codes mapping to user messages
const ERROR_CODE_MESSAGES: Record<string, string> = {
  'auth/user-not-found': 'User account not found.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/email-already-in-use': 'This email is already registered.',
  'auth/weak-password': 'Password is too weak.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'permission-denied': 'You don\'t have permission to perform this action.',
  'not-found': 'The requested item was not found.',
  'already-exists': 'This item already exists.',
  'unavailable': 'Service temporarily unavailable. Please try again later.'
};

export class ErrorHandler {
  /**
   * Create a user-friendly error from any error
   */
  static createAppError(error: any, type?: ErrorType): AppError {
    // Determine error type if not provided
    if (!type) {
      type = ErrorHandler.inferErrorType(error);
    }

    // Extract error code
    const code = error?.code || error?.error?.code || error?.name;

    // Get user-friendly message
    let userMessage = ERROR_CODE_MESSAGES[code] || ERROR_MESSAGES[type];
    
    // Try to extract more specific message from error
    const errorMessage = error?.message || String(error);
    
    // Enhance user message with context if available
    if (errorMessage && !errorMessage.includes('[object Object]')) {
      if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
        userMessage = ERROR_MESSAGES[ErrorType.NETWORK];
      } else if (errorMessage.toLowerCase().includes('ipfs')) {
        userMessage = ERROR_MESSAGES[ErrorType.IPFS];
      } else if (errorMessage.toLowerCase().includes('firestore') || errorMessage.toLowerCase().includes('firebase')) {
        userMessage = ERROR_MESSAGES[ErrorType.FIRESTORE];
      }
    }

    return {
      type,
      message: errorMessage,
      userMessage,
      originalError: error,
      retryable: ErrorHandler.isRetryable(type, code),
      code
    };
  }

  /**
   * Infer error type from error object
   */
  private static inferErrorType(error: any): ErrorType {
    const errorMessage = String(error?.message || error || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();

    if (errorMessage.includes('network') || errorMessage.includes('fetch') || 
        errorMessage.includes('timeout') || code.includes('network')) {
      return ErrorType.NETWORK;
    }
    
    if (errorMessage.includes('ipfs') || errorMessage.includes('gateway')) {
      return ErrorType.IPFS;
    }
    
    if (errorMessage.includes('firestore') || code.includes('firestore') || 
        code.includes('permission-denied') || code.includes('not-found')) {
      return ErrorType.FIRESTORE;
    }
    
    if (errorMessage.includes('pin') || code.includes('pin')) {
      return ErrorType.PINNING;
    }
    
    if (code.includes('auth') || errorMessage.includes('auth')) {
      return ErrorType.AUTH;
    }
    
    return ErrorType.UNKNOWN;
  }

  /**
   * Determine if error is retryable
   */
  private static isRetryable(type: ErrorType, code?: string): boolean {
    // Non-retryable error codes
    const nonRetryableCodes = [
      'auth/user-not-found',
      'auth/wrong-password',
      'auth/email-already-in-use',
      'auth/weak-password',
      'permission-denied',
      'not-found',
      'validation-error'
    ];

    if (code && nonRetryableCodes.includes(code)) {
      return false;
    }

    // Retryable types
    const retryableTypes = [ErrorType.NETWORK, ErrorType.IPFS, ErrorType.FIRESTORE];
    return retryableTypes.includes(type);
  }

  /**
   * Retry a function with exponential backoff
   */
  static async retry<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      initialDelay?: number;
      maxDelay?: number;
      backoffMultiplier?: number;
      onRetry?: (attempt: number, error: AppError) => void;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 10000,
      backoffMultiplier = 2,
      onRetry
    } = options;

    let lastError: AppError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = this.createAppError(error);
        
        // Don't retry if error is not retryable
        if (!lastError.retryable || attempt === maxRetries) {
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          initialDelay * Math.pow(backoffMultiplier, attempt),
          maxDelay
        );

        // Notify about retry
        if (onRetry) {
          onRetry(attempt + 1, lastError);
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Format error for display
   */
  static formatError(error: AppError | any): string {
    if (error && typeof error === 'object' && 'userMessage' in error) {
      return error.userMessage;
    }
    
    const appError = this.createAppError(error);
    return appError.userMessage;
  }

  /**
   * Log error with context
   */
  static logError(error: AppError | any, context?: string) {
    const appError = error && typeof error === 'object' && 'type' in error 
      ? error 
      : this.createAppError(error);
    
    const logContext = context ? `[${context}]` : '';
    console.error(`${logContext} ${appError.type}:`, {
      message: appError.message,
      code: appError.code,
      retryable: appError.retryable,
      original: appError.originalError
    });
  }
}

