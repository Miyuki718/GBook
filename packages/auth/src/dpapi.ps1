param([ValidateSet('encrypt','decrypt')][string]$Operation)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
try {
    $inputBytes = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
    $entropy = [Text.Encoding]::UTF8.GetBytes('GBook.Phase0.DPAPI.v1')
    if ($Operation -eq 'encrypt') {
        $outputBytes = [Security.Cryptography.ProtectedData]::Protect($inputBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    } else {
        $outputBytes = [Security.Cryptography.ProtectedData]::Unprotect($inputBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    }
    [Console]::Out.Write([Convert]::ToBase64String($outputBytes))
} catch {
    [Console]::Error.Write('DPAPI operation failed; no plaintext fallback.')
    exit 1
}
