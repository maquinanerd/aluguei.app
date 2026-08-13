import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@aluguei/contracts';
import { buildApp } from './app.js';

describe('GET /health', () => {
  it('responde 200 com body válido pelo contrato', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = healthResponseSchema.parse(response.json());
    expect(body.status).toBe('ok');
    expect(body.service).toBe('api');

    await app.close();
  });
});
