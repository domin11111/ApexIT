<#
    Что из сайта компонентов сейчас работает. Зовётся в конце «запуск
    компонентов.bat», но годится и отдельно.

    Три ступени, и каждая ломается по-своему: жив процесс, но домен
    недоступен — потух Caddy (Cloudflare отдаёт 522); домен отвечает, но
    не компонентами — маршрута нет в конфиге Caddy, и запрос ушёл в ленивца.
    Страницу узнаём по тексту «Compute Collection»: его нет ни у ленивца,
    ни у скринера.
#>
[CmdletBinding()]
param(
    [int]$Port = 25580,
    [string]$Url = 'https://lenivec.online/app/components/',
    [string]$Mark = 'Compute Collection'
)

# Windows PowerShell 5.1 по умолчанию может предложить серверу устаревший TLS.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# Редиректы проходим сами. Главная сайта — /app/components, а адрес со
# слэшем Next уводит туда кодом 308, которого Windows PowerShell 5.1
# (.NET Framework) редиректом не считает и отдаёт как ошибку.
function Get-Status {
    param([string]$Uri)
    for ($hop = 0; $hop -le 3; $hop++) {
        $code = $null
        $location = $null
        try {
            $r = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
            $code = [int]$r.StatusCode
            if ($code -lt 300 -or $code -ge 400) { return @{ Code = $code; Body = $r.Content } }
            $location = $r.Headers['Location']
        } catch {
            $resp = $_.Exception.Response
            if (-not $resp) { return @{ Code = $null; Body = '' } }
            $code = [int]$resp.StatusCode
            $location = $resp.Headers['Location']
        }
        if ($code -lt 300 -or $code -ge 400 -or -not $location) { return @{ Code = $code; Body = '' } }
        $Uri = ([Uri]::new([Uri]$Uri, [string]$location)).AbsoluteUri
    }
    return @{ Code = $code; Body = '' }
}

# 1. Сам сайт, мимо Caddy.
$local = Get-Status "http://127.0.0.1:$Port/app/components/"
if ($local.Code -eq 200 -and $local.Body -match $Mark) {
    Write-Host ("  [ok] Компоненты     127.0.0.1:{0}" -f $Port)
} else {
    Write-Host ("  [!]  Компоненты     не отвечают на 127.0.0.1:{0} - см. окно «components Site»" -f $Port)
}

# 2. Caddy на 443.
$caddy = @(Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue |
           ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } |
           Where-Object { $_.ProcessName -eq 'caddy' })
if ($caddy.Count -gt 0) {
    Write-Host ("  [ok] Caddy (443)    PID {0}" -f $caddy[0].Id)
} else {
    Write-Host '  [!]  Caddy (443)    НЕ запущен'
}

# 3. Снаружи, через Cloudflare. Страница должна быть именно компонентов.
$ext = Get-Status $Url
if ($ext.Code -eq 200 -and $ext.Body -match $Mark) {
    Write-Host ("  [ok] {0} отвечает 200" -f $Url)
} elseif ($ext.Code -eq 200) {
    Write-Host ("  [!]  {0} отвечает, но не компоненты - маршрута нет в Caddyfile?" -f $Url)
} elseif ($ext.Code) {
    Write-Host ("  [!]  {0} отвечает {1}" -f $Url, $ext.Code)
} else {
    Write-Host ("  [!]  {0} недоступен" -f $Url)
}
