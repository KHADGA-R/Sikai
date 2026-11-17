# Run from any directory. Optional merchant secret stays in the process environment.
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    $paypalCredentialPath = Join-Path $PSScriptRoot 'paypal-sandbox.local.xml'
    if (([string]::IsNullOrWhiteSpace($env:PAYPAL_CLIENT_ID) -or [string]::IsNullOrWhiteSpace($env:PAYPAL_CLIENT_SECRET)) -and (Test-Path -LiteralPath $paypalCredentialPath)) {
        $paypalSandboxCredential = Import-Clixml -LiteralPath $paypalCredentialPath
        if ($paypalSandboxCredential -isnot [System.Management.Automation.PSCredential]) { throw 'Invalid PayPal sandbox credential file. Run configure-paypal-sandbox.ps1 again.' }
        $env:PAYPAL_CLIENT_ID = $paypalSandboxCredential.UserName
        $env:PAYPAL_CLIENT_SECRET = $paypalSandboxCredential.GetNetworkCredential().Password
        Write-Host 'Loaded locally encrypted PayPal sandbox credentials.'
    }
    Write-Host 'Starting wallet sandbox: eSewa UAT; fixed test conversion defaults to 100 NPR/USD.'
    if ([string]::IsNullOrWhiteSpace($env:KHALTI_SECRET_KEY)) {
        Write-Host 'Khalti is unavailable until KHALTI_SECRET_KEY is set from test-admin.khalti.com.'
    }
    if ($env:PAYPAL_ENABLED -ne 'true') {
        Write-Host 'PayPal is disabled for now and shown as Available soon.'
    } elseif ([string]::IsNullOrWhiteSpace($env:PAYPAL_CLIENT_ID) -or [string]::IsNullOrWhiteSpace($env:PAYPAL_CLIENT_SECRET)) {
        Write-Host 'PayPal is unavailable until PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are set from a PayPal sandbox app.'
    }
    & mvn '-Dmaven.repo.local=./.m2' 'spring-boot:run' '-Dspring-boot.run.profiles=sandbox'
    $sandboxExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $sandboxExitCode
