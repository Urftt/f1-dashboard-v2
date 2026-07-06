// Single serialized request queue for the OpenF1 API.
//
// The free tier rate-limits hard (observed: 429s from the 4th rapid request,
// no Retry-After header). Every fetch in the app MUST go through apiGet so
// requests are spaced and 429s retried with backoff. Nothing else may call
// fetch() against api.openf1.org.

const BASE = 'https://api.openf1.org/v1'

const MIN_SPACING_MS = 500
const MAX_ATTEMPTS = 5

let lastDispatch = 0
let chain: Promise<unknown> = Promise.resolve()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function dispatch(path: string): Promise<unknown> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const wait = lastDispatch + MIN_SPACING_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastDispatch = Date.now()

    let res: Response
    try {
      res = await fetch(`${BASE}/${path}`)
    } catch (err) {
      // network hiccup — retry like a 429
      if (attempt === MAX_ATTEMPTS - 1) throw err
      await sleep(1000 * 2 ** attempt + Math.random() * 300)
      continue
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_ATTEMPTS - 1) {
        throw new Error(`OpenF1 ${res.status} after ${MAX_ATTEMPTS} attempts: ${path}`)
      }
      await sleep(1000 * 2 ** attempt + Math.random() * 300)
      continue
    }
    // OpenF1 signals "no rows for this query" with a 404
    if (res.status === 404) return []
    if (!res.ok) throw new Error(`OpenF1 ${res.status}: ${path}`)
    return res.json()
  }
  throw new Error(`unreachable: ${path}`)
}

/** GET {BASE}/{path}, serialized app-wide, 429-safe. */
export function apiGet<T>(path: string): Promise<T> {
  const result = chain.then(
    () => dispatch(path),
    () => dispatch(path), // one request failing must not poison the queue
  )
  chain = result.catch(() => undefined)
  return result as Promise<T>
}
