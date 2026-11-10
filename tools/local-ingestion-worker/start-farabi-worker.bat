@echo off
chcp 65001 >nul
title Farabi AI — Local Ingestion Worker (Windows)
color 0B

echo ==============================================================================
echo             FARABI AI — LOCAL WINDOWS INGESTION WORKER
echo   High-Performance Local PDF Processing, Gemini OCR & TiDB Sync
echo ==============================================================================
echo.

cd /d "%~dp0"

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js v18+ from https://nodejs.org
    pause
    exit /b 1
)

:: Check for .env.worker
if not exist ".env.worker" (
    echo [NOTICE] .env.worker not found. Creating from .env.worker.example...
    copy ".env.worker.example" ".env.worker" >nul
    echo [INFO] Standalone local offline OCR active (Poppler + Tesseract ara+eng). Zero TiDB credentials and zero paid APIs required.
    echo.
)

:: Create local archive storage directory if missing
if not exist "C:\FarabiAI\storage\books" (
    mkdir "C:\FarabiAI\storage\books" 2>nul
    echo [INFO] Initialized local archive storage at C:\FarabiAI\storage\books
)

echo [INFO] Starting Farabi Local Ingestion Worker on http://127.0.0.1:5050 ...
echo [INFO] Listening strictly on loopback (127.0.0.1). Press Ctrl+C to stop.
echo.

:: Launch worker using tsx from server node_modules
npx --prefix ../../server tsx src/index.ts

if %errorlevel% neq 0 (
    echo.
    echo [PROCESS EXITED WITH CODE %errorlevel%]
    pause
)

