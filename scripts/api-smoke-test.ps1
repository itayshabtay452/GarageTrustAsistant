
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# פונקציה להוספת תוצאה למערך $results
function Add-Result {
    param(
        [string]$name,
        [bool]$passed,
        [int]$status,
        [string]$message
    )
    $global:results += @{
        TestName = $name
        Passed = $passed
        Status = $status
        Message = $message
    }
}

$BaseUrl = "http://localhost:3000/api/generate"
$global:results = @()

# בדיקה 1: 200 עם message תקין
$headers = @{ "x-forwarded-for" = "203.0.113.1" }
try {
    $bodyJson = @{ message = "פרטי רכב: הונדה סיוויק, שנה: 2020. שאלת הלקוח: המנוע מפיץ קול מוזר" } | ConvertTo-Json -Depth 5
    $response = Invoke-WebRequest -Uri $BaseUrl -Method "POST" -ContentType "application/json" -Headers $headers -Body $bodyJson -UseBasicParsing -ErrorAction "Stop"
    $statusCode = $response.StatusCode
    $content = $response.Content | ConvertFrom-Json
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $content = $null
    if ($_.Exception.Response) {
        try {
            $responseStream = $_.Exception.Response.GetResponseStream()
            $reader = [System.IO.StreamReader]::new($responseStream)
            $content = $reader.ReadToEnd() | ConvertFrom-Json
            $reader.Close()
        } catch {}
    }
}
$passed = $false
$message = ""
if ($statusCode -eq 200 -and $content -and $content.ok -eq $true -and $content.data.answer -and $content.data.answer.Length -gt 0) {
    $passed = $true
} else {
    $message = "צפוי 200 עם תשובה תקינה, קבל $statusCode"
}
Add-Result "בקשה תקינה עם message" $passed $statusCode $message

# בדיקה 2: 400 כשחסר message
$headers = @{ "x-forwarded-for" = "203.0.113.2" }
try {
    $bodyJson = @{} | ConvertTo-Json -Depth 5
    $response = Invoke-WebRequest -Uri $BaseUrl -Method "POST" -ContentType "application/json" -Headers $headers -Body $bodyJson -UseBasicParsing -ErrorAction "Stop"
    $statusCode = $response.StatusCode
    $content = $response.Content | ConvertFrom-Json
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $content = $null
    if ($_.Exception.Response) {
        try {
            $responseStream = $_.Exception.Response.GetResponseStream()
            $reader = [System.IO.StreamReader]::new($responseStream)
            $content = $reader.ReadToEnd() | ConvertFrom-Json
            $reader.Close()
        } catch {}
    }
}
$passed = $false
$message = ""
if ($statusCode -eq 400 -and $content -and $content.ok -eq $false -and $content.error.message -and $content.error.message.Length -gt 0) {
    $passed = $true
} else {
    $message = "צפוי 400 עם הודעת שגיאה, קבל $statusCode"
}
Add-Result "400 כש-message חסר" $passed $statusCode $message

# בדיקה 3: 400 כש-message קצר מדי
$headers = @{ "x-forwarded-for" = "203.0.113.3" }
try {
    $bodyJson = @{ message = "ab" } | ConvertTo-Json -Depth 5
    $response = Invoke-WebRequest -Uri $BaseUrl -Method "POST" -ContentType "application/json" -Headers $headers -Body $bodyJson -UseBasicParsing -ErrorAction "Stop"
    $statusCode = $response.StatusCode
    $content = $response.Content | ConvertFrom-Json
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $content = $null
    if ($_.Exception.Response) {
        try {
            $responseStream = $_.Exception.Response.GetResponseStream()
            $reader = [System.IO.StreamReader]::new($responseStream)
            $content = $reader.ReadToEnd() | ConvertFrom-Json
            $reader.Close()
        } catch {}
    }
}
$passed = $false
$message = ""
if ($statusCode -eq 400 -and $content -and $content.ok -eq $false -and $content.error.message -like "*3*") {
    $passed = $true
} else {
    $message = "צפוי 400 עם הודעה על אורך, קבל $statusCode"
}
Add-Result "400 כש-message קצר מ-3 תווים" $passed $statusCode $message

