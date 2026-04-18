// Model Context Protocol (MCP) server endpoint. Exposes the same tool
// registry used by the assistant over a minimal JSON-RPC 2.0 transport, so
// Claude Desktop / VS Code / any MCP client can authenticate with a bridge
// token and call Nametag tools directly.
//
// Implemented methods (subset of spec):
//   * initialize
//   * tools/list
//   * tools/call
//   * ping
//
// Auth: Authorization: Bearer <nmt_...> (required). Tokens scoped "mcp" or
// "*" are accepted.

import { NextResponse } from 'next/server';
import { apiResponse, handleApiError } from '@/lib/api-utils';
import { extractBearer, verifyBridgeToken } from '@/lib/assistant/bridge-auth';
import { listTools, runTool } from '@/lib/assistant/tools';

export const runtime = 'nodejs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'nametag-mcp', version: '1.0.0' };

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(
  id: JsonRpcRequest['id'],
  code: number,
  message: string,
  data?: unknown,
) {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

async function handleRpc(
  req: JsonRpcRequest,
  userId: string,
): Promise<unknown> {
  switch (req.method) {
    case 'initialize':
      return rpcResult(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case 'ping':
      return rpcResult(req.id, {});
    case 'tools/list': {
      const tools = listTools().map((t) => ({
        name: t.definition.name,
        description: t.definition.description,
        inputSchema: t.definition.parameters,
      }));
      return rpcResult(req.id, { tools });
    }
    case 'tools/call': {
      const params = (req.params ?? {}) as { name?: string; arguments?: unknown };
      if (!params.name) return rpcError(req.id, -32602, 'Missing "name" param');
      const { result, isError } = await runTool(params.name, params.arguments, {
        userId,
      });
      const text =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return rpcResult(req.id, {
        content: [{ type: 'text', text }],
        isError,
      });
    }
    default:
      return rpcError(req.id, -32601, `Method not found: ${req.method}`);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const bearer = extractBearer(request);
    if (!bearer) return apiResponse.unauthorized('Missing bearer token');
    const authed = await verifyBridgeToken(bearer, 'mcp');
    if (!authed) return apiResponse.unauthorized('Invalid token');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiResponse.error('Invalid JSON');
    }

    // Support both single requests and JSON-RPC batches.
    if (Array.isArray(body)) {
      const responses = await Promise.all(
        body.map((r) => handleRpc(r as JsonRpcRequest, authed.user.id)),
      );
      return NextResponse.json(responses);
    }
    const response = await handleRpc(body as JsonRpcRequest, authed.user.id);
    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error, 'POST /api/mcp');
  }
}

export async function GET(): Promise<Response> {
  // Minimal discovery for clients that probe before POSTing.
  return NextResponse.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocolVersion: PROTOCOL_VERSION,
    transports: ['http+jsonrpc'],
    methods: ['initialize', 'tools/list', 'tools/call', 'ping'],
  });
}
