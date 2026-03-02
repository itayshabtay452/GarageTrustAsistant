param(
  [switch]$IncludeSuccess
)

$ErrorActionPreference = 'Stop'

$endpoint = 'http://localhost:3000/api/generate'
$failures = 0

function New-LongString {
  param([int]$Length)
  return ('x' * $Length)
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

$deterministicScenarios = @(
  @{
    Name = '400-malformed-json'
    Body = '{ "message": "hello"'
    IsRaw = $true
    ExpectedStatus = 400
    ExpectedOk = $false
    ExpectedErrorCode = $null
  },
  @{
    Name = '400-missing-input-fields'
    Body = @{}
    IsRaw = $false
    ExpectedStatus = 400
    ExpectedOk = $false
    ExpectedErrorCode = $null
  },
  @{
    Name = '400-invalid-role'
    Body = @{
      messages = @(
        @{ role = 'system'; content = 'טקסט' }
      )
    }
    IsRaw = $false
    ExpectedStatus = 400
    ExpectedOk = $false
    ExpectedErrorCode = $null
  },
  @{
    Name = '400-content-too-long'
    Body = @{
      messages = @(
        @{ role = 'user'; content = (New-LongString -Length 5001) }
      )
    }
    IsRaw = $false
    ExpectedStatus = 400
    ExpectedOk = $false
    ExpectedErrorCode = $null
  },
  @{
    Name = '500-missing-api-key'
    Body = @{ message = 'בדיקה' }
    IsRaw = $false
    ExpectedStatus = 500
    ExpectedOk = $false
    ExpectedErrorCode = 'MISSING_API_KEY'
    Note = 'Requires OPENAI_API_KEY to be unset locally and server restarted.'
  }
)

$optionalSuccessScenario = @{
  Name = '200-success-valid-message'
  Body = @{ message = 'לקוח מבקש תור למחר בבוקר' }
  IsRaw = $false
  ExpectedStatus = 200
  ExpectedOk = $true
  ExpectedErrorCode = $null
  Note = 'Requires valid OPENAI_API_KEY and healthy upstream response.'
}

Write-Output '=== Stability Runner: POST /api/generate ==='
Write-Output "Endpoint: $endpoint"
Write-Output ''
Write-Output 'Default deterministic execution (5 scenarios):'
Write-Output '- 400 malformed JSON'
Write-Output '- 400 missing input fields'
Write-Output '- 400 invalid role'
Write-Output '- 400 content too long'
Write-Output '- 500 missing API key (env must be unset)'
Write-Output ''
Write-Output 'Optional scenario (not executed by default):'
Write-Output '- 200 success (requires valid OPENAI_API_KEY + upstream availability)'
Write-Output "- Include with: -IncludeSuccess=$($IncludeSuccess.IsPresent)"
Write-Output ''
Write-Output 'Documented-only (not executed):'
Write-Output '- 422 MODEL_OUTPUT_INVALID (hard to reproduce without forcing malformed model output)'
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
