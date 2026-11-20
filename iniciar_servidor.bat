@echo off
title Invetario Somex - Servidor FastAPI
echo ========================================================
echo       INICIANDO SERVIDOR INVENTARIO SOMEX TIC
echo ========================================================
cd /d "%~dp0"
if exist "glpi-doc-control\main.py" (
    cd glpi-doc-control
)
python main.py
pause
