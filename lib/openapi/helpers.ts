import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

export function pathParam(name: string, description: string) {
  return {
    name,
    in: 'path' as const,
    required: true,
    schema: { type: 'string' },
    description,
  };
}

export function jsonBody(schema: JsonSchema) {
  return {
    required: true,
    content: {
      'application/json': { schema },
    },
  };
}

/** Generates an OpenAPI requestBody from a Zod schema via z.toJSONSchema(). */
export function zodBody(schema: z.ZodType) {
  const jsonSchema = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'throw',
  }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return {
    required: true as const,
    content: {
      'application/json': { schema: jsonSchema as JsonSchema },
    },
  };
}

export function jsonResponse(description: string, schema: JsonSchema) {
  return {
    description,
    content: {
      'application/json': { schema },
    },
  };
}

export function resp(description: string) {
  return {
    description,
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/Error' } },
    },
  };
}

export function ref400() {
  return resp('Validation error');
}

export function ref401() {
  return resp('Unauthorized');
}

export function ref404() {
  return resp('Not found');
}

export function refMessage() {
  return {
    description: 'Success',
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/Message' } },
    },
  };
}

export function refSuccess() {
  return {
    description: 'Success',
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/Success' } },
    },
  };
}

export function refGraph() {
  return jsonResponse('Graph data', {
    type: 'object',
    properties: {
      nodes: { type: 'array', items: { $ref: '#/components/schemas/GraphNode' } },
      edges: { type: 'array', items: { $ref: '#/components/schemas/GraphEdge' } },
    },
  });
}
