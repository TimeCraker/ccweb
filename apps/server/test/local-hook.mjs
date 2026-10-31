// Local integration fixture. The caller selects an isolated marker path.
import { appendFileSync } from 'node:fs'
const input = []
for await (const chunk of process.stdin) input.push(chunk)
const event = JSON.parse(Buffer.concat(input).toString('utf8') || '{}')
if (process.argv[3]) appendFileSync(process.argv[3], JSON.stringify({ event: event.hook_event_name, tool: event.tool_name }) + '\n')
if (process.argv[2] === 'slow') await new Promise(resolve => setTimeout(resolve, 30000))
if (process.argv[2] === 'fail') { process.stderr.write('LOCAL_HOOK_EXPECTED_FAILURE'); process.exitCode = 2 }
else process.stdout.write(JSON.stringify({ systemMessage: 'LOCAL_HOOK_OK' }) + '\n')
