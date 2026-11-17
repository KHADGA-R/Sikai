# Windows PowerShell encrypts PSCredential passwords for the current Windows user/machine.
$ErrorActionPreference = 'Stop'
Write-Host 'Use the Client ID and Secret from a Sandbox app in the PayPal Developer Dashboard.'
$paypalClientId = (Read-Host 'PayPal SANDBOX Client ID').Trim()
$paypalSecret = Read-Host 'PayPal SANDBOX Secret (hidden)' -AsSecureString
if ([string]::IsNullOrWhiteSpace($paypalClientId) -or $paypalSecret.Length -eq 0) {
    throw 'Both sandbox credentials are required. Nothing was saved.'
}
$paypalCredential = New-Object System.Management.Automation.PSCredential($paypalClientId, $paypalSecret)
try {
    $paypalAuthorization = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($paypalClientId + ':' + $paypalCredential.GetNetworkCredential().Password))
    $paypalTokenResponse = Invoke-RestMethod -Uri 'https://api-m.sandbox.paypal.com/v1/oauth2/token' -Method Post -Headers @{Authorization = 'Basic ' + $paypalAuthorization} -ContentType 'application/x-www-form-urlencoded' -Body 'grant_type=client_credentials' -TimeoutSec 20
    if ([string]::IsNullOrWhiteSpace($paypalTokenResponse.access_token)) { throw 'Missing sandbox access token' }
} catch {
    throw 'PayPal sandbox validation failed. Check the sandbox Client ID/Secret and internet connection. Nothing was saved.'
} finally {
    $paypalAuthorization = $null
    $paypalTokenResponse = $null
}
$paypalCredential | Export-Clixml -LiteralPath (Join-Path $PSScriptRoot 'paypal-sandbox.local.xml')
Write-Host 'PayPal sandbox credentials validated and saved encrypted for this Windows user.'
Write-Host 'Restart the backend with ./start-sandbox.ps1 to enable PayPal.'
