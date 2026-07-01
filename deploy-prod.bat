@echo off
REM Build all SDK dependencies, then build headlo-client-react and deploy to Cloudflare Pages.
REM Project name: headlo-client-react  ->  https://headlo-client-react.pages.dev
REM
REM Prereqs:
REM   1. CF Pages project exists (one-time setup):
REM        npx wrangler pages project create headlo-client-react --production-branch=main
REM   2. .env contains production values (publishable key, API URL, etc.)
REM      VITE_* env vars are baked into the bundle at build time.
REM
REM Why the SDK rebuilds matter:
REM   headlo-client-react depends on ../headlo-sdk, ../headlo-react, ../headlo-auth
REM   via file: refs. Vite reads whatever is in each SDK's dist/ at build time.
REM   If the SDK dists are stale, the client-react bundle is stale too and
REM   Cloudflare Pages emits "Uploaded 0 files (N already uploaded)" — meaning
REM   the deploy is a no-op because the hashed bundle is identical to last time.
REM
REM Run from this directory (headlo-client-react).

start cmd /k "cd /d D:\headlo\headlo-repo\headlo-client-react && echo === Rebuilding headlo-auth SDK... && call npm run build --prefix ..\headlo-auth && echo === Rebuilding headlo-sdk + headlo-react... && call npm run build --prefix ..\headlo-sdk && call npm run build --prefix ..\headlo-react && echo === Building headlo-client-react... && call npm run build && echo === Deploying to Cloudflare Pages (production)... && npx wrangler pages deploy dist --project-name=headlo-client-react --branch=main --commit-dirty=true"
