// Local-only integration fixture: real JSON-RPC over stdio, no model/network access.
import { createInterface } from 'node:readline'
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
createInterface({ input: process.stdin }).on('line', line => {
  try {
    const message = JSON.parse(line)
    if (message.id === undefined) return
    if (message.method === 'initialize') return reply(message.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'ccweb-local-test', version: '1.0.0' } })
    if (message.method === 'tools/list') return reply(message.id, { tools: [{ name: 'echo', description: 'Returns the supplied test text unchanged', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] })
    if (message.method === 'tools/call') return reply(message.id, { content: [{ type: 'text', text: String(message.params?.arguments?.text ?? 'LOCAL_MCP_OK') }] })
    reply(message.id, {})
  } catch { /* Malformed test input does not produce a protocol response. */ }
})
