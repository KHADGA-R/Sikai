[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [PSCredential]$Credential,
    [switch]$RegisterInstructor,
    [string]$ApiBase = 'http://localhost:8080/api'
)

$ErrorActionPreference = 'Stop'
$ApiBase = $ApiBase.TrimEnd('/')
$samples = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'sample-courses.json') -Encoding UTF8 -Raw |
    ConvertFrom-Json

$authBody = @{
    email = $Credential.UserName
    password = $Credential.GetNetworkCredential().Password
}
$authRoute = 'login'
if ($RegisterInstructor) {
    $authBody.name = 'Sample Course Instructor'
    $authBody.role = 'instructor'
    $authRoute = 'register'
}

$session = Invoke-RestMethod -Method Post -Uri "$ApiBase/auth/$authRoute" -ContentType 'application/json' -Body ($authBody | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($session.token)" }
$courseUri = "$ApiBase/instructor/courses"

try {
    $ownedCourses = Invoke-RestMethod -Uri $courseUri -Headers $headers
    $created = 0
    foreach ($sample in $samples) {
        if ($ownedCourses.title -contains $sample.title) {
            continue
        }

        $request = @{
            Method = 'Post'
            Uri = $courseUri
            Headers = $headers
            ContentType = 'application/json; charset=utf-8'
            Body = [Text.Encoding]::UTF8.GetBytes(($sample | ConvertTo-Json))
        }
        Invoke-RestMethod @request | Out-Null
        $created++
    }
    Write-Output "Created $created sample courses. Skipped $($samples.Count - $created) existing titles."
}
finally {
    Invoke-RestMethod -Method Post -Uri "$ApiBase/auth/logout" -Headers $headers | Out-Null
}
