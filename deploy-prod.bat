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
REM Runs in the current cmd window so Ctrl+C actually kills the whole tree.
REM Previous version used `start cmd /k` which spawned a detached window and
REM left zombie node/npm processes when interrupted.

cd /d D:\headlo\headlo-repo\headlo-client-react || exit /b 1

echo === Rebuilding headlo-auth SDK...
call npm run build --prefix ..\headlo-auth || exit /b 1

echo === Rebuilding headlo-sdk + headlo-react...
call npm run build --prefix ..\headlo-sdk || exit /b 1
call npm run build --prefix ..\headlo-react || exit /b 1

echo === Building headlo-client-react...
call npm run build || exit /b 1

echo === Deploying to Cloudflare Pages (production)...
call node_modules\.bin\wrangler pages deploy dist --project-name=headlo-client-react --branch=main --commit-dirty=true || exit /b 1

echo.
echo Deploy to prod complete.
pause
