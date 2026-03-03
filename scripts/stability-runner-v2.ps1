param(
  [switch]$IncludeSuccess
)

$ErrorActionPreference = 'Stop'

$endpoint = 'http://localhost:3000/api/generate-v2'
$failures = 0
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$envFilePath = Join-Path $workspaceRoot '.env.local'
$script:envBackup = $null
$script:envTouched = $false

function Disable-OpenAiApiKeyTemporarily {
  if (-not (Test-Path $envFilePath)) {
    $script:envBackup = $null
    $script:envTouched = $false
    return
  }

  $content = Get-Content $envFilePath -Raw
  $script:envBackup = $content

  $updated = [regex]::Replace($content, '(?m)^\s*OPENAI_API_KEY\s*=.*(\r?\n)?', '')
  if ($updated -ne $content) {
    Set-Content $envFilePath $updated
    $script:envTouched = $true
  } else {
    $script:envTouched = $false
  }
}

function Restore-OpenAiApiKey {
  if ($null -ne $script:envBackup) {
    Set-Content $envFilePath $script:envBackup
  }

  $script:envBackup = $null
  $script:envTouched = $false
}

function Invoke-Scenario {
  param(
    [Parameter(Mandatory = $true)][hashtable]$Scenario
  )

  $name = $Scenario.Name
  $expectedStatus = [int]$Scenario.ExpectedStatus
  $expectedOk = [bool]$Scenario.ExpectedOk
  $expectedErrorCode = $Scenario.ExpectedErrorCode
  $isRaw = [bool]$Scenario.IsRaw
  $body = $Scenario.Body

  Write-Output ""
  Write-Output "[$name]"

  $actualStatus = $null
  $rawContent = $null

  if ($Scenario.ContainsKey('Before') -and $Scenario.Before) {
    try {
      & $Scenario.Before
    }
    catch {
      Write-Output "FAIL - setup error: $($_.Exception.Message)"
      return $false
    }
  }

  try {
    try {
      if ($isRaw) {
        $response = Invoke-WebRequest -Uri $endpoint -Method POST -ContentType 'application/json' -Body $body -ErrorAction Stop
      } else {
        $jsonBody = $body | ConvertTo-Json -Depth 10 -Compress
        $response = Invoke-WebRequest -Uri $endpoint -Method POST -ContentType 'application/json' -Body $jsonBody -ErrorAction Stop
      }

      $actualStatus = [int]$response.StatusCode
      $rawContent = $response.Content
    }
    catch {
      if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
        $actualStatus = [int]$_.Exception.Response.StatusCode
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $rawContent = $reader.ReadToEnd()
        $reader.Dispose()
      } else {
        Write-Output "FAIL - request error: $($_.Exception.Message)"
        return $false
      }
    }

    $statusPass = $actualStatus -eq $expectedStatus
    if (-not $statusPass) {
      Write-Output "FAIL - status expected=$expectedStatus actual=$actualStatus"
      Write-Output "Response: $rawContent"
      return $false
    }

    $parsed = $null
    try {
      $parsed = $rawContent | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
      Write-Output "FAIL - response is not valid JSON"
      Write-Output "Response: $rawContent"
      return $false
    }

    if ($null -eq $parsed.ok) {
      Write-Output "FAIL - missing 'ok' in response"
      Write-Output "Response: $rawContent"
      return $false
    }

    $okPass = ([bool]$parsed.ok) -eq $expectedOk
    if (-not $okPass) {
      Write-Output "FAIL - ok expected=$expectedOk actual=$([bool]$parsed.ok)"
      Write-Output "Response: $rawContent"
      return $false
    }

    if ($null -ne $expectedErrorCode -and $expectedErrorCode -ne '') {
      $actualErrorCode = $null
      if ($parsed.error -and $parsed.error.code) {
        $actualErrorCode = [string]$parsed.error.code
      }

      if ($actualErrorCode -ne $expectedErrorCode) {
        Write-Output "FAIL - error.code expected=$expectedErrorCode actual=$actualErrorCode"
        Write-Output "Response: $rawContent"
        return $false
      }
    }

    Write-Output "PASS - status=$actualStatus ok=$([bool]$parsed.ok)"
    return $true
  }
  finally {
    if ($Scenario.ContainsKey('After') -and $Scenario.After) {
      try {
        & $Scenario.After
      }
      catch {
        Write-Output "WARN - cleanup error: $($_.Exception.Message)"
      }
    }
  }
}

