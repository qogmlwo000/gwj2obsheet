@echo off
chcp 65001 > nul 2>&1
title GWJ2 OB PDA 일지
cd /d "%~dp0"

where node > nul 2>&1
if errorlevel 1 (
    echo.
    echo  ============================================================
    echo   Node.js가 설치되어 있지 않습니다.
    echo   https://nodejs.org 에서 LTS 버전을 다운로드해서 설치하세요.
    echo  ============================================================
    echo.
    pause
    exit /b 1
)

node server.js

REM 서버가 비정상 종료되면 창이 곧바로 사라지지 않도록
if errorlevel 1 pause
