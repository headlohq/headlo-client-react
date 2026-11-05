@echo off
REM Runs in the current cmd window so Ctrl+C actually kills the whole tree.
REM Previous version used `start cmd /k` which spawned a detached window and
REM left zombie node/npm processes when interrupted.

cd /d D:\headlo\headlo-repo || exit /b 1

echo Building SDK and React...
call npm run build:react || exit /b 1

echo Installing headlo-client-react...
cd headlo-client-react
call npm install --prefer-offline --no-audit --no-fund || exit /b 1

echo Starting local dev server...
call npm run dev
