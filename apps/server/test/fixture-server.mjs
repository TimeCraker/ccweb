import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@anthropic-ai/claude-agent-sdk' && !/(?:config-api|runtime)\.(?:ts|js)$/.test(context.parentURL ?? '')) return { shortCircuit: true, url: new URL('./fixture-sdk.mjs', import.meta.url).href }
  return next(specifier, context)
} })
await import(process.env.CCWEB_FIXTURE_ENTRY ? pathToFileURL(process.env.CCWEB_FIXTURE_ENTRY).href : new URL('../dist/index.js', import.meta.url).href)
