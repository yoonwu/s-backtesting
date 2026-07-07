# ============================================================
# install_new_eas.ps1 — 점화·압축 EA 자동 설치 (본계좌+대회계좌)
# 하는 일: 깃허브에서 EA 2종+프리셋 3종 다운로드 → 모든 MT5
# 인스턴스(AppData 터미널 + MT5 포터블 폴더) 탐색 → 복사 → 컴파일
# 실행: PowerShell에 아래 한 줄 붙여넣기
#   irm https://raw.githubusercontent.com/yoonwu/s-backtesting/main/mt5/install_new_eas.ps1 | iex
# ============================================================
$ErrorActionPreference = "Continue"
$raw  = "https://raw.githubusercontent.com/yoonwu/s-backtesting/main/mt5"
$eas  = @("Momentum_Ignition_EA.mq5","Volatility_Squeeze_EA.mq5")
$sets = @("IGN_XAU_H4.set","SQZ_XAU_H4.set","SQZ_US100_H4.set")

Write-Host ""
Write-Host "=== [1/4] GitHub에서 파일 다운로드 ===" -ForegroundColor Cyan
$tmp = Join-Path $env:TEMP "s_backtesting_eas"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
foreach($f in $eas){  Invoke-WebRequest -UseBasicParsing "$raw/$f"      -OutFile (Join-Path $tmp $f); Write-Host "  v $f" }
foreach($f in $sets){ Invoke-WebRequest -UseBasicParsing "$raw/sets/$f" -OutFile (Join-Path $tmp $f); Write-Host "  v $f" }

Write-Host ""
Write-Host "=== [2/4] MT5 인스턴스 탐색 ===" -ForegroundColor Cyan
$targets = @()
# (a) 일반 설치 터미널 (AppData 데이터폴더)
$term = Join-Path $env:APPDATA "MetaQuotes\Terminal"
if(Test-Path $term){
  Get-ChildItem $term -Directory | ForEach-Object {
    $m = Join-Path $_.FullName "MQL5"
    if(Test-Path (Join-Path $m "Experts")){ $targets += $m }
  }
}
# (b) 포터블 인스턴스 (MT5_contest 등) — 주요 위치에서 폴더명에 MT5 들어간 폴더 탐색
$roots = @("$env:USERPROFILE\Desktop","$env:USERPROFILE\Documents","$env:USERPROFILE\Downloads","C:\","D:\","E:\")
foreach($r in $roots){
  if(-not (Test-Path $r)){ continue }
  Get-ChildItem $r -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "MT5|MetaTrader" } | ForEach-Object {
    # 자기 자신 또는 한 단계 아래에 MQL5\Experts가 있으면 포터블 인스턴스
    $cands = @($_.FullName) + (Get-ChildItem $_.FullName -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
    foreach($c in $cands){
      $m = Join-Path $c "MQL5"
      if(Test-Path (Join-Path $m "Experts")){ $targets += $m }
    }
  }
}
$targets = $targets | Sort-Object -Unique
if($targets.Count -eq 0){ Write-Host "  X MT5 폴더를 못 찾았습니다. MT5에서 파일>데이터 폴더 열기 후 경로를 알려주세요." -ForegroundColor Red; return }
foreach($t in $targets){ Write-Host "  발견: $t" }

Write-Host ""
Write-Host "=== [3/4] 복사 ===" -ForegroundColor Cyan
foreach($t in $targets){
  $exp = Join-Path $t "Experts"
  $pre = Join-Path $t "Presets"
  if(-not (Test-Path $pre)){ New-Item -ItemType Directory -Force -Path $pre | Out-Null }
  foreach($f in $eas){  Copy-Item (Join-Path $tmp $f) $exp -Force }
  foreach($f in $sets){ Copy-Item (Join-Path $tmp $f) $pre -Force }
  Write-Host "  v 복사 완료: $t"
}

Write-Host ""
Write-Host "=== [4/4] 컴파일 ===" -ForegroundColor Cyan
# metaeditor64.exe 후보 수집: 포터블 폴더 안 + Program Files
$editors = @()
foreach($t in $targets){
  $me = Join-Path (Split-Path $t -Parent) "metaeditor64.exe"
  if(Test-Path $me){ $editors += $me }
}
foreach($p in @("C:\Program Files","C:\Program Files (x86)")){
  if(Test-Path $p){
    Get-ChildItem $p -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "MetaTrader|Infinox|MT5" } | ForEach-Object {
      $me = Join-Path $_.FullName "metaeditor64.exe"
      if(Test-Path $me){ $editors += $me }
    }
  }
}
$editors = $editors | Sort-Object -Unique
if($editors.Count -eq 0){
  Write-Host "  X metaeditor64.exe를 못 찾았습니다 — MT5 내비게이터에서 EA 우클릭>수정>F7로 수동 컴파일하세요." -ForegroundColor Yellow
}else{
  foreach($t in $targets){
    # 이 인스턴스와 짝인 에디터 선택(포터블이면 자기 폴더의 에디터, 아니면 첫 후보)
    $me = Join-Path (Split-Path $t -Parent) "metaeditor64.exe"
    if(-not (Test-Path $me)){ $me = $editors[0] }
    foreach($f in $eas){
      $src = Join-Path (Join-Path $t "Experts") $f
      $ex5 = [IO.Path]::ChangeExtension($src, ".ex5")
      if(Test-Path $ex5){ Remove-Item $ex5 -Force }
      Start-Process -FilePath $me -ArgumentList "/compile:`"$src`"","/log" -Wait -WindowStyle Hidden
      if(Test-Path $ex5){ Write-Host "  v 컴파일 OK : $ex5" -ForegroundColor Green }
      else{ Write-Host "  X 컴파일 실패: $src (같은 폴더 .log 확인)" -ForegroundColor Red }
    }
  }
}

Write-Host ""
Write-Host "=== 완료 ===" -ForegroundColor Cyan
Write-Host "남은 것: 각 MT5에서 차트 3개 열고 EA 붙이기"
Write-Host "  XAUUSD H4  <- Momentum_Ignition_EA  + IGN_XAU_H4.set   (880201)"
Write-Host "  XAUUSD H4  <- Volatility_Squeeze_EA + SQZ_XAU_H4.set   (880202)"
Write-Host "  US100  H4  <- Volatility_Squeeze_EA + SQZ_US100_H4.set (880203)"
