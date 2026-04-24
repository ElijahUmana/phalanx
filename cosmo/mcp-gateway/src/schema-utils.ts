// Minimal zod → JSON-Schema converter sufficient for the 5 Phalanx tools.
// Avoids pulling zod-to-json-schema as a dep; only supports the shapes used
// by tools.ts. If we extend the tool set to richer types, swap to the proper
// package instead of piling more cases here.

import { z } from 'zod';

export type JsonSchema = {
    type: string;
    properties?: Record<string, JsonSchema>;
    items?: JsonSchema;
    required?: string[];
    enum?: readonly string[];
    description?: string;
    additionalProperties?: boolean;
};

export function zodToJsonSchema(schema: z.ZodType): JsonSchema {
    if (schema instanceof z.ZodObject) {
        const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
        const properties: Record<string, JsonSchema> = {};
        const required: string[] = [];
        for (const [key, value] of Object.entries(shape)) {
            const inner = unwrapOptional(value as z.ZodType);
            properties[key] = zodToJsonSchema(inner.schema);
            if (!inner.optional) required.push(key);
        }
        return {
            type: 'object',
            properties,
            required,
            additionalProperties: false,
        };
    }
    if (schema instanceof z.ZodString) {
        const desc = (schema as z.ZodString).description;
        return desc ? { type: 'string', description: desc } : { type: 'string' };
    }
    if (schema instanceof z.ZodNumber) {
        return { type: 'number' };
    }
    if (schema instanceof z.ZodBoolean) {
        return { type: 'boolean' };
    }
    if (schema instanceof z.ZodArray) {
        const inner = (schema as z.ZodArray<z.ZodType>).element;
        return { type: 'array', items: zodToJsonSchema(inner) };
    }
    if (schema instanceof z.ZodEnum) {
        return { type: 'string', enum: (schema as z.ZodEnum<[string, ...string[]]>).options };
    }
    // Fallback: describe as string so the tool still registers.
    return { type: 'string' };
}

function unwrapOptional(schema: z.ZodType): { schema: z.ZodType; optional: boolean } {
    if (schema instanceof z.ZodOptional) {
        return { schema: (schema as z.ZodOptional<z.ZodType>).unwrap(), optional: true };
    }
    if (schema instanceof z.ZodDefault) {
        return { schema: (schema as z.ZodDefault<z.ZodType>).removeDefault(), optional: true };
    }
    return { schema, optional: false };
}
