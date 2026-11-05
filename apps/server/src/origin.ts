const devPort = Number(process.env.CCWEB_WEB_PORT ?? 5173)

export function isLoopbackOrigin(origin: string | undefined, port = devPort): boolean {
  if (!origin) return false
  try {
    const url = new URL(origin)
    return url.origin === origin && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && Number(url.port || 80) === port
  } catch {
    return false
  }
}
