"""Funzioni condivise della software factory.

Regola: solo factory/bin/job scrive job.json e index.json. route e gate
importano questo modulo solo per leggere (config, job, routing, prezzi).
Solo libreria standard, Python 3.10+.
"""
from __future__ import annotations

import contextlib
import copy
import datetime as _dt
import glob
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

BIN_DIR = Path(__file__).resolve().parent
FACTORY_DIR = BIN_DIR.parent
REPO_DIR = FACTORY_DIR.parent
JOBS_DIR = FACTORY_DIR / "jobs"
INBOX_DIR = FACTORY_DIR / "inbox"
CONFIG_PATH = FACTORY_DIR / "config.json"

# Alias accettati dal parametro `model` del tool Agent di Claude Code.
MODEL_ALIASES = ("haiku", "sonnet", "opus", "fable")
MODEL_RANK = {m: i for i, m in enumerate(MODEL_ALIASES)}

REVIEW_ROLES = ("code-review", "ux-review", "ui-review", "security-review")

DEFAULT_AGENTS = {
    "intake": {"agent": "factory-intake", "model": "fable"},
    "spec-writer": {"agent": "factory-spec-writer", "model": "opus"},
    "builder": {"agent": "factory-builder", "model": "opus"},
    "code-review": {"agent": "factory-code-reviewer", "model": None},
    "ux-review": {"agent": "factory-ux-reviewer", "model": None},
    "ui-review": {"agent": "factory-ui-reviewer", "model": None},
    "security-review": {"agent": "factory-security-reviewer", "model": None},
    "approver": {"agent": "factory-approver", "model": "opus"},
}

# Tabella di routing del documento di progetto (usata se config.json non la ridefinisce).
DEFAULT_ROUTING = {
    "risk": {
        "low": {"code-review": "haiku"},
        "medium": {"code-review": "sonnet"},
        "high": {"code-review": "sonnet"},
    },
    "surfaces": {
        "ui": {"ux-review": "sonnet", "ui-review": "haiku"},
        "security": {"security-review": "opus"},
    },
}

DEFAULT_CONFIG = {
    "concurrency": 3,
    "max_rounds": 3,
    "base_branch": "auto",
    "branch_prefix": "factory/",
    "worktrees_dir": "../{repo}.factory-worktrees",
    "protected_paths": ["factory/", ".claude/"],
    "agents": DEFAULT_AGENTS,
    "routing": DEFAULT_ROUTING,
    "approval": {"always_escalate_risk": []},
    "gate": {"timeout_minutes": 30, "final_rebase": True, "check_dirs": [], "log_tail_lines": 80},
    "labels": {
        "in-progress": "factory:in-progress",
        "needs-info": "factory:needs-info",
        "needs-human": "factory:needs-human",
        "done": "factory:done",
        "rejected": "factory:rejected",
        "closed": "factory:closed",
    },
    "notify_command": None,
    "transcripts_dir": "auto",
    "pricing": {"currency": "USD", "models": {}, "fallback": {}},
}

# Chiavi che, se presenti in config.json, sostituiscono del tutto il default.
_REPLACE_KEYS = {"routing", "protected_paths", "pricing", "labels"}


class FactoryError(Exception):
    """Errore atteso: messaggio leggibile, nessun traceback."""


# --------------------------------------------------------------------------- tempo

def now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0)


def now_iso() -> str:
    return now().isoformat().replace("+00:00", "Z")


def parse_iso(value: str | None) -> _dt.datetime | None:
    if not value:
        return None
    try:
        return _dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def seconds_between(a: str | None, b: str | None) -> float | None:
    da, db = parse_iso(a), parse_iso(b)
    if not da or not db:
        return None
    return max(0.0, (db - da).total_seconds())


# --------------------------------------------------------------------------- config

def _merge(base: dict, override: dict, top: bool = True) -> dict:
    out = copy.deepcopy(base)
    for key, value in override.items():
        if key.startswith("_"):
            continue
        if top and key in _REPLACE_KEYS:
            out[key] = copy.deepcopy(value)
        elif isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _merge(out[key], value, top=False)
        else:
            out[key] = copy.deepcopy(value)
    return out


def load_config() -> dict:
    data: dict = {}
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise FactoryError(f"config.json non valido: {exc}") from exc
    return _merge(DEFAULT_CONFIG, data)


