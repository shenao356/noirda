@echo off
title NOIRDA - Control de Gastos y Contabilidad
cd /d "%~dp0"
echo ===================================================
echo     Iniciando NOIRDA Control de Gastos...
echo     Propietario: Santiago Varelas
echo ===================================================
echo.
python server.py
pause
