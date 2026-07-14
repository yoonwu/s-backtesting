# .env 로드 후 계좌 조회 도구 실행 (Windows)
Set-Location $PSScriptRoot
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim())
    }
}
python probe_cash.py
