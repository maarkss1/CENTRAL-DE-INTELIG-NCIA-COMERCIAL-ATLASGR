import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { LEAD_STATUS, leadSchema } from '../../../../src/lib/zod.js';

const document = parse(readFileSync('docs/openapi.yaml', 'utf8')) as {
    components: { schemas: Record<string, any> };
};
const schemas = document.components.schemas;

describe('DATA-008 — contrato OpenAPI de Lead', () => {
    it('mantém LeadStatus exatamente igual ao enum aceito pelo backend', () => {
        expect(schemas.LeadStatus.enum).toEqual([...LEAD_STATUS]);
    });

    it('documenta exatamente os campos aceitos por leadSchema', () => {
        expect(Object.keys(schemas.LeadInput.properties).sort()).toEqual(
            Object.keys(leadSchema.shape).sort(),
        );
    });

    it('preserva as restrições dos campos comerciais críticos', () => {
        expect(schemas.LeadInput.properties.funnel.enum).toEqual(['Lead', 'Negocio']);
        expect(schemas.LeadInput.properties.amount.minimum).toBe(0);
        expect(schemas.LeadInput.properties.probability).toMatchObject({
            type: 'integer',
            minimum: 0,
            maximum: 100,
            nullable: true,
        });
        expect(schemas.LeadInput.properties.title.maxLength).toBe(180);
    });
});
