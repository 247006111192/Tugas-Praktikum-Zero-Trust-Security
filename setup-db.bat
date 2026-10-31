@echo off
title Zero Trust Security - Setup Database
echo Menyiapkan database Zero Trust Security...
set "PATH=D:\nodejs;%PATH%"
node scripts\setup-database.js
echo.
pause
