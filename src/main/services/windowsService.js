const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function escapePowerShell(text) {
  return text.replace(/'/g, "''");
}

async function runPowerShell(script, elevated = false) {
  if (!elevated) {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ]);
    return;
  }

  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const elevationWrapper = [
    "$ErrorActionPreference = 'Stop'",
    `$proc = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'`,
    "if ($null -eq $proc) { throw '未能启动管理员权限进程。' }",
    "exit $proc.ExitCode"
  ].join("; ");

  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    elevationWrapper
  ]);
}

async function setDesktopWallpaper(imagePath) {
  const safePath = escapePowerShell(imagePath);
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type @'",
    "using System.Runtime.InteropServices;",
    "public class NativeWallpaper {",
    '  [DllImport("user32.dll", SetLastError = true)]',
    "  public static extern bool SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);",
    "}",
    "'@",
    `$result = [NativeWallpaper]::SystemParametersInfo(20, 0, '${safePath}', 3)`,
    "if (-not $result) { throw '桌面壁纸设置失败。' }",
    "rundll32.exe user32.dll, UpdatePerUserSystemParameters"
  ].join("\n");

  await runPowerShell(script, false);
}

async function setLockScreenWallpaper(imagePath) {
  const safePath = escapePowerShell(imagePath);
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$cspPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PersonalizationCSP'",
    "$policyPath = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization'",
    "New-Item -Path $cspPath -Force | Out-Null",
    "Set-ItemProperty -Path $cspPath -Name LockScreenImageStatus -Type DWord -Value 1",
    `Set-ItemProperty -Path $cspPath -Name LockScreenImagePath -Value '${safePath}'`,
    `Set-ItemProperty -Path $cspPath -Name LockScreenImageUrl -Value '${safePath}'`,
    "New-Item -Path $policyPath -Force | Out-Null",
    `Set-ItemProperty -Path $policyPath -Name LockScreenImage -Value '${safePath}'`
  ].join("\n");

  await runPowerShell(script, true);
}

async function getWindowsProductName() {
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "(Get-ComputerInfo -Property WindowsProductName).WindowsProductName"
    ]);
    return stdout.trim();
  } catch {
    return "Windows";
  }
}

module.exports = {
  getWindowsProductName,
  setDesktopWallpaper,
  setLockScreenWallpaper
};

