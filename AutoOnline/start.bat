@echo off
setlocal

cd /d "%~dp0"

if not exist "bin\Debug\net48\AutoOnline.exe" (
  echo [AutoOnline] 未找到可执行文件，先执行 dotnet build...
  dotnet build
  if errorlevel 1 (
    echo [AutoOnline] 构建失败，请检查错误后重试。
    pause
    exit /b 1
  )
)

echo [AutoOnline] 启动中...
echo [AutoOnline] 使用配置: %~dp0appsettings.json
echo.

"bin\Debug\net48\AutoOnline.exe"

echo.
echo [AutoOnline] 已退出。
pause
