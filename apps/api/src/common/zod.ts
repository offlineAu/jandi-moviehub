import { Body, type PipeTransform, Query } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { Errors } from './errors';

export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw Errors.badRequest(
        'VALIDATION_FAILED',
        'Request validation failed',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }
}

/** OpenAPI 3.0 schema derived from a Zod schema (input shape). */
export function toOpenApi(schema: z.ZodType): Record<string, unknown> {
  try {
    const json = z.toJSONSchema(schema, {
      io: 'input',
      target: 'openapi-3.0',
      unrepresentable: 'any',
    }) as Record<string, unknown>;
    delete json.$schema;
    return json;
  } catch {
    return { type: 'object' };
  }
}

type Target = object;

/** `@ValidBody(schema)` — validates the request body and documents it in OpenAPI. */
export const ValidBody =
  (schema: z.ZodType): ParameterDecorator =>
  (target, key, index) => {
    Body(new ZodPipe(schema))(target, key, index);
    if (key === undefined) return;
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor) ApiBody({ schema: toOpenApi(schema) })(target as Target, key, descriptor);
  };

/** `@ValidQuery(schema)` — validates the query string and documents each parameter. */
export const ValidQuery =
  (schema: z.ZodType): ParameterDecorator =>
  (target, key, index) => {
    Query(new ZodPipe(schema))(target, key, index);
    if (key === undefined) return;
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    const json = toOpenApi(schema) as { properties?: Record<string, object>; required?: string[] };
    if (!descriptor || !json.properties) return;
    for (const [name, prop] of Object.entries(json.properties)) {
      ApiQuery({ name, required: json.required?.includes(name) ?? false, schema: prop })(
        target as Target,
        key,
        descriptor,
      );
    }
  };
