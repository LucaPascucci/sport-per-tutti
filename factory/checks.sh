#!/usr/bin/env bash
# factory/checks.sh — test, lint, type check e build del progetto.
#
# Lo esegue factory/bin/gate dentro il worktree del job (cwd = radice del worktree).
# Il gate usa SEMPRE la copia nel repository principale: il builder non può cambiarla.
#
# Exit code: 0 = tutto ok · 1 = almeno un check fallito · 78 = niente da eseguire
# (stack non riconosciuto): il job va all'umano invece di tornare al builder.
#
# Personalizzazione, in ordine di precedenza:
#   1. factory/checks.local.sh nel repository principale: se esiste, viene eseguito
#      al posto del rilevamento automatico (stesse regole di exit code).
#   2. gate.check_dirs in factory/config.json (es. ["backend", "frontend"]): cartelle
#      in cui eseguire il rilevamento. Vuoto = radice, oppure le sottocartelle di
#      primo livello se la radice non ha marker.
#   3. Variabili d'ambiente: FACTORY_SKIP="lint build" salta quei tipi di check.
#
# Ogni check stampa una riga "FACTORY-CHECK <dir>:<nome> PASS|FAIL <secondi>s"
# che il gate riporta nel suo report.

set -uo pipefail

ROOT="$(pwd)"
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0
RAN=0
SKIP=" ${FACTORY_SKIP:-} "

if [[ -f "$SELF_DIR/checks.local.sh" ]]; then
  echo "== checks.local.sh trovato: eseguo i check personalizzati"
  bash "$SELF_DIR/checks.local.sh"
  exit $?
fi

has() { command -v "$1" >/dev/null 2>&1; }

# step <tipo> <nome> <comando...>
step() {
  local kind="$1" name="$2"; shift 2
  if [[ "$SKIP" == *" $kind "* ]]; then
    echo "== [$CUR] $name: saltato (FACTORY_SKIP)"
    return 0
  fi
  RAN=$((RAN + 1))
  echo
  echo "== [$CUR] $name: $*"
  local start end rc
  start=$(date +%s)
  "$@"
  rc=$?
  end=$(date +%s)
  if [[ $rc -eq 0 ]]; then
    echo "FACTORY-CHECK $CUR:$name PASS $((end - start))s"
  else
    echo "FACTORY-CHECK $CUR:$name FAIL $((end - start))s (exit $rc)"
    FAILED=$((FAILED + 1))
  fi
  return 0
}

has_marker() {
  local d="$1"
  [[ -f "$d/pom.xml" || -f "$d/build.gradle" || -f "$d/build.gradle.kts" || -f "$d/package.json" \
    || -f "$d/pyproject.toml" || -f "$d/setup.py" || -f "$d/requirements.txt" || -f "$d/go.mod" \
    || -f "$d/Cargo.toml" ]] || compgen -G "$d/*.sln" >/dev/null || compgen -G "$d/*.csproj" >/dev/null
}

# ---------------------------------------------------------------- Java
check_maven() {
  local mvn="mvn"
  [[ -x ./mvnw ]] && mvn="./mvnw"
  if [[ "$mvn" == "mvn" ]] && ! has mvn; then echo "Maven non installato"; FAILED=$((FAILED + 1)); return; fi
  # verify = compile + test + plugin di qualità legati al ciclo di vita (checkstyle, spotless, ...)
  step build "maven verify" "$mvn" -B -ntp verify
}

check_gradle() {
  local gradle="gradle"
  [[ -x ./gradlew ]] && gradle="./gradlew"
  if [[ "$gradle" == "gradle" ]] && ! has gradle; then echo "Gradle non installato"; FAILED=$((FAILED + 1)); return; fi
  # build = assemble + check (test e plugin di qualità)
  step build "gradle build" "$gradle" build --no-daemon --console=plain
}

# ---------------------------------------------------------------- Node / TypeScript
node_scripts() { node -e 'const p=require("./package.json");process.stdout.write(Object.keys(p.scripts||{}).join("\n"))' 2>/dev/null; }
node_has_dep() { node -e 'const p=require("./package.json");const d={...p.dependencies,...p.devDependencies};process.exit(d[process.argv[1]]?0:1)' "$1" 2>/dev/null; }

check_node() {
  if ! has node; then echo "Node.js non installato"; FAILED=$((FAILED + 1)); return; fi
  local pm="npm" install=(npm ci --no-audit --no-fund)
  if [[ -f pnpm-lock.yaml ]]; then pm="pnpm"; install=(pnpm install --frozen-lockfile)
  elif [[ -f yarn.lock && -f .yarnrc.yml ]]; then pm="yarn"; install=(yarn install --immutable)
  elif [[ -f yarn.lock ]]; then pm="yarn"; install=(yarn install --frozen-lockfile)
  elif [[ -f bun.lockb || -f bun.lock ]]; then pm="bun"; install=(bun install --frozen-lockfile)
  elif [[ ! -f package-lock.json ]]; then install=(npm install --no-audit --no-fund)
  fi
  if ! has "$pm"; then echo "$pm non installato"; FAILED=$((FAILED + 1)); return; fi
  if [[ ! -d node_modules ]]; then step install "dipendenze ($pm)" "${install[@]}"; fi
  local scripts; scripts="$(node_scripts)"
  run_script() { grep -qx "$1" <<<"$scripts"; }
  if run_script lint; then step lint "lint" "$pm" run lint; fi
  if run_script typecheck; then step typecheck "typecheck" "$pm" run typecheck
  elif run_script type-check; then step typecheck "type-check" "$pm" run type-check
  elif [[ -f tsconfig.json ]] && node_has_dep typescript; then step typecheck "tsc --noEmit" npx --no-install tsc --noEmit
  fi
  if run_script test; then step test "test" "$pm" run test; fi
  if run_script build; then step build "build" "$pm" run build; fi
}

