@echo off
title Zero Trust Security - Services (Port 3000, 3001, 3002)
echo Memulai seluruh service Zero Trust Security...
set "PATH=D:\nodejs;%PATH%"
node scripts\start-all.js
pause
