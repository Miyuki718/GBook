param(
    [string]$DataDirectory = $(if ($env:GBOOK_DATA_DIR) { $env:GBOOK_DATA_DIR } else { Join-Path $env:LOCALAPPDATA 'GBook' }),
    [string]$NodePath,
    [ValidateRange(1024, 65535)][int]$Port = 3030,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$url = "http://127.0.0.1:$Port/"
$logDir = Join-Path $project '.test-data'
$mutex = New-Object Threading.Mutex($false, "Local\GBookDesktop$Port")
$locked = $false

function Read-Shelf {
    try {
        $response = $http.GetAsync("${url}api/state").GetAwaiter().GetResult()
        try {
            if ($response.IsSuccessStatusCode) {
                return ($response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
            }
        } finally { $response.Dispose() }
    } catch { return $null }
}

try {
    try { $locked = $mutex.WaitOne(30000) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (!$locked) { throw 'Another GBook launcher is still starting.' }
    if (!$NodePath) { $NodePath = (Get-Command node.exe).Source }
    $DataDirectory = [IO.Path]::GetFullPath($DataDirectory)
    $database = Join-Path $DataDirectory 'library.db'
    if (!(Test-Path -LiteralPath (Join-Path $project 'apps/web/.next/BUILD_ID'))) { throw 'The GBook production build is missing.' }

    $env:GBOOK_DATA_DIR = $DataDirectory
    $env:PORT = [string]$Port
    Set-Location -LiteralPath $project
    $readIds = 'const db = new (require(''better-sqlite3''))(process.argv[1], { readonly: true, fileMustExist: true }); console.log(JSON.stringify(db.prepare(''SELECT id FROM books WHERE deleted = 0 ORDER BY id'').pluck().all())); db.close();'

    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object Net.Http.HttpClientHandler
    $handler.UseProxy = $false
    $handler.AllowAutoRedirect = $false
    $http = New-Object Net.Http.HttpClient($handler)
    $http.Timeout = [TimeSpan]::FromSeconds(2)
    $shelf = Read-Shelf
    if ($shelf -and !(Test-Path -LiteralPath $database -PathType Leaf)) {
        throw "Port $Port is already serving a different library."
    }
    if (!$shelf) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        $server = Start-Process -FilePath $NodePath -ArgumentList @('--use-env-proxy','scripts/web.mjs','start') `
            -WorkingDirectory $project -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logDir "desktop-$Port.out.log") `
            -RedirectStandardError (Join-Path $logDir "desktop-$Port.err.log")
        $deadline = [DateTime]::UtcNow.AddSeconds(25)
        do {
            Start-Sleep -Milliseconds 300
            $shelf = Read-Shelf
        } until ($shelf -or $server.HasExited -or [DateTime]::UtcNow -ge $deadline)
    }

    if (!$shelf -or !$shelf.csrf) { throw "GBook did not start. Check the logs in $logDir" }
    $expected = & $NodePath -e $readIds $database
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the selected GBook library.' }
    $expected = @((ConvertFrom-Json -InputObject $expected) | Sort-Object) -join ','
    $actual = @($shelf.books | ForEach-Object { $_.id } | Sort-Object) -join ','
    if ($actual -cne $expected) { throw "Port $Port is serving a different library. Close that service before opening this shortcut." }
    if (!$NoBrowser) { Start-Process $url }
} catch {
    if ($NoBrowser) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show($_.Exception.Message, 'GBook')
    exit 1
} finally {
    if ($http) { $http.Dispose() }
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