def validate_config(cfg: dict) -> list[str]:
    """Restituisce la lista dei problemi trovati (vuota se la config è valida)."""
    problems: list[str] = []
    if not isinstance(cfg.get("concurrency"), int) or cfg["concurrency"] < 1:
        problems.append("concurrency deve essere un intero >= 1")
    if not isinstance(cfg.get("max_rounds"), int) or cfg["max_rounds"] < 1:
        problems.append("max_rounds deve essere un intero >= 1")
    for role, spec in cfg.get("agents", {}).items():
        model = (spec or {}).get("model")
        if model is not None and model not in MODEL_ALIASES:
            problems.append(f"agents.{role}.model = {model!r}: usa uno tra {', '.join(MODEL_ALIASES)} oppure null")
        if not (spec or {}).get("agent"):
            problems.append(f"agents.{role}.agent mancante")
    routing = cfg.get("routing", {})
    if not routing.get("risk"):
        problems.append("routing.risk è vuoto")
    for section in ("risk", "surfaces"):
        for key, roles in (routing.get(section) or {}).items():
            for role, model in (roles or {}).items():
                if role not in cfg.get("agents", {}):
                    problems.append(f"routing.{section}.{key}: ruolo sconosciuto {role!r}")
                if model not in MODEL_ALIASES:
                    problems.append(f"routing.{section}.{key}.{role} = {model!r}: modello non valido")
    return problems


def agent_model(cfg: dict, role: str) -> str:
    """Modello per un ruolo non reviewer: config esplicita, altrimenti default."""
    spec = cfg["agents"].get(role) or {}
    model = spec.get("model") or (DEFAULT_AGENTS.get(role) or {}).get("model") or "opus"
    return model


def agent_name(cfg: dict, role: str) -> str:
    spec = cfg["agents"].get(role) or {}
    return spec.get("agent") or DEFAULT_AGENTS[role]["agent"]


def compute_routing(cfg: dict, risk: str, surfaces: list[str]) -> list[dict]:
    """Sceglie reviewer e modelli. Il modello esplicito in agents.<ruolo>.model vince sulla tabella."""
    routing = cfg["routing"]
    if risk not in routing.get("risk", {}):
        raise FactoryError(f"rischio sconosciuto {risk!r}: valori ammessi {', '.join(routing['risk'])}")
    picked: dict[str, dict] = {}

    def add(role: str, model: str, why: str) -> None:
        cur = picked.get(role)
        if cur is None:
            picked[role] = {"model": model, "why": [why]}
            return
        cur["why"].append(why)
        if MODEL_RANK.get(model, 0) > MODEL_RANK.get(cur["model"], 0):
            cur["model"] = model

    for role, model in routing["risk"][risk].items():
        add(role, model, f"rischio {risk}")
    for surface in surfaces:
        for role, model in (routing.get("surfaces", {}).get(surface) or {}).items():
            add(role, model, f"superficie {surface}")

    order = {r: i for i, r in enumerate(REVIEW_ROLES)}
    result = []
    for role in sorted(picked, key=lambda r: (order.get(r, 99), r)):
        override = (cfg["agents"].get(role) or {}).get("model")
        result.append({
            "role": role,
            "agent": agent_name(cfg, role),
            "model": override or picked[role]["model"],
            "model_source": "config" if override else "tabella",
            "why": picked[role]["why"],
        })
    return result


def known_surfaces(cfg: dict) -> list[str]:
    return sorted((cfg["routing"].get("surfaces") or {}).keys())


def known_risks(cfg: dict) -> list[str]:
    return list((cfg["routing"].get("risk") or {}).keys())


# --------------------------------------------------------------------------- lock e file

