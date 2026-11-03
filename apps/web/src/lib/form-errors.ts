import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { errorMessage, isApiError } from './api';

/**
 * Maps an API error onto react-hook-form: `VALIDATION_FAILED.details` become inline field errors
 * for known fields; anything else becomes a `root.server` error. Returns the root message (if any).
 */
export function applyApiErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: ReadonlyArray<Path<T>>,
): string | null {
  if (isApiError(error) && error.code === 'VALIDATION_FAILED') {
    const fieldErrors = error.fieldErrors;
    let matched = false;
    for (const field of fields) {
      const message = fieldErrors[field];
      if (message) {
        setError(field, { type: 'server', message });
        matched = true;
      }
    }
    if (matched) return null;
  }
  const message = errorMessage(error);
  setError('root.server' as Path<T>, { type: 'server', message });
  return message;
}
