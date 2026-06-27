@echo off
start cmd /k "cd /d D:\headlo\headlo-repo && echo Building SDK and React... && npm run build:react && cd headlo-client-react && npm install && echo Starting local dev server... && npm run dev"
