import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createContext } from './context.js';
import { registerTools } from './tools.js';

/**
 * Servidor MCP `aluguei-meta` (transport stdio).
 *
 * Segurança: o LLM recebe apenas IDs locais (orgId, connection_id, property_id,
 * campaign_id). Credenciais Meta ficam no backend (secret store/env criptografado);
 * nenhuma tool aceita ou retorna access_token.
 */
export async function main(): Promise<void> {
  const ctx = createContext();
  const server = new McpServer(
    { name: 'aluguei-meta', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  registerTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Executa quando chamado diretamente (não quando importado por testes).
const isDirectRun =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirectRun) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`aluguei-meta falhou: ${message}`);
    process.exit(1);
  });
}

export { createContext } from './context.js';
export { registerTools } from './tools.js';
