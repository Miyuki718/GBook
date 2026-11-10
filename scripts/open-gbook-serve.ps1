param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$data = Join-Path $env:LOCALAPPDATA 'GBook-Serve'
$mutex = New-Object Threading.Mutex($false, 'Local\GBookPrivateServe')
$locked = $false
$http = $null

try {
    try { $locked = $mutex.WaitOne(30000) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (!$locked) { throw 'Another GBook launcher is starting.' }
    Set-Location -LiteralPath $project
    $node = (Get-Command node.exe).Source
    $status = tailscale status --json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $status.BackendState -ne 'Running') {
        throw 'Connect Tailscale, then open this shortcut again.'
    }
    $dnsName = $status.Self.DNSName.TrimEnd('.')
    if ($dnsName -notmatch '^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$') { throw 'Tailscale DNS is unavailable.' }
    $authority = "${dnsName}:443"
    $serve = tailscale serve status --json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $serve.AllowFunnel.$authority -or
        $serve.Web.$authority.Handlers.'/'.Proxy -ne 'http://127.0.0.1:3135') {
        throw 'The private Tailscale Serve route is unavailable. Restore it before starting GBook.'
    }
    $url = "https://$dnsName/"
    if (!(Test-Path -LiteralPath (Join-Path $data 'library.db') -PathType Leaf)) {
        throw 'The private GBook library database is missing.'
    }
    if (!(Test-Path -LiteralPath 'apps/web/.test-data/owner-build/BUILD_ID')) {
        throw 'The GBook preview build is missing.'
    }
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object Net.Http.HttpClientHandler
    $handler.UseProxy = $false
    $handler.AllowAutoRedirect = $false
    $http = New-Object Net.Http.HttpClient($handler)
    $http.Timeout = [TimeSpan]::FromSeconds(3)
    $pidFile = Join-Path $data 'server.json'
    $running = $false
    if (Test-Path -LiteralPath $pidFile) {
        $record = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
        $process = Get-Process -Id $record.id -ErrorAction SilentlyContinue
        $running = $process -and $process.StartTime.ToFileTimeUtc().ToString() -eq $record.started
    }
    if (!$running) {
        if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3135 -State Listen -ErrorAction SilentlyContinue) {
            throw 'Port 3135 is already in use. Close the other GBook instance and retry.'
        }
        $hashFile = Join-Path $data 'owner-password.hash'
        if (!(Test-Path -LiteralPath $hashFile)) {
            $password = Read-Host 'Create a new GBook library password (12 to 256 characters)' -AsSecureString
            if ($password.Length -lt 12 -or $password.Length -gt 256) { throw 'Use 12 to 256 characters.' }
            try {
                $env:GBOOK_OWNER_PASSWORD = [Net.NetworkCredential]::new('', $password).Password
                $hash = & $node -e 'const c=require(''node:crypto'');const s=c.randomBytes(16);console.log(s.toString(''hex'')+'':''+c.scryptSync(process.env.GBOOK_OWNER_PASSWORD,s,64).toString(''hex''));'
                if ($LASTEXITCODE -ne 0 -or $hash -cnotmatch '^[a-f0-9]{32}:[a-f0-9]{128}$') { throw 'Could not set the password.' }
                Set-Content -LiteralPath $hashFile -Value $hash -Encoding ASCII
            } finally {
                Remove-Item Env:GBOOK_OWNER_PASSWORD -ErrorAction SilentlyContinue
                $password.Dispose()
            }
        }
        $env:GBOOK_OWNER_MODE = '1'
        $env:GBOOK_OWNER_PASSWORD_HASH = (Get-Content -Raw -LiteralPath $hashFile).Trim()
        $env:GBOOK_OWNER_LAN_IP = ''
        $env:GBOOK_OWNER_SERVE_HOST = $dnsName
        $env:GBOOK_OWNER_CHATGPT = '1'
        $env:GBOOK_DATA_DIR = $data
        $env:GBOOK_PREVIEW_BUILD = '1'
        $env:PORT = '3135'
        $server = Start-Process -FilePath $node -ArgumentList 'scripts/web.mjs','start' -WorkingDirectory $project `
            -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $data 'server.out.log') `
            -RedirectStandardError (Join-Path $data 'server.err.log')
        @{ id = $server.Id; started = $server.StartTime.ToFileTimeUtc().ToString() } |
            ConvertTo-Json -Compress | Set-Content -LiteralPath $pidFile -Encoding ASCII
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    do {
        try {
            $response = $http.GetAsync("${url}login").GetAwaiter().GetResult()
            try {
                if ($response.IsSuccessStatusCode -and
                    $response.Content.ReadAsStringAsync().GetAwaiter().GetResult().Contains('data-library="formal"')) {
                    if (!$NoBrowser) { Start-Process $url }
                    return
                }
            } finally { $response.Dispose() }
        } catch { }
        Start-Sleep -Milliseconds 300
    } until ((!$running -and $server.HasExited) -or [DateTime]::UtcNow -ge $deadline)
    throw "GBook did not start. See $data\server.err.log"
} catch {
    if ($NoBrowser) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'GBook Tailscale')
    exit 1
} finally {
    if ($http) { $http.Dispose() }
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
