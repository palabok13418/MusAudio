$ErrorActionPreference = 'Stop'

npm run build
wrangler pages deploy dist
