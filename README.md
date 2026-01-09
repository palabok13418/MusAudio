# MusAudio — For Now

This folder is the **deploy root** for the public MusAudio website + API.

Path:
- `c:\Users\TS\Downloads\Multi\Website version`

## What’s in here

- `index.html`, `styles.css`, `app.js`
  - Public site (rebuilt from scratch; no distribute/eruda features)
- `netlify.toml` + `netlify/functions/*`
  - Netlify serverless endpoints
- `vercel.json` + `api/*`
  - Vercel serverless endpoints
- `functions/*`
  - Cloudflare Pages Functions (TypeScript)
- `php/*`
  - PHP versions of `/health` and `/amp` (lyrics proxy)

## API endpoints

All deploy targets expose:

- `GET /health`
  - Returns JSON like `{ ok:true, status:'ok' }`

- `GET /amp?url=<encoded>`
  - Proxies requests to Apple Music AMP endpoints (and certain related hosts)
  - For lyrics, the client must send:
    - `Authorization: Bearer <dev token>`
    - `Music-User-Token: <user token>`

## MusAumz.html proxy failover

`MusAumz.html` now supports **multiple proxy base URLs**.

In settings, the `Apple proxy base URL` field can contain multiple URLs separated by:
- whitespace
- commas
- newlines

Example:

```
https://your-netlify-site.netlify.app
https://your-vercel-site.vercel.app
https://your-pages-site.pages.dev
```

Behavior:
- On `file://` / `null` origin, the app probes each base URL’s `/health` sequentially.
- The **first one that responds OK** is cached in `localStorage` and used for `/amp`.
- If the cached proxy starts failing, the cache is cleared and the app re-probes.

## Notes

- The `/amp` proxy only allows a limited set of upstream hosts (Apple AMP + related), by design.
- Tokens should not be hard-coded into the deployed website.
