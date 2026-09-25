# Does the new leak rule catch real credentials and spare honest lines?
# The rule is copied verbatim from test/install-local.ps1 so the two cannot drift apart silently.
$credName = '(?i)(?:pass(?:word|phrase)?|secret|apikey|api[-_]key|clientsecret|token|credential)'
$leakPat  = $credName + '\s*[''"]?\s*[:=]\s*[''"]?([^\s''",;})]{6,})'

function Test-Leak([string]$line) {
  if (-not [regex]::IsMatch($line, $leakPat)) { return $false }
  if ($line -match '(?i)<inject|\$\(|\$\{|\$env:|%[A-Za-z_]+%|placeholder|example|changeme|your-|\.\.\.') { return $false }
  if ($line -match '(?i)[:=]\s*(""|''''|\$null|\$true|\$false)\s*,?\s*$') { return $false }
  if ($line -match '(?i)^\s*\[string\]|^\s*param\(') { return $false }
  # a value that is a variable is not a secret
  if ($line -match '[:=]\s*[''"]?\$[A-Za-z_]') { return $false }
  # a value that is an English word is prose; a credential carries a digit, a symbol, or length
  $v = [regex]::Match($line, $leakPat).Groups[1].Value
  if (-not ($v -match '[0-9]|[^A-Za-z0-9]') -and $v.Length -lt 16) { return $false }
  return $true
}

$cases = @(
  @{ n = 'REAL leak: json value';    l = '  "learnerPassword": "fuhy75QQC*GN",';                      want = $true  },
  @{ n = 'REAL leak: ps1 variable';  l = '$apiKey = "sk-abc123def456"';                               want = $true  },
  @{ n = 'REAL leak: cmd set';       l = 'set PASSWORD=Hunter2Hunter2';                               want = $true  },
  @{ n = 'REAL leak: client secret'; l = '  clientSecret: 8Q~aBcDeFgHiJkLmNoP';                       want = $true  },
  @{ n = 'my inject regex';          l = '$t = [regex]::Replace($t, ''<inject key="AzureAdUserPassword">'', ''x'')'; want = $false },
  @{ n = 'my prose line';            l = '    ''the password on the Environment tab''';               want = $false },
  @{ n = 'empty in lab.json';        l = '  "vmAdminPassword": "",';                                  want = $false },
  @{ n = 'param declaration';        l = '  [string]$AzureUserName  = "",';                           want = $false },
  @{ n = 'env var, not a value';     l = '  $pw = $env:LAB_PASSWORD';                                 want = $false },
  @{ n = 'doc sentence';             l = '# Never place the pass in a script, file or log.';          want = $false },
  @{ n = 'variable, not a literal';  l = '  $ai = @{ apiKey = $AiKey }';                              want = $false },
  @{ n = 'prose with a colon';       l = '  Never pass the learner password or any secret: CloudLabs records the'; want = $false },
  @{ n = 'REAL leak: long alpha';    l = '  password: correcthorsebatterystaple';                     want = $true  }
)

$bad = 0
foreach ($c in $cases) {
  $got = Test-Leak $c.l
  $ok = ($got -eq $c.want)
  if (-not $ok) { $bad++ }
  '{0}  {1,-24} flagged={2,-5} want={3}' -f $(if ($ok) { '  ok  ' } else { '  FAIL' }), $c.n, $got, $c.want
}
''
if ($bad -eq 0) { "  all $($cases.Count) cases correct"; exit 0 }
"  $bad WRONG"; exit 1