@contextlib.contextmanager
def locked():
    """Lock esclusivo su factory/jobs/.lock (fcntl su Unix, msvcrt su Windows)."""
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    path = JOBS_DIR / ".lock"
    with open(path, "a+b") as fh:
        if os.name == "nt":  # pragma: no cover
            import msvcrt
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(fh, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(fh, fcntl.LOCK_UN)


def write_json_atomic(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(tmp)
        raise


def job_dir(job_id: str) -> Path:
    return JOBS_DIR / job_id


def all_job_ids() -> list[str]:
    if not JOBS_DIR.exists():
        return []
    ids = [p.name for p in JOBS_DIR.iterdir() if p.is_dir() and (p / "job.json").exists()]
    return sorted(ids)


def resolve_job_id(ref: str) -> str:
    """Accetta l'id completo, il numero (7, 0007) o un prefisso univoco."""
    ref = ref.strip()
    ids = all_job_ids()
    if ref in ids:
        return ref
    if ref.isdigit():
        prefix = f"{int(ref):04d}-"
        hits = [i for i in ids if i.startswith(prefix)]
    else:
        hits = [i for i in ids if i.startswith(ref)]
    if len(hits) == 1:
        return hits[0]
    if not hits:
        raise FactoryError(f"job non trovato: {ref}")
    raise FactoryError(f"riferimento ambiguo {ref!r}: {', '.join(hits)}")


def load_job(job_id: str) -> dict:
    path = job_dir(job_id) / "job.json"
    if not path.exists():
        raise FactoryError(f"job non trovato: {job_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_all_jobs() -> list[dict]:
    jobs = []
    for jid in all_job_ids():
        try:
            jobs.append(load_job(jid))
        except (json.JSONDecodeError, OSError):
            continue
    return sorted(jobs, key=lambda j: j.get("seq", 0))


# --------------------------------------------------------------------------- front matter

def _parse_scalar(raw: str):
    raw = raw.strip()
    if raw and raw[0] not in "\"'" and " #" in raw:
        raw = raw.split(" #", 1)[0].strip()
    if raw.startswith("[") and raw.endswith("]"):
        inner = raw[1:-1].strip()
        return [] if not inner else [_parse_scalar(x) for x in inner.split(",")]
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
        return raw[1:-1]
    return raw


def parse_front_matter(text: str) -> tuple[dict, str]:
    """Front matter YAML minimale: `chiave: valore`, liste `[a, b]` o `- voce`."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text
    data: dict = {}
    current_list: str | None = None
    end = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end = i
            break
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s*-\s+(.*)$", line)
        if item and current_list:
            data[current_list].append(_parse_scalar(item.group(1)))
            continue
        kv = re.match(r"^([A-Za-z0-9_\-]+)\s*:\s*(.*)$", line)
        if kv:
            key, value = kv.group(1).strip().lower(), kv.group(2)
            if value.strip() == "":
                data[key] = []
                current_list = key
            else:
                data[key] = _parse_scalar(value)
                current_list = None
    if end is None:
        return {}, text
    return data, "\n".join(lines[end + 1:])


def as_list(value) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [str(v).strip().lower() for v in value if str(v).strip()]
    return [v.strip().lower() for v in str(value).split(",") if v.strip()]


# --------------------------------------------------------------------------- git

def git(*args: str, cwd: Path | str = REPO_DIR, check: bool = True) -> str:
    proc = subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise FactoryError(f"git {' '.join(args)}: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout.strip()


def git_ok(*args: str, cwd: Path | str = REPO_DIR) -> bool:
    return subprocess.run(["git", *args], cwd=str(cwd), capture_output=True).returncode == 0


def branch_exists(name: str) -> bool:
    return git_ok("show-ref", "--verify", "--quiet", f"refs/heads/{name}")


def detect_base_branch(cfg: dict) -> str:
    wanted = cfg.get("base_branch") or "auto"
    if wanted != "auto":
        if not branch_exists(wanted):
            raise FactoryError(f"base_branch {wanted!r} non esiste come branch locale")
        return wanted
    ref = git("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD", check=False)
    if ref.startswith("refs/remotes/origin/"):
        name = ref.rsplit("/", 1)[-1]
        if branch_exists(name):
            return name
    for name in ("main", "master", "develop"):
        if branch_exists(name):
            return name
    current = git("rev-parse", "--abbrev-ref", "HEAD", check=False)
    if current and current != "HEAD":
        return current
    raise FactoryError("impossibile determinare il branch base: imposta base_branch in factory/config.json")


def worktrees_root(cfg: dict) -> Path:
    raw = str(cfg.get("worktrees_dir") or "../{repo}.factory-worktrees").replace("{repo}", REPO_DIR.name)
    path = Path(os.path.expanduser(raw))
    if not path.is_absolute():
        path = REPO_DIR / path
    return path.resolve()


# --------------------------------------------------------------------------- costi

def claude_dir(cfg: dict) -> Path:
    custom = cfg.get("transcripts_dir")
    if custom and custom != "auto":
        return Path(os.path.expanduser(custom))
    env = os.environ.get("CLAUDE_CONFIG_DIR")
    return Path(env) if env else Path.home() / ".claude"


def project_slug(path: Path) -> str:
    return re.sub(r"[^A-Za-z0-9]", "-", str(path))


def find_transcript(cfg: dict, agent_id: str | None, marker: str | None, since: str | None) -> Path | None:
    """Trova la trascrizione di un subagent per agentId oppure per un testo univoco del prompt."""
    projects = claude_dir(cfg) / "projects"
    if not projects.exists():
        return None
    if agent_id:
        safe = re.sub(r"[^A-Za-z0-9_\-]", "", agent_id)
        for pattern in (f"*/*/subagents/agent-{safe}.jsonl", f"*/agent-{safe}.jsonl", f"*/*/agent-{safe}.jsonl"):
            hits = glob.glob(str(projects / pattern))
            if hits:
                return Path(hits[0])
    if not marker:
        return None
    needles = {marker, json.dumps(marker)[1:-1]}
    slug_dir = projects / project_slug(REPO_DIR)
    roots = [slug_dir] if slug_dir.exists() else [p for p in projects.iterdir() if p.is_dir()]
    since_dt = parse_iso(since)
    min_mtime = since_dt.timestamp() - 120 if since_dt else 0
    candidates: list[str] = []
    for root in roots:
        candidates += glob.glob(str(root / "*" / "subagents" / "agent-*.jsonl"))
        candidates += glob.glob(str(root / "agent-*.jsonl"))
    for cand in sorted(candidates, key=lambda p: os.path.getmtime(p), reverse=True):
        if os.path.getmtime(cand) < min_mtime:
            continue
        try:
            with open(cand, "r", encoding="utf-8", errors="replace") as fh:
                head = fh.read(200_000)
        except OSError:
            continue
        if any(n in head for n in needles):
            return Path(cand)
    return None


def price_for(cfg: dict, model_id: str) -> dict | None:
    models = cfg.get("pricing", {}).get("models", {})
    best = None
    for key in models:
        if model_id.startswith(key) and (best is None or len(key) > len(best)):
            best = key
    if best is None:
        for family, key in (cfg.get("pricing", {}).get("fallback") or {}).items():
            if family in model_id and key in models:
                best = key
                break
    return models.get(best) if best else None


def usage_cost(price: dict, usage: dict) -> float:
    inp = usage.get("input_tokens") or 0
    out = usage.get("output_tokens") or 0
    read = usage.get("cache_read_input_tokens") or 0
    write = usage.get("cache_creation_input_tokens") or 0
    detail = usage.get("cache_creation") or {}
    w5 = detail.get("ephemeral_5m_input_tokens")
    w1h = detail.get("ephemeral_1h_input_tokens")
    if w5 is None and w1h is None:
        w5, w1h = write, 0
    p = dict(price)
    long_ctx = price.get("long_context")
    if long_ctx and (inp + read + write) > long_ctx.get("threshold", 10**12):
        p.update({k: v for k, v in long_ctx.items() if k != "threshold"})
    total = (
        inp * p.get("input", 0)
        + out * p.get("output", 0)
        + (w5 or 0) * p.get("cache_write_5m", p.get("input", 0) * 1.25)
        + (w1h or 0) * p.get("cache_write_1h", p.get("input", 0) * 2)
        + read * p.get("cache_read", p.get("input", 0) * 0.1)
    )
    return total / 1_000_000


def transcript_cost(cfg: dict, path: Path) -> dict:
    """Somma token e costo equivalente API di una trascrizione JSONL di Claude Code."""
    messages: dict[str, tuple[str, dict]] = {}
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for n, line in enumerate(fh):
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            msg = obj.get("message") if isinstance(obj, dict) else None
            if not isinstance(msg, dict) or not isinstance(msg.get("usage"), dict):
                continue
            if obj.get("type") not in (None, "assistant") and msg.get("role") != "assistant":
                continue
            key = msg.get("id") or obj.get("requestId") or obj.get("uuid") or f"line-{n}"
            messages[key] = (str(msg.get("model") or ""), msg["usage"])
    tokens = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
    cost = 0.0
    models: set[str] = set()
    unpriced: set[str] = set()
    for model, usage in messages.values():
        if not model or model.startswith("<"):
            continue
        models.add(model)
        tokens["input"] += usage.get("input_tokens") or 0
        tokens["output"] += usage.get("output_tokens") or 0
        tokens["cache_read"] += usage.get("cache_read_input_tokens") or 0
        tokens["cache_write"] += usage.get("cache_creation_input_tokens") or 0
        price = price_for(cfg, model)
        if price is None:
            unpriced.add(model)
            continue
        cost += usage_cost(price, usage)
    return {"cost_usd": round(cost, 4), "tokens": tokens, "models": sorted(models),
            "unpriced_models": sorted(unpriced), "transcript": str(path)}


# --------------------------------------------------------------------------- testo

def slugify(text: str, limit: int = 40) -> str:
    import unicodedata
    norm = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", norm).strip("-")
    slug = slug[:limit].rstrip("-")
    return slug or "richiesta"


def extract_title(text: str) -> str:
    fm, body = parse_front_matter(text)
    if fm.get("title"):
        return str(fm["title"]).strip()[:100]
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()[:100]
    for line in body.splitlines():
        if line.strip():
            return line.strip().lstrip("#").strip()[:100]
    return "Richiesta senza titolo"


def fmt_duration(seconds: float | None) -> str:
    if seconds is None:
        return "-"
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h{m:02d}m"
    if m:
        return f"{m}m{s:02d}s"
    return f"{s}s"
