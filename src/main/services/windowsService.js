const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function escapePowerShell(text) {
  return text.replace(/'/g, "''");
}

async function runPowerShell(script) {
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ]);
}

async function isProcessElevated() {
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
    ]);
    return stdout.trim().toLowerCase() === "true";
  } catch {
    return false;
  }
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

  await runPowerShell(script);
}

async function setLockScreenWallpaperSilently(imagePath) {
  const elevated = await isProcessElevated();
  if (!elevated) {
    return {
      applied: false,
      reason: "当前不是管理员模式，已跳过锁屏设置以避免系统弹窗。"
    };
  }

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

  try {
    await runPowerShell(script);
    return {
      applied: true,
      reason: ""
    };
  } catch {
    return {
      applied: false,
      reason: "当前 Windows 版本或系统策略不允许静默设置锁屏壁纸。"
    };
  }
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
  isProcessElevated,
  setDesktopWallpaper,
  setLockScreenWallpaperSilently
};
