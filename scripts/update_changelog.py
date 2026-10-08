#!/usr/bin/env python3
"""Maintain an append-only, deduplicated Git commit history inside CHANGELOG.md.

The human-written version notes outside the markers are never modified.
On push: include every commit from the push range plus recent commits missed before setup.
On workflow_dispatch: backfill commits from the last LOOKBACK_DAYS days (default 30).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
CHANGELOG = ROOT / "CHANGELOG.md"
START = "<!-- AUTO-CHANGELOG:START -->"
END = "<!-- AUTO-CHANGELOG:END -->"
MYT = ZoneInfo("Asia/Kuala_Lumpur")
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
MARKER_PATTERN = re.compile(r"<!-- commit:([0-9a-f]{40}) -->")
DAY_PATTERN = re.compile(r"^### (\d{4}-\d{2}-\d{2}) \(MYT\)$")
TIME_PATTERN = re.compile(r"^- \*\*(\d{2}:\d{2})\*\*")
TYPES = {
    "feat": "Added",
    "fix": "Fixed",
    "docs": "Docs",
    "refactor": "Refactor",
    "perf": "Performance",
    "style": "Style",
    "test": "Tests",
    "build": "Build",
    "ci": "CI",
    "chore": "Maintenance",
}


def git(*args: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(ROOT), *args], text=True
    ).strip()


def target_commits() -> list[str]:
    name = os.environ.get("GITHUB_EVENT_NAME", "")
    event_file = os.environ.get("GITHUB_EVENT_PATH", "")
    days = max(1, min(int(os.environ.get("LOOKBACK_DAYS", "30")), 365))
    recent = git("log", f"--since={days}.days", "--format=%H", "--no-merges", "HEAD").splitlines()
    if name == "push" and event_file and Path(event_file).is_file():
        event = json.loads(Path(event_file).read_text(encoding="utf-8"))
        before, after = event.get("before", ""), event.get("after", "")
        if after == "0" * 40:
            return []  # Branch deletion.
        if SHA_PATTERN.fullmatch(before) and before != "0" * 40 and SHA_PATTERN.fullmatch(after):
            try:
                pushed = git("rev-list", "--reverse", "--no-merges", f"{before}..{after}").splitlines()
                return list(dict.fromkeys([*pushed, *recent]))
            except subprocess.CalledProcessError:
                print("Push's previous ref is unavailable: falling back to 30-day history.")

    return recent


def kind(subject: str) -> str:
    match = re.match(r"^(feat|fix|docs|refactor|perf|style|test|build|ci|chore)(?:\([^)]*\))?!?:", subject, re.I)
    return TYPES.get(match.group(1).lower(), "Updated") if match else "Updated"


def row_for_commit(sha: str) -> tuple[str, str, str] | None:
    raw = git("show", "-s", "--format=%s%x00%cI", sha).split("\x00", 1)
    if len(raw) != 2:
        return None
    subject, timestamp = raw[0].strip(), raw[1].strip()
    if not subject or re.match(r"^(docs|chore)(?:\([^)]*\))?:\s*(auto[- ]?changelog|update changelog)", subject, re.I):
        return None
    if "[skip changelog]" in subject.lower():
        return None
    moment = datetime.fromisoformat(timestamp).astimezone(MYT)
    label = kind(subject)
    escaped = subject.replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]").replace("`", "\\`")
    repo = os.environ.get("GITHUB_REPOSITORY", "Lanzkila/Komikku-Viewers")
    url = f"https://github.com/{repo}/commit/{sha}"
    line = f"- **{moment:%H:%M}** · **{label}** — {escaped} ([`{sha[:7]}`]({url})) <!-- commit:{sha} -->"
    return moment.strftime("%Y-%m-%d"), moment.strftime("%H:%M"), line


def ensure_markers(original: str) -> str:
    if START in original and END in original:
        return original
    block = f"## Recent commits (automatic)\n\n{START}\n{END}\n\n"
    if original.startswith("# Changelog\n"):
        return original.replace("# Changelog\n", "# Changelog\n\n" + block, 1)
    return "# Changelog\n\n" + block + original


def existing_rows(section: str) -> dict[str, tuple[str, str, str]]:
    rows: dict[str, tuple[str, str, str]] = {}
    day = ""
    for line in section.splitlines():
        match_day = DAY_PATTERN.fullmatch(line)
        if match_day:
            day = match_day.group(1)
            continue
        marker, time = MARKER_PATTERN.search(line), TIME_PATTERN.match(line)
        if marker and time and day:
            rows[marker.group(1)] = (day, time.group(1), line)
    return rows


def main() -> None:
    original = CHANGELOG.read_text(encoding="utf-8")
    document = ensure_markers(original)
    before, tail = document.split(START, 1)
    current, after = tail.split(END, 1)
    rows = existing_rows(current)

    added = 0
    for sha in target_commits():
        if not SHA_PATTERN.fullmatch(sha) or sha in rows:
            continue
        row = row_for_commit(sha)
        if row:
            rows[sha] = row
            added += 1

    by_day: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for sha, (day, time, line) in rows.items():
        by_day[day].append((time + sha, line))

    block: list[str] = []
    for day in sorted(by_day, reverse=True):
        block.append(f"### {day} (MYT)")
        block.extend(line for _, line in sorted(by_day[day], reverse=True))
        block.append("")

    content = before + START + "\n" + "\n".join(block).rstrip() + "\n" + END + after
    if content != original:
        CHANGELOG.write_text(content, encoding="utf-8")
        print(f"Updated changelog: {added} new commits, {len(rows)} total tracked.")
    else:
        print(f"Changelog already current: {len(rows)} commits tracked.")


if __name__ == "__main__":
    main()
