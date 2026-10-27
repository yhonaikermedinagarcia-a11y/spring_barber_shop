@echo off
REM Arranca en local la API (puerto 3000) y la web (puerto 5173) de Spring Barber Shop.
REM Cada servidor se abre en su propia ventana; para pararlo, cierra la ventana o pulsa Ctrl+C.
REM Requiere PostgreSQL encendido con los datos de backend\.env.
REM "npm install" instala lo que falte (por ejemplo, la libreria de Excel) y es rapido si ya esta todo.
start "Spring - API (3000)" /D "%~dp0backend" cmd /k "npm install --no-audit --no-fund && npm start"
start "Spring - Web (5173)" /D "%~dp0frontend" cmd /k "npm install --no-audit --no-fund && npm run dev"
timeout /t 12 /nobreak >nul
start "" http://localhost:5173
