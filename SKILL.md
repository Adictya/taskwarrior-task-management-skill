---
name: task-agent
description: >
  Use the local `task-agent` CLI for structured Taskwarrior task management.
  This skill is agent-first: every successful command returns one JSON object on stdout,
  and every failure returns one JSON object on stderr with a non-zero exit code.
---

Use `task-agent`. Do not use raw `task` for normal task management.

## Rules

- Prefer `task-agent schema` first if you need to discover current capabilities or configured UDAs.
- Prefer `task-agent list` and `task-agent get` before mutating tasks.
- Use UUIDs for every mutation command.
- Use `task-agent update` for scalar fields, tags, dependencies, annotations, and UDAs.
- Use lifecycle commands for lifecycle changes:
  - `task-agent complete`
  - `task-agent reopen`
  - `task-agent start`
  - `task-agent stop`
  - `task-agent delete`
- Do not assume raw Taskwarrior filter syntax is supported. This CLI only exposes structured filters.
- Do not assume human-oriented output exists. Parse the returned JSON.

## Read

```sh
task-agent schema
task-agent doctor
task-agent list
task-agent list --project Work --tag urgent --ready
task-agent get --uuid 11111111-1111-1111-1111-111111111111
task-agent projects
task-agent tags --project Work
task-agent stats --tag urgent
```

## Create

```sh
task-agent create --description "Draft release notes"
task-agent create --description "Pay rent" --due tomorrow --recur monthly
task-agent create --description "Fix bug" --project Work --priority H --tag bug --tag backend
```

## Update

```sh
task-agent update --uuid 11111111-1111-1111-1111-111111111111 --priority H --due tomorrow
task-agent update --uuid 11111111-1111-1111-1111-111111111111 --clear-due --clear-priority
task-agent update --uuid 11111111-1111-1111-1111-111111111111 --add-tag urgent --remove-tag inbox
task-agent update --uuid 11111111-1111-1111-1111-111111111111 --add-dependency 22222222-2222-2222-2222-222222222222
task-agent update --uuid 11111111-1111-1111-1111-111111111111 --add-annotation "Waiting on API review"
task-agent update --uuid 11111111-1111-1111-1111-111111111111 --uda estimate=3
```

## Lifecycle

```sh
task-agent complete --uuid 11111111-1111-1111-1111-111111111111
task-agent reopen --uuid 11111111-1111-1111-1111-111111111111
task-agent start --uuid 11111111-1111-1111-1111-111111111111
task-agent stop --uuid 11111111-1111-1111-1111-111111111111
task-agent delete --uuid 11111111-1111-1111-1111-111111111111
```

## Output Contract

Success shape:

```json
{"ok":true}
```

Failure shape:

```json
{"ok":false,"error":{"code":"...","message":"..."}}
```

## Notes

- `list`, `projects`, `tags`, and `stats` default to open tasks unless `--status` is supplied.
- `doctor` always returns a JSON report, even when Taskwarrior is missing.
- Configured UDAs are surfaced by `schema` and `doctor`.
- Build the bundled CLI with `bun run build`.
