@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Visibilidad algorítmica · Sevilla

rem Lanzador local de la aplicación. No modifica el dataset ni los ficheros fuente.
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%" || goto :no_dir

set "PORT=8767"
set "URL=http://127.0.0.1:%PORT%/"
set "PYTHON=%APP_DIR%.venv\Scripts\python.exe"
set "QUARTO_PYTHON=%PYTHON%"

echo.
echo  Visibilidad algorítmica · Sevilla
echo  ---------------------------------
echo  Carpeta: %APP_DIR%
echo.

rem --- Python base -----------------------------------------------------------
set "BASE_PY="
where python >nul 2>nul && set "BASE_PY=python"
if not defined BASE_PY (
  where py >nul 2>nul && set "BASE_PY=py -3"
)
if not defined BASE_PY goto :no_python

%BASE_PY% -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>nul
if errorlevel 1 goto :old_python

rem --- Quarto ---------------------------------------------------------------
set "QUARTO="
for /f "delims=" %%Q in ('where quarto 2^>nul') do if not defined QUARTO set "QUARTO=%%Q"
if not defined QUARTO if exist "%LOCALAPPDATA%\Programs\Quarto\bin\quarto.exe" set "QUARTO=%LOCALAPPDATA%\Programs\Quarto\bin\quarto.exe"
if not defined QUARTO if exist "%ProgramFiles%\Quarto\bin\quarto.exe" set "QUARTO=%ProgramFiles%\Quarto\bin\quarto.exe"
if not defined QUARTO goto :no_quarto

for /f "delims=" %%V in ('"%QUARTO%" --version 2^>nul') do set "QUARTO_VERSION=%%V"
echo  Quarto: %QUARTO_VERSION%

rem --- Entorno virtual ------------------------------------------------------
if not exist "%PYTHON%" (
  echo  Creando el entorno virtual .venv...
  %BASE_PY% -m venv .venv
  if errorlevel 1 goto :venv_failed
)

"%PYTHON%" -c "import sys" >nul 2>nul
if errorlevel 1 goto :venv_broken

"%PYTHON%" -c "import shiny, pandas, numpy, openpyxl, pyproj, tifffile, PIL, ipykernel, jupyter_client, nbclient, nbformat" >nul 2>nul
if errorlevel 1 (
  echo  Instalando dependencias desde requirements.txt...
  "%PYTHON%" -m pip install --disable-pip-version-check --upgrade pip
  "%PYTHON%" -m pip install --disable-pip-version-check -r requirements.txt
  if errorlevel 1 goto :deps_failed
  "%PYTHON%" -c "import shiny, pandas, numpy, openpyxl, pyproj, tifffile, PIL, ipykernel, jupyter_client, nbclient, nbformat" >nul 2>nul
  if errorlevel 1 goto :deps_failed
)

"%PYTHON%" -c "import socket; s = socket.socket(); s.settimeout(0.5); busy = s.connect_ex(('127.0.0.1', %PORT%)) == 0; s.close(); raise SystemExit(1 if busy else 0)"
if errorlevel 1 goto :port_busy

rem --- Recursos y render ----------------------------------------------------
echo  Reconstruyendo recursos (KDE, CSS y JavaScript)...
"%PYTHON%" build_assets.py
if errorlevel 1 goto :build_failed

if exist "app.py" del /q "app.py"
echo  Renderizando el documento Quarto...
call "%QUARTO%" render index.qmd
if errorlevel 1 goto :render_failed
if not exist "app.py" goto :no_app

echo.
echo  Servidor local: %URL%
echo  Pulsa Ctrl+C para detener la aplicación.
echo.

"%PYTHON%" -m shiny run app.py --host 127.0.0.1 --port %PORT% --launch-browser

echo.
echo  La aplicación se ha detenido.
pause
exit /b 0

:no_dir
echo  [ERROR] No se encuentra la carpeta de la aplicación.
pause
exit /b 1

:no_python
echo  [ERROR] No se encuentra Python 3.12 o superior.
echo          Instala Python desde https://www.python.org/downloads/ y marca
echo          la opción "Add python.exe to PATH".
pause
exit /b 1

:old_python
echo  [ERROR] La versión de Python encontrada es anterior a 3.12.
echo          Instala una versión compatible y vuelve a ejecutar el lanzador.
pause
exit /b 1

:no_quarto
echo  [ERROR] No se encuentra Quarto.
echo          Instálalo desde https://quarto.org/docs/get-started/ o añade
echo          quarto.exe al PATH. También se busca en:
echo          %LOCALAPPDATA%\Programs\Quarto\bin
echo          %ProgramFiles%\Quarto\bin
pause
exit /b 1

:venv_failed
echo  [ERROR] No se pudo crear el entorno virtual .venv.
pause
exit /b 1

:venv_broken
echo  [ERROR] El entorno virtual .venv existe pero no se puede ejecutar.
echo          Elimina la carpeta .venv y vuelve a ejecutar el lanzador.
pause
exit /b 1

:deps_failed
echo  [ERROR] No se pudieron instalar las dependencias.
echo          Revisa la conexión y ejecuta manualmente:
echo          .venv\Scripts\python.exe -m pip install -r requirements.txt
pause
exit /b 1

:port_busy
echo  [ERROR] El puerto %PORT% ya está ocupado.
echo          Cierra la otra instancia de la aplicación o el proceso que lo use.
pause
exit /b 1

:build_failed
echo  [ERROR] Falló la reconstrucción de recursos.
echo          Comprueba que existe ..\Visibilidad_Algoritmica_Sevilla_KDE.tif.
pause
exit /b 1

:render_failed
echo  [ERROR] Falló el renderizado de Quarto.
echo          Revisa los mensajes anteriores.
pause
exit /b 1

:no_app
echo  [ERROR] Quarto terminó sin generar app.py.
echo          Revisa los mensajes anteriores.
pause
exit /b 1
