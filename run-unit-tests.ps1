$ErrorActionPreference = 'Stop'
# Live rendering scripts use test-*.js; only *.test.js are isolated unit tests.
$unitTests = Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.test.js' -File |
    Select-Object -ExpandProperty FullName
& node --test @unitTests
exit $LASTEXITCODE
