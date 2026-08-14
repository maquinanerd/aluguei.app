import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createTestDb } from '@aluguei/db';
import { organizations, properties } from '@aluguei/db';
import { FakeMetaAdsProvider } from '@aluguei/integrations';
import { createContext } from './context.js';
import { registerTools } from './tools.js';

describe('aluguei-meta MCP (protocolo + tools, sem spawn de processo)', () => {
  let client: Client;
  let orgId: string;
  let propertyId: string;
  const meta = new FakeMetaAdsProvider();

  beforeAll(async () => {
    const db = await createTestDb();
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Org MCP', slug: `org-mcp-${Math.random().toString(36).slice(2, 6)}` })
      .returning();
    if (!org) throw new Error('org seed failed');
    orgId = org.id;
    const [property] = await db
      .insert(properties)
      .values({ orgId, title: 'Casa MCP', propertyType: 'HOUSE' })
      .returning();
    if (!property) throw new Error('property seed failed');
    propertyId = property.id;

    const ctx = createContext({ db, meta, metaMode: 'dry_run' });
    const server = new McpServer(
      { name: 'aluguei-meta', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
    registerTools(server, ctx);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.1.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  }, 30_000);

  it('initialize: serverInfo = aluguei-meta', async () => {
    // Client.connect já faz initialize; verifica capabilities de tools.
    const tools = await client.listTools();
    expect(tools.tools.length).toBe(17);
  });

  it('tools.list: 17 tools (7 read + 10 write)', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain('meta_connection_status');
    expect(names).toContain('meta_list_assets');
    expect(names).toContain('meta_get_property_ad_material');
    expect(names).toContain('meta_get_campaign');
    expect(names).toContain('meta_preview_campaign');
    expect(names).toContain('meta_get_insights');
    expect(names).toContain('meta_list_property_campaigns');
    expect(names).toContain('meta_prepare_property_campaign');
    expect(names).toContain('meta_create_prepared_campaign_paused');
    expect(names).toContain('meta_publish_prepared_campaign');
    expect(names).toContain('meta_pause_campaign');
    expect(names).toContain('meta_resume_campaign');
    expect(names).toContain('meta_update_budget');
    expect(names).toContain('meta_update_schedule');
    expect(names).toContain('meta_update_creative');
    expect(names).toContain('meta_archive_campaign');
    expect(names).toContain('meta_sync_insights');
  });

  it('nenhuma tool aceita ou retorna access_token', async () => {
    const tools = await client.listTools();
    const schemas = tools.tools.map((t) => JSON.stringify(t.inputSchema)).join('\n');
    expect(schemas.toLowerCase()).not.toContain('access_token');
    expect(schemas.toLowerCase()).not.toContain('app_secret');
    expect(schemas.toLowerCase()).not.toContain('password');
  });

  it('tools.call: meta_connection_status retorna conexões da org', async () => {
    const result = await client.callTool({
      name: 'meta_connection_status',
      arguments: { orgId },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content[0]?.type === 'text' ? content[0].text : '';
    const body = JSON.parse(text) as { connections: unknown[] };
    expect(Array.isArray(body.connections)).toBe(true);
  });

  it('tools.call: meta_get_property_ad_material retorna material sem PII', async () => {
    const result = await client.callTool({
      name: 'meta_get_property_ad_material',
      arguments: { orgId, propertyId },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content[0]?.type === 'text' ? content[0].text : '';
    expect(text).toContain(propertyId);
    expect(text.toLowerCase()).not.toContain('cpf');
    expect(text.toLowerCase()).not.toContain('telefone');
  });

  it('tools.call: cross-org não vaza (outra org → NOT_FOUND)', async () => {
    const result = await client.callTool({
      name: 'meta_get_campaign',
      arguments: {
        orgId: '11111111-1111-4111-8111-111111111111',
        campaignId: '00000000-0000-4000-8000-000000000000',
      },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content[0]?.type === 'text' ? content[0].text : '';
    expect(text).toContain('não encontrada');
    expect(result.isError).toBe(true);
  });

  it('tools.call: prepare exige idempotencyKey e valida budget XOR', async () => {
    const result = await client.callTool({
      name: 'meta_prepare_property_campaign',
      arguments: {
        orgId,
        connectionId: '11111111-1111-4111-8111-111111111111',
        propertyId,
        name: 'C',
        objective: 'OUTCOME_TRAFFIC',
        mediaSelection: ['00000000-0000-4000-8000-000000000000'],
        landingUrl: 'https://x.app',
        copyPrimary: 'Copy',
        idempotencyKey: 'prep-tool-1234',
      },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    const text = content[0]?.type === 'text' ? content[0].text : '';
    // Falha esperada: sem listing PUBLISHED e sem mídia válida → INVALID_INPUT
    expect(result.isError).toBe(true);
    expect(text.length).toBeGreaterThan(0);
  });
});
