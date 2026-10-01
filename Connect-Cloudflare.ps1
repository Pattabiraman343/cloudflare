# Dot-source this file from your project folder to authenticate this PowerShell session.
# Usage: . .\Connect-Cloudflare.ps1

$candidateSecureToken = Read-Host 'Enter your temporary Cloudflare deployment token' -AsSecureString
$candidateTokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($candidateSecureToken)

try {
    $env:CLOUDFLARE_API_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
        $candidateTokenPointer
    )

    $env:CLOUDFLARE_ACCOUNT_ID = '011865f296421c95f1b74d28a7de6c79'
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($candidateTokenPointer)
    $candidateSecureToken.Dispose()

    Remove-Variable candidateSecureToken, candidateTokenPointer -ErrorAction SilentlyContinue
}

Write-Host 'Cloudflare authentication is set for this PowerShell session only.'