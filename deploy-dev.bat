@echo off
REM Build headlo-client-react in staging mode and deploy to a separate CF
REM Pages project for the "dev" URL. Points at api-dev.headlo.com per
REM .env.staging (independent of prod deploys).
REM Project name: headlo-client-react-dev  ->  https://headlo-client-react-dev.pages.dev
REM
REM Why a second project (not just a Preview URL of prod):
REM   - Stable URL to share with teammates for iteration + review
REM   - Doesn't touch prod deployments list / rollback history
REM   - Points at the dev backend (api-dev.headlo.com) so schema/migration
REM     testing doesn't hit prod data
REM
REM Prereqs:
REM   1. CF Pages project exists — auto-created on first run.
REM      OR explicit setup:
REM        npx wrangler pages project create headlo-client-react-dev --production-branch=main
REM      ⚠️ Match the production branch to what deploy-prod uses (main here).
REM      Mismatch → deploys land as Preview + never populate the canonical URL.
REM   2. .env.staging (already present) — VITE_HEADLO_AUTH_ISSUER +
REM      VITE_HEADLO_API_URL point at api-dev.headlo.com.
REM   3. Staging publishable key's allowed_origins on the DEV worker
REM      (dashboard → Application → Allowed origins) includes:
REM        https://headlo-client-react-dev.pages.dev
REM      Missing this → 403 ORIGIN_NOT_ALLOWED on PROP requests.
REM
REM Same SDK-rebuild rationale as deploy-prod.bat — Vite reads whatever is
REM in each linked package's dist/ at build time; stale dists → stale bundle
REM → Pages emits "Uploaded 0 files" (no-op deploy).

cd /d D:\headlo\headlo-repo\headlo-client-react || exit /b 1

echo === Rebuilding headlo-auth SDK...
call npm run build --prefix ..\headlo-auth || exit /b 1

echo === Rebuilding headlo-sdk + headlo-react...
call npm run build --prefix ..\headlo-sdk || exit /b 1
call npm run build --prefix ..\headlo-react || exit /b 1

echo === Building headlo-client-react (staging mode)...
call npm run build:staging || exit /b 1

echo === Deploying to Cloudflare Pages (dev / staging)...
call node_modules\.bin\wrangler pages deploy dist --project-name=headlo-client-react-dev --branch=main --commit-dirty=true || exit /b 1

echo.
echo Deploy to dev complete.
pause
