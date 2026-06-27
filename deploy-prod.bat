@echo off
REM Build headlo-client-react and deploy to Cloudflare Pages.
REM Project name: headlo-client-react  →  https://headlo-client-react.pages.dev
REM
REM Prereqs:
REM   1. CF Pages project exists (one-time setup):
REM        npx wrangler pages project create headlo-client-react --production-branch=main
REM   2. .env contains production values (publishable key, API URL, etc.)
REM      VITE_* env vars are baked into the bundle at build time.
REM
REM Run from this directory.

start cmd /k "cd /d D:\headlo\headlo-repo\headlo-client-react && echo Building... && npm run build && echo Deploying to Cloudflare Pages... && npx wrangler pages deploy dist --project-name=headlo-client-react --branch=main --commit-dirty=true"
