# Vercel Deployment Guide and Troubleshooting

## 1. Deployment Checklist
1. Repository is pushed to GitHub.
2. Vercel project imported from GitHub.
3. Framework preset is **Other**.
4. Root directory is repository root.
5. Deployment completes without build/runtime import errors.

## 2. Required URL Checks
After each deploy, verify:

```bash
curl "https://<deployment>/manifest.json"
curl "https://<deployment>/health"
curl "https://<deployment>/stream/movie/tt32820897.json"
curl "https://<deployment>/stream/series/tt14186672:1:1.json"
```

Expected results:
- Manifest endpoint returns JSON with `id`, `name`, `resources`.
- Health endpoint returns `status: ok`.
- Stream endpoints return JSON with `streams` array.

## 3. CORS Validation
Stremio clients need permissive CORS. Confirm response headers include:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`

Headers are configured in `vercel.json`.

## 4. Function Timeout Considerations
This addon may follow multi-hop redirects (HubCloud chains), so requests can be slow.

Current config:
- `vercel.json` sets `functions["api/index.js"].maxDuration = 60`.

If you still see timeouts:
1. Increase timeout if your Vercel plan allows it.
2. Reduce upstream retries and request timeout variables.
3. Validate upstream host latency from Vercel logs.

## 5. Upstream Availability
If sources like MoviesDrive/HubCloud are down or blocked, deployment can still be healthy while streams are empty.

Use these checks:
1. `health` and `manifest` work = deployment is healthy.
2. `streams: []` with no server crash = likely upstream issue.
3. Check runtime logs in Vercel for fetch failures/timeouts.

## 6. GitHub Actions Behavior
CI is configured as checks-only:
- install
- entrypoint import check
- syntax checks
- unit tests

Deployment is handled by Vercel Git Integration, not by GitHub Action deploy secrets.

## 7. Local Pre-Deploy Validation
Run before pushing:

```bash
npm ci
npm run check:vercel-entry
node --check src/index.js
node --check api/index.js
node --test tests/*.test.js
node test-vercel-local.js
```

If these pass, GitHub-import deployment should be stable.
