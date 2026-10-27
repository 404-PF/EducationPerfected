@echo off
setlocal
rem pushd maps UNC paths, unlike cd /d, so a copy on a network share still works.
pushd "%~dp0" || (
    echo Could not open the folder containing this script.
    pause
    exit /b 1
)

rem bin\launch.js checks the Node version and dependencies before starting the program.
node bin\launch.js
if errorlevel 1 (
    echo.
    echo The program stopped with an error; the message above says why.
    pause
)

popd
