<#
    Убеждается, что на 443 работает Caddy с маршрутом сайта компонентов.
    Копия caddy-for-screener.ps1 из скринера flomu — скрипт универсальный.

    Caddy — общая дверь домена: на 443 может сидеть только один процесс,
    поэтому у ленивца, скринера и компонентов он один, с конфигом
    D:\BOT_SERVER\lenivec\deploy\Caddyfile. Кто первым запущен — тот и
    поднимает.

      * Caddy уже работает (его поднял ленивец или скринер) — НЕ
        перезапускаем, иначе на пару секунд легли бы и соседи. Делаем
        `caddy reload`: конфиг перечитывается на ходу, без обрыва
        соединений. Это на случай, если Caddy стартовал раньше, чем в
        Caddyfile появился маршрут компонентов; если конфиг не менялся,
        reload ничего не делает.
      * Caddy не запущен — поднимает батник, в окне «lenivec Caddy». Имя
        окна и путь к конфигу в командной строке — те же, что у ленивца,
        поэтому «запуск ленивца.bat» считает этот Caddy своим: закроет его и
        поднимет заново с тем же конфигом.

    Код возврата: 0 — Caddy работает, конфиг применён; 1 — не вышло
    (443 держит кто-то другой или Caddy не принял конфиг), причина
    выведена; 2 — Caddy не запущен, батнику поднять его самому.
#>
[CmdletBinding()]
param(
    [string]$Caddy = 'caddy',
    [Parameter(Mandatory = $true)][string]$Config
)

$owners = @(Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique)

if ($owners.Count -eq 0) {
    Write-Host '  Caddy не запущен - поднимаю'
    exit 2
}

$names = @($owners | ForEach-Object { (Get-Process -Id $_ -ErrorAction SilentlyContinue).ProcessName })
if ($names -notcontains 'caddy') {
    Write-Host ("  [!] порт 443 занят: {0} (PID {1}) - Caddy встать не сможет" -f ($names -join ', '), ($owners -join ', '))
    exit 1
}

# Caddy пишет журнал в stderr; в PowerShell 5.1 это превращается в
# «ошибки», поэтому код возврата смотрим сами, а вывод показываем только
# при неудаче.
$out = & $Caddy reload --config $Config 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host '  [!] Caddy не принял конфиг и работает со старым:'
    $out | Select-Object -Last 3 | ForEach-Object { Write-Host "      $_" }
    exit 1
}
Write-Host '  Caddy уже работает - конфиг перечитан'
exit 0
