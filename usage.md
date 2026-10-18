# usage.md — using `scripts/load-example.sh`

Instructions for AI agents and scripts. Read this before invoking the loader.

## What it does

`scripts/load-example.sh` POSTs a podcast configuration to a running
`podcast-testcasts` server (`POST /config`), verifies the HTTP status, and
prints the resulting feed URLs. It is the fastest way to get the server into a
known, testable state.

It **does not start the server** and **does not install anything**. The server
must already be running and reachable.

## Prerequisites

1. `bash` and `curl` on `PATH` (`jq` is optional, only improves the feed list).
2. A running server. Confirm before loading:

```bash
curl -fsS http://localhost:5004/health
# expected: {"status":"ok","podcasts":0,"episodes":0}
```

If it is not running, start it (from the repository root):

```bash
docker build -t podcast-testcasts .
docker run -d --name podcast-testcasts -p 5004:5004 podcast-testcasts
# or: docker compose up -d --build
```

Then wait until `/health` responds (the container needs a second or two).

## Invocation

```bash
scripts/load-example.sh [base-url] [config-file]
```

| Position | Name          | Required | Default                            |
| -------- | ------------- | -------- | ---------------------------------- |
| 1        | `base-url`    | no       | `http://localhost:5004`            |
| 2        | `config-file` | no       | `examples/config.json`             |

Rules:

- Both arguments are positional. Order matters.
- If the first argument is a file path or ends in `.json`, it is treated as the
  `config-file` and the `base-url` falls back to the default. You can therefore
  pass a config alone.
- `-h` / `--help` prints usage and exits `0`.
- A trailing `/` on the base URL is tolerated.

### Canonical forms

```bash
scripts/load-example.sh                                     # defaults
scripts/load-example.sh http://localhost:5004               # explicit base URL
scripts/load-example.sh http://localhost:5004 custom.json   # both
scripts/load-example.sh custom.json                         # config only
```

Run it from the repository root, or use an absolute path to the script.

## Expected output (exit code 0)

```
POST http://localhost:5004/config  <-  examples/config.json
ok: {"ok":true,"podcasts":2,"episodes":3}

Feeds:
  http://localhost:5004/the-test-show.rss
  http://localhost:5004/silence-weekly.rss

Point your podcast client at one of the feed URLs above.
```

The `ok:` line is the server's JSON response. The `Feeds:` lines are derived
from the posted config (not from the server) and are the URLs to hand to a
podcast client.

## Exit codes

| Code | Meaning                                                            |
| ---- | ------------------------------------------------------------------ |
| `0`  | Config accepted; feed URLs printed.                                |
| `1`  | `curl` missing, config file missing, server unreachable, or non-200. |

All error output goes to **stderr**. A non-zero exit means the server was
**not** reconfigured; do not assume the config was applied.

## Troubleshooting

| Symptom (stderr)                                          | Cause / fix                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| `curl: (7) Failed to connect ... Is the server running?`   | Server not up or wrong `base-url`/port. Start it, re-check `/health`. |
| `curl: (6) Could not resolve host`                         | Bad hostname in `base-url`.                                       |
| `error: config file not found: <path>`                     | Path is wrong or relative to the wrong directory.                 |
| `error: request failed with HTTP 400` + JSON `details`     | Config is invalid; the `details` array lists each problem. Fix the JSON and retry. |
| `error: curl is required but was not found`                | Install `curl`.                                                   |
| `Feeds:` section empty                                     | `jq` absent and the config's keys are not plain `"slug": "..."`. Not an error; the POST still succeeded. |

## Verify the load worked

```bash
# Config is live:
curl -fsS http://localhost:5004/health
# expected: {"status":"ok","podcasts":2,"episodes":3}

# Feed renders and enclosures point at the server:
curl -fsS http://localhost:5004/the-test-show.rss | grep -m1 enclosure
# expected: <enclosure url="http://localhost:5004/the-test-show-ep1.mp3" ... type="audio/mpeg" />
```

## Manual fallback (if the script cannot be used)

The script is a thin wrapper around one request:

```bash
curl -sS -X POST http://localhost:5004/config \
  -H 'content-type: application/json' \
  --data-binary @examples/config.json
```

## Constraints worth remembering

- `POST /config` **replaces** the entire configuration; it does not merge.
- Config is **in-memory only**: restarting the container clears it and the
  loader must be run again.
- Episode `mp3Slug` values must be unique **across all podcasts**, or the post
  returns `400`.
- The loader does not wait for readiness; poll `/health` first if the server
  was just started.
