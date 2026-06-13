$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Docs = Join-Path $Root "docs"

function Test-PlatformPage {
    param([int]$Port)
    try {
        $url = "http://127.0.0.1:$Port/index.html"
        $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
        return ($response.StatusCode -ge 200 -and $response.Content -like "*assets/js/common.js*")
    } catch {
        return $false
    }
}

function Test-PortAvailable {
    param([int]$Port)
    $listener = $null
    try {
        $address = [System.Net.IPAddress]::Parse("127.0.0.1")
        $listener = [System.Net.Sockets.TcpListener]::new($address, $Port)
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

function Find-Python {
    $candidates = @(
        @{ File = "py"; Args = @("-3") },
        @{ File = "python"; Args = @() },
        @{ File = "python3"; Args = @() }
    )

    foreach ($candidate in $candidates) {
        $cmd = Get-Command $candidate.File -ErrorAction SilentlyContinue
        if ($cmd) {
            return @{ File = $cmd.Source; Args = $candidate.Args }
        }
    }

    return $null
}

function Quote-Arg {
    param([string]$Value)
    if ($Value -match '\s') {
        return '"' + ($Value -replace '"', '\"') + '"'
    }
    return $Value
}

if (-not (Test-Path (Join-Path $Docs "index.html"))) {
    Write-Host "Cannot find docs/index.html. Start this file from the project folder."
    Read-Host "Press Enter to close"
    exit 1
}

$python = Find-Python
if (-not $python) {
    Write-Host "Python was not found. Install Python 3 or add it to PATH, then run START_LOCAL.cmd again."
    Read-Host "Press Enter to close"
    exit 1
}

foreach ($port in 8000..8010) {
    if (Test-PlatformPage -Port $port) {
        Start-Process "http://127.0.0.1:$port/index.html"
        exit 0
    }

    if (-not (Test-PortAvailable -Port $port)) {
        continue
    }

    $arguments = @($python.Args + @(
        "-m", "http.server", [string]$port,
        "--bind", "127.0.0.1",
        "--directory", $Docs
    )) | ForEach-Object { Quote-Arg $_ }

    Start-Process -FilePath $python.File -ArgumentList ($arguments -join " ") -WorkingDirectory $Root -WindowStyle Hidden | Out-Null

    for ($attempt = 1; $attempt -le 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        if (Test-PlatformPage -Port $port) {
            Start-Process "http://127.0.0.1:$port/index.html"
            exit 0
        }
    }
}

Write-Host "Could not start a local server on ports 8000-8010."
Read-Host "Press Enter to close"
exit 1
