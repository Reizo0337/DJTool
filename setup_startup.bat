@echo off
title DJDownloader Windows Startup Installer
cls
echo ====================================================================
echo   DJDownloader Companion - Instalador de Inicio Automatico
echo ====================================================================
echo.
echo Este script configurara DJDownloader para que se inicie automaticamente
echo en segundo plano cada vez que enciendas tu ordenador.
echo.
echo * No mostrara ninguna ventana de consola negra (completamente oculto).
echo * Consumo de recursos de CPU: 0%% mientras no se este descargando nada.
echo * Puerto asignado de forma segura: 48321.
echo.
echo --------------------------------------------------------------------
echo.

:: 1. Crear el lanzador VBScript invisible (ejecuta node server.js en segundo plano sin ventana)
echo [*] Creando lanzador invisible (run_djdownloader.vbs)...
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%~dp0"
echo WshShell.Run "node server.js", 0, false
) > "%~dp0run_djdownloader.vbs"

:: 2. Crear el acceso directo expandiendo %APPDATA% en CMD antes de enviarlo a PowerShell
echo [*] Registrando acceso directo en tu carpeta de Inicio (Startup)...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DJDownloader.lnk'); $Shortcut.TargetPath = '%~dp0run_djdownloader.vbs'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.IconLocation = 'shell32.dll, 137'; $Shortcut.Save()"

echo.
echo ====================================================================
echo  ¡INSTALACION COMPLETADA CON EXITO!
echo ====================================================================
echo.
echo  1. DJDownloader ahora se encendera solo cuando inicies tu PC.
echo  2. Se ejecutara en segundo plano de forma silenciosa en: http://localhost:48321
echo  3. Tu extension de navegador ya esta sincronizada con este nuevo puerto.
echo.
echo  Para encenderlo por primera vez ahora mismo sin reiniciar tu PC,
echo  haz doble clic sobre el archivo recien creado:
echo  "run_djdownloader.vbs"
echo.
echo ====================================================================
pause