# בדיקה 4: 400 כש-body הוא JSON לא תקין
$headers = @{ "x-forwarded-for" = "203.0.113.4" }
try {
    $response = Invoke-WebRequest -Uri $BaseUrl -Method "POST" -ContentType "application/json" -Headers $headers -Body "{not-json}" -UseBasicParsing -ErrorAction "Stop"
    $statusCode = $response.StatusCode
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
}
$passed = $statusCode -eq 400
$message = if ($passed) { "" } else { "צפוי 400, קבל $statusCode" }
Add-Result "400 כש-JSON לא תקין" $passed $statusCode $message

# בדיקה 5: 429 אחרי 12 בקשות רצופות
$headers = @{ "x-forwarded-for" = "203.0.113.5" }
$statusCodes = @()
for ($i = 1; $i -le 12; $i++) {
    try {
        $bodyJson = @{ message = "בדיקה $i" } | ConvertTo-Json -Depth 5
        $response = Invoke-WebRequest -Uri $BaseUrl -Method "POST" -ContentType "application/json" -Headers $headers -Body $bodyJson -UseBasicParsing -ErrorAction "Stop"
        $statusCodes += $response.StatusCode
    } catch {
        $statusCodes += $_.Exception.Response.StatusCode.value__
    }
}
$passed = $false
$message = ""
if ($statusCodes -contains 429) {
    $passed = $true
} else {
    $message = "לא קיבלנו 429 אחרי 12 בקשות (קיבלנו: $($statusCodes -join ', '))"
}
$finalStatus = if ($statusCodes -contains 429) { 429 } elseif ($statusCodes.Count -gt 0) { $statusCodes[-1] } else { 0 }
Add-Result "429 אחרי 12 בקשות מהירות" $passed $finalStatus $message

# בדיקה 6: בדיקה שהתשובה בעברית
$headers = @{ "x-forwarded-for" = "203.0.113.6" }
try {
    $bodyJson = @{ message = "פרטי רכב: טויוטה קורולה. שאלה: כמה עולה החלפת שמן?" } | ConvertTo-Json -Depth 5
    $response = Invoke-WebRequest -Uri $BaseUrl -Method "POST" -ContentType "application/json" -Headers $headers -Body $bodyJson -UseBasicParsing -ErrorAction "Stop"
    $statusCode = $response.StatusCode
    $content = $response.Content | ConvertFrom-Json
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $content = $null
    if ($_.Exception.Response) {
        try {
            $responseStream = $_.Exception.Response.GetResponseStream()
            $reader = [System.IO.StreamReader]::new($responseStream)
            $content = $reader.ReadToEnd() | ConvertFrom-Json
            $reader.Close()
        } catch {}
    }
}
$passed = $false
$message = ""
if ($statusCode -eq 200 -and $content -and $content.data -and $content.data.answer) {
    $hebrewRegex = '[\u0590-\u05FF]'
    if ($content.data.answer -match $hebrewRegex) {
        $passed = $true
    } else {
        $message = "התשובה לא מכילה תו עברי"
    }
} else {
    $message = "צפוי 200 עם תשובה בעברית, קבל $statusCode"
}
Add-Result "התשובה מכילה תוכן בעברית" $passed $statusCode $message

# הדפסת סיכום
$passCount = ($results | Where-Object { $_.Passed }).Count
$failCount = ($results | Where-Object { -not $_.Passed }).Count

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "תוצאות הבדיקות" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
foreach ($result in $results) {
    $status = if ($result.Passed) { "✓ PASS" } else { "✗ FAIL" }
    $color = if ($result.Passed) { "Green" } else { "Red" }
    Write-Host "$status - $($result.TestName)" -ForegroundColor $color
    if ($result.Message) {
        Write-Host "       הודעה: $($result.Message)" -ForegroundColor Gray
    }
    if ($result.Status) {
        Write-Host "       HTTP סטטוס: $($result.Status)" -ForegroundColor Gray
    }
    Write-Host ""
}
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "סך הכל בדיקות: 6" -ForegroundColor Cyan
Write-Host "תוצאה סופית: $passCount PASSED, $failCount FAILED" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "======================================" -ForegroundColor Cyan
