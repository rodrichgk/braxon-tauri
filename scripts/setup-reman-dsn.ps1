<#
Registers the REMAN_4D ODBC DSN under the current user so BRAXON can reach
the REMAN 4D database. Run once per technician machine.

Prerequisites this script does NOT install:
  - 4D ODBC Driver v18 (vendor installer, must already be at the path below)
  - Network access to 192.168.77.10 from this machine

BRAXON forwards the driver's hardcoded port 19812 to the real SQL port
19822 itself at startup (see src-tauri/src/reman.rs::spawn_local_proxy),
so SERVER/PORT_NUMBER below point at localhost, not the real server.
#>

$ErrorActionPreference = 'Stop'

$driverPath = 'C:\Program Files\4D ODBC Driver\v18\4DODBC.dll'
$dsnKey = 'HKCU:\Software\ODBC\ODBC.INI\REMAN_4D'
$sourcesKey = 'HKCU:\Software\ODBC\ODBC.INI\ODBC Data Sources'

if (-not (Test-Path $driverPath)) {
    Write-Warning "4D ODBC Driver not found at $driverPath - install it before this DSN will work."
}

New-Item -ItemType Directory -Force -Path $dsnKey | Out-Null
Set-ItemProperty -Path $dsnKey -Name 'Driver' -Value $driverPath
Set-ItemProperty -Path $dsnKey -Name 'SERVER' -Value '127.0.0.1'
Set-ItemProperty -Path $dsnKey -Name 'PORT_NUMBER' -Value '19812'

New-Item -ItemType Directory -Force -Path $sourcesKey | Out-Null
Set-ItemProperty -Path $sourcesKey -Name 'REMAN_4D' -Value '4D v18 ODBC Driver 64-bit'

Write-Host "REMAN_4D DSN registered under $dsnKey"
Write-Host "Sign in with UID=Technique, blank password, once BRAXON is running (it starts the local port-forward on launch)."
