$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $PSCommandPath
  Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList $arguments
  exit
}

$port = 8765
$root = Split-Path -Parent $PSCommandPath
$source = Join-Path $root 'ClassroomHost.cs'
$ruleName = 'Particle Clicker Classroom (' + [Guid]::NewGuid().ToString('N') + ')'
$hostServer = $null
$ruleCreated = $false

function Test-PrivateIPv4([string]$Address) {
  $bytes = [System.Net.IPAddress]::Parse($Address).GetAddressBytes()
  return $bytes[0] -eq 10 -or
    ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or
    ($bytes[0] -eq 192 -and $bytes[1] -eq 168)
}

try {
  if (-not (Test-Path -LiteralPath $source)) {
    throw 'The classroom host file is missing. Re-extract the classroom ZIP and try again.'
  }

  $adapters = Get-NetAdapter -Physical -ErrorAction Stop |
    Where-Object { $_.Status -eq 'Up' } |
    Sort-Object @{
      Expression = {
        if ($_.Name -match 'wi-?fi|wireless') { 0 }
        elseif ($_.Name -match 'ethernet') { 1 }
        else { 2 }
      }
    }, Name

  $classroomAddress = $null
  foreach ($adapter in $adapters) {
    $classroomAddress = Get-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object {
        $_.AddressState -eq 'Preferred' -and
        $_.IPAddress -notlike '169.254.*' -and
        (Test-PrivateIPv4 $_.IPAddress)
      } |
      Select-Object -First 1 -ExpandProperty IPAddress
    if ($classroomAddress) {
      break
    }
  }
  if (-not $classroomAddress) {
    throw 'Connect this computer to the classroom Wi-Fi or network, then start the game again.'
  }

  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort $port -Profile Private,Domain `
    -RemoteAddress LocalSubnet | Out-Null
  $ruleCreated = $true

  Add-Type -Path $source -ReferencedAssemblies 'System.Web.Extensions.dll'
  $stopToken = ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N'))
  $hostServer = New-Object ClassroomHost($root, $port, '+', $stopToken)
  $hostServer.Start()

  $teacherUrl = "http://${classroomAddress}:${port}/?classroom=local&teacher=1#stop=$stopToken"
  Start-Process $teacherUrl

  $expiresAt = (Get-Date).AddHours(2)
  while ($hostServer.IsRunning -and (Get-Date) -lt $expiresAt) {
    Start-Sleep -Seconds 1
  }
}
catch {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    $_.Exception.Message,
    'Particle Clicker classroom could not start',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
}
finally {
  if ($hostServer) {
    $hostServer.Stop()
  }
  if ($ruleCreated) {
    Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  }
}
