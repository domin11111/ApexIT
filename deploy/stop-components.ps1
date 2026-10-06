<#
    Останавливает сайт компонентов, поднятый «запуск компонентов.bat» (D:\BOT_SERVER).

    Caddy НЕ трогает: он общий с ленивцем и скринером, и закрыть его значит
    положить lenivec.online целиком. Компоненты без Caddy просто не видны
    снаружи, а ленивец без Caddy — лежит.

    Процесс ищем по полному пути к deploy\server.mjs этой копии. Dev-сервер
    (`next dev` на :3000) и локальные `next start` для замеров запускаются
    через node_modules\next и под отпечаток не попадают — остаются жить.
    Окно cmd, из которого сайт запущен, под отпечаток попадает — и это нужно:
    убитый поодиночке node оставил бы пустую рамку.

    Код возврата: 0 — порт свободен, можно запускаться; 1 — его кто-то держит.
#>
[CmdletBinding()]
param(
    [int]$Port = 25580,
    # Сокет освобождается не мгновенно, поэтому порт ждём, а не проверяем
    # один раз сразу после taskkill.
    [int]$WaitSeconds = 10
)

$entry = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'server.mjs'))


function Get-ListeningPid {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        return @($conn.OwningProcess | Select-Object -Unique)
    } catch {
        return @()
    }
}


function Stop-Tree {
    param([int]$ProcessId, [string]$Title)
    & taskkill.exe /F /T /PID $ProcessId 2>&1 | Out-Null
    Write-Host ("  закрыто: {0,-16} PID {1}" -f $Title, $ProcessId)
}


$stopped = 0
$procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
           Where-Object { $_.CommandLine })

foreach ($p in $procs) {
    if ($p.ProcessId -eq $PID) { continue }
    if ($p.CommandLine -like '*stop-components*') { continue }
    if ($p.CommandLine -like "*$entry*") {
        Stop-Tree -ProcessId $p.ProcessId -Title 'Компоненты'
        $stopped++
    }
}

# Добиваем по порту, но только node: сайт могли запустить руками другой
# командой. Чужой процесс на этом порту не наш — о нём только говорим.
foreach ($owner in (Get-ListeningPid -Port $Port)) {
    if (-not $owner -or $owner -eq 0) { continue }
    $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'node') {
        Stop-Tree -ProcessId $owner -Title ("порт " + $Port)
        $stopped++
    }
}

if ($stopped -eq 0) {
    Write-Host '  нечего закрывать, сайт уже выключен'
}

$deadline = (Get-Date).AddSeconds($WaitSeconds)
do {
    $owners = @(Get-ListeningPid -Port $Port)
    if ($owners.Count -eq 0) { exit 0 }
    Start-Sleep -Milliseconds 400
} while ((Get-Date) -lt $deadline)

foreach ($owner in $owners) {
    $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { '?' }
    Write-Host ("  [!] порт {0} занят: {1} (PID {2})" -f $Port, $name, $owner)
}
exit 1
