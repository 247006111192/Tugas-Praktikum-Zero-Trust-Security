@echo off
title Zero Trust Security - Automated Tests
echo Menjalankan 38 skenario automated test (Jest)...
set "PATH=D:\nodejs;%PATH%"
node node_modules\jest\bin\jest.js --runInBand --detectOpenHandles --forceExit
echo.
pause