# ---------------------------------------------------------------- Python
check_python() {
  local run=() ran_before=$RAN
  if [[ -f uv.lock ]] && has uv; then run=(uv run)
  elif [[ -f poetry.lock ]] && has poetry; then run=(poetry run)
  fi
  local py="python3"; has python3 || py="python"
  local cfgfiles="pyproject.toml setup.cfg tox.ini"
  if [[ -f ruff.toml || -f .ruff.toml ]] || grep -qs '\[tool.ruff' pyproject.toml; then
    step lint "ruff" ${run[@]+"${run[@]}"} "$py" -m ruff check .
  elif [[ -f .flake8 ]] || grep -qs '\[flake8\]' $cfgfiles; then
    step lint "flake8" ${run[@]+"${run[@]}"} "$py" -m flake8
  fi
  if [[ -f mypy.ini || -f .mypy.ini ]] || grep -qs '\[tool.mypy\]\|\[mypy\]' $cfgfiles; then
    step typecheck "mypy" ${run[@]+"${run[@]}"} "$py" -m mypy .
  elif [[ -f pyrightconfig.json ]] || grep -qs '\[tool.pyright\]' pyproject.toml; then
    step typecheck "pyright" ${run[@]+"${run[@]}"} pyright
  fi
  if [[ -d tests || -d test || -f pytest.ini || -f conftest.py ]] || grep -qs '\[tool.pytest' pyproject.toml; then
    step test "pytest" ${run[@]+"${run[@]}"} "$py" -m pytest -q
  fi
  if [[ $RAN -eq $ran_before ]]; then
    step build "compileall" "$py" -m compileall -q .
  fi
}

# ---------------------------------------------------------------- Go, Rust, .NET
check_go() {
  if ! has go; then echo "Go non installato"; FAILED=$((FAILED + 1)); return; fi
  step lint "gofmt" bash -c 'out=$(gofmt -l . | grep -v "^vendor/"); [[ -z "$out" ]] || { echo "file non formattati:"; echo "$out"; exit 1; }'
  step lint "go vet" go vet ./...
  step test "go test" go test ./...
  step build "go build" go build ./...
}

check_rust() {
  if ! has cargo; then echo "Cargo non installato"; FAILED=$((FAILED + 1)); return; fi
  if cargo fmt --version >/dev/null 2>&1; then step lint "cargo fmt" cargo fmt --all -- --check; fi
  if cargo clippy --version >/dev/null 2>&1; then step lint "clippy" cargo clippy --all-targets -- -D warnings; fi
  step test "cargo test" cargo test
  step build "cargo build" cargo build
}

check_dotnet() {
  if ! has dotnet; then echo ".NET SDK non installato"; FAILED=$((FAILED + 1)); return; fi
  step build "dotnet build" dotnet build --nologo
  step test "dotnet test" dotnet test --nologo --no-build
}

run_dir() {
  local dir="$1"
  CUR="${dir#./}"; [[ "$CUR" == "." || -z "$CUR" ]] && CUR="root"
  pushd "$dir" >/dev/null || { echo "cartella $dir non trovata"; FAILED=$((FAILED + 1)); return; }
  local found=0
  if [[ -f pom.xml ]]; then check_maven; found=1
  elif [[ -f build.gradle || -f build.gradle.kts ]]; then check_gradle; found=1
  fi
  if [[ -f package.json ]]; then check_node; found=1; fi
  if [[ -f pyproject.toml || -f setup.py || -f requirements.txt ]]; then check_python; found=1; fi
  if [[ -f go.mod ]]; then check_go; found=1; fi
  if [[ -f Cargo.toml ]]; then check_rust; found=1; fi
  if compgen -G "*.sln" >/dev/null || compgen -G "*.csproj" >/dev/null; then check_dotnet; found=1; fi
  [[ $found -eq 0 ]] && echo "== [$CUR] nessuno stack riconosciuto"
  popd >/dev/null || true
}

# ---------------------------------------------------------------- cartelle da controllare
DIRS=()
if [[ -n "${FACTORY_CHECK_DIRS:-}" ]]; then
  read -r -a DIRS <<<"$FACTORY_CHECK_DIRS"
elif has_marker .; then
  DIRS=(.)
else
  for d in */; do
    d="${d%/}"
    [[ "$d" == "node_modules" || "$d" == "factory" || "$d" == .* ]] && continue
    has_marker "$d" && DIRS+=("$d")
  done
fi

if [[ ${#DIRS[@]} -eq 0 ]]; then
  echo "Nessuno stack riconosciuto in $ROOT."
  echo "Crea factory/checks.local.sh oppure imposta gate.check_dirs in factory/config.json."
  exit 78
fi

for d in "${DIRS[@]}"; do run_dir "$d"; done

echo
if [[ $RAN -eq 0 && $FAILED -eq 0 ]]; then
  echo "Stack riconosciuto ma nessun check eseguibile. Personalizza factory/checks.local.sh."
  exit 78
fi
echo "== Risultato: $RAN check eseguiti, $FAILED falliti"
[[ $FAILED -eq 0 ]] && exit 0 || exit 1
