@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo codex-lattice: Node.js 20 or newer is required. 1>&2
  exit /b 1
)

node "%~dp0codex-lattice.js" %*
exit /b %errorlevel%