$baseValidPayload = @{
  schema_version = '2.0'
  transcript = @(
    @{ customer_said = 'שלום' }
  )
  latest_customer_message = 'יש לי רעש מהמנוע'
}

$deterministicScenarios = @(
  @{
    Name = '400-malformed-json'
    Body = '{ "schema_version": "2.0", "transcript": ['
    IsRaw = $true
    ExpectedStatus = 400
    ExpectedOk = $false
    ExpectedErrorCode = 'BAD_REQUEST'
  },
  @{
    Name = '400-missing-required-fields'
    Body = @{
      schema_version = '2.0'
      transcript = @(
        @{ customer_said = 'שלום' }
      )
    }
    IsRaw = $false
    ExpectedStatus = 400
    ExpectedOk = $false
    ExpectedErrorCode = 'BAD_REQUEST'
  },
  @{
    Name = '400-invalid-schema-version'
    Body = @{
      schema_version = '1.0'
      transcript = @(
        @{ customer_said = 'שלום' }
      )
      latest_customer_message = 'יש לי רעש מהמנוע'
    }
    IsRaw = $false
    ExpectedStatus = 400
    ExpectedOk = $false
    ExpectedErrorCode = 'BAD_REQUEST'
  },
  @{
    Name = '500-missing-api-key'
    Body = $baseValidPayload
    IsRaw = $false
    ExpectedStatus = 500
    ExpectedOk = $false
    ExpectedErrorCode = 'MISSING_API_KEY'
    Before = { Disable-OpenAiApiKeyTemporarily }
    After = { Restore-OpenAiApiKey }
    Note = 'Temporarily removes OPENAI_API_KEY from .env.local and restores it after the scenario.'
  }
)

$optionalSuccessScenario = @{
  Name = '200-success-valid-v2'
  Body = $baseValidPayload
  IsRaw = $false
  ExpectedStatus = 200
  ExpectedOk = $true
  ExpectedErrorCode = $null
  Note = 'Requires valid OPENAI_API_KEY and healthy upstream response.'
}

Write-Output '=== Stability Runner: POST /api/generate-v2 ==='
Write-Output "Endpoint: $endpoint"
Write-Output ''
Write-Output 'Default deterministic execution (4 scenarios):'
Write-Output '- 400 malformed JSON'
Write-Output '- 400 missing required fields'
Write-Output '- 400 invalid schema_version'
Write-Output '- 500 missing API key (temporary unset in .env.local)'
Write-Output ''
Write-Output 'Optional scenario (not executed by default):'
Write-Output '- 200 success (requires valid OPENAI_API_KEY + upstream availability)'
Write-Output "- Include with: -IncludeSuccess=$($IncludeSuccess.IsPresent)"
Write-Output ''
Write-Output 'Documented-only (not executed):'
Write-Output '- 422 MODEL_OUTPUT_INVALID_V2 (hard to force deterministically without model-output injection)'
Write-Output '- 502 UPSTREAM_ERROR (avoid forcing outages; use safe controlled simulation only)'
Write-Output ''

foreach ($scenario in $deterministicScenarios) {
  if ($scenario.ContainsKey('Note') -and $scenario.Note) {
    Write-Output "Note: $($scenario.Note)"
  }

  $result = Invoke-Scenario -Scenario $scenario
  if (-not $result) {
    $failures++
  }
}

if ($IncludeSuccess.IsPresent) {
  if ($optionalSuccessScenario.ContainsKey('Note') -and $optionalSuccessScenario.Note) {
    Write-Output "Note: $($optionalSuccessScenario.Note)"
  }

  $successResult = Invoke-Scenario -Scenario $optionalSuccessScenario
  if (-not $successResult) {
    $failures++
  }
}

Write-Output ''
if ($failures -gt 0) {
  Write-Output "RESULT: FAIL ($failures scenario(s) failed)"
  exit 1
}

if ($IncludeSuccess.IsPresent) {
  Write-Output 'RESULT: PASS (all executed scenarios passed, including success)'
} else {
  Write-Output 'RESULT: PASS (all deterministic scenarios passed)'
}
Write-Output "Tip: Run optional success manually when OPENAI_API_KEY is configured: $($optionalSuccessScenario.Name)"
exit 0
