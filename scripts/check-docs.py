#!/usr/bin/env python3
"""Check this repository's documentation against local files and configuration.

Examples:
  python3 scripts/check-docs.py .
  python3 scripts/check-docs.py /path/to/cms-version-history-app
  python3 scripts/check-docs.py --self-test

Reads a repository directory (not stdin), uses no network or third-party packages,
and writes a JSON summary to stdout. Exit 1 means validation failed; exit 2 means
invalid input. Supports inline Markdown links and ATX headings used by these docs,
not every Markdown extension. External URLs are counted but not fetched.
"""

import argparse
import json
import re
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit


def prose(text):
    return re.sub(r"^```[^\n]*\n.*?^```\s*$", "", text, flags=re.M | re.S)


def anchors(text):
    found = set()
    for heading in re.findall(r"^#{1,6}\s+(.+?)\s*#*\s*$", prose(text), flags=re.M):
        heading = re.sub(r"<[^>]*>", "", heading).lower()
        slug = re.sub(r"[^\w\- ]", "", heading).replace(" ", "-")
        candidate = slug
        suffix = 0
        while candidate in found:
            suffix += 1
            candidate = f"{slug}-{suffix}"
        found.add(candidate)
    return found


def check_markdown(path):
    text = path.read_text(encoding="utf-8")
    errors = []
    links = 0
    external = 0
    json_blocks = 0
    for match in re.finditer(r"\[[^\]]*\]\(([^\s)]+)(?:\s+\"[^\"]*\")?\)", prose(text)):
        href = match.group(1)
        url = urlsplit(href)
        if url.scheme or url.netloc:
            external += 1
            continue
        links += 1
        target = (path.parent / unquote(url.path)).resolve() if url.path else path.resolve()
        if not target.exists():
            errors.append(f"Missing link target: {href}")
        elif url.fragment and target.suffix == ".md":
            if unquote(url.fragment) not in anchors(target.read_text(encoding="utf-8")):
                errors.append(f"Missing heading anchor: {href}")
    for block in re.findall(r"^```json\s*\n(.*?)^```", text, flags=re.M | re.S):
        json_blocks += 1
        try:
            json.loads(block)
        except json.JSONDecodeError as exc:
            errors.append(f"Invalid JSON example: {exc.msg}")
    return errors, links, external, json_blocks


def check_repository(root):
    errors = []
    paths = sorted([root / "README.md", root / "AGENTS.md", root / "scripts/INDEX.md", *root.glob("docs/**/*.md")])
    counts = {"markdown_files": len(paths), "local_links": 0, "external_links_unchecked": 0, "json_examples": 0}
    texts = []
    for path in paths:
        problems, links, external, blocks = check_markdown(path)
        errors.extend(f"{path.relative_to(root)}: {problem}" for problem in problems)
        counts["local_links"] += links
        counts["external_links_unchecked"] += external
        counts["json_examples"] += blocks
        texts.append(path.read_text(encoding="utf-8"))

    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    for command in sorted(set(re.findall(r"\bnpm run ([\w:-]+)", "\n".join(texts)))):
        if command not in package["scripts"]:
            errors.append(f"Unknown documented npm script: {command}")

    config_source = (root / "src/lib/env.ts").read_text(encoding="utf-8")
    config_source += (root / "src/app/api/jobs/run/route.ts").read_text(encoding="utf-8")
    variables = set(re.findall(r'read\("([A-Z_]+)"\)', config_source))
    variables.update(re.findall(r"(?:\be\.|process\.env\.)([A-Z][A-Z_]+)", config_source))
    config_doc = (root / "docs/configuration.md").read_text(encoding="utf-8").split("### Three different URL concepts")[0]
    documented = set(re.findall(r"\| `([A-Z][A-Z_]+)` \|", config_doc))
    example = (root / ".dev.vars.example").read_text(encoding="utf-8")
    example_keys = set(re.findall(r"^(?:#\s*)?([A-Z][A-Z_]+)=", example, flags=re.M))
    if variables != documented:
        errors.append(f"Configuration table mismatch: missing={sorted(variables - documented)}, extra={sorted(documented - variables)}")
    if variables != example_keys:
        errors.append(f"Environment example mismatch: missing={sorted(variables - example_keys)}, extra={sorted(example_keys - variables)}")
    counts["runtime_variables"] = len(variables)

    api_doc = (root / "docs/api.md").read_text(encoding="utf-8")
    documented_routes = set(re.findall(r"\| `(GET|POST|PUT|PATCH|DELETE) (/api/[\w/-]+)` \|", api_doc))
    routes = set()
    for path in sorted((root / "src/app/api").rglob("route.ts")):
        route = "/" + path.parent.relative_to(root / "src/app").as_posix()
        for method in re.findall(r"export async function (GET|POST|PUT|PATCH|DELETE)\(", path.read_text(encoding="utf-8")):
            routes.add((method, route))
    if routes != documented_routes:
        errors.append(f"API table mismatch: missing={sorted(routes - documented_routes)}, extra={sorted(documented_routes - routes)}")
    counts["api_routes"] = len(routes)

    template = json.loads((root / "docs/examples/webflow.template.json").read_text(encoding="utf-8"))
    if template != {"cloud": {"framework": "nextjs"}}:
        errors.append("Portable manifest must contain only cloud.framework=nextjs, without deployment identity")
    return counts, errors


def self_test():
    assert anchors("# Hello & world\n# Hello & world\n```text\n# Not a heading\n```\n") == {"hello--world", "hello--world-1"}
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "doc.md"
        path.write_text('# Example\n[local](doc.md#example)\n```json\n{"ok": true}\n```\n', encoding="utf-8")
        assert check_markdown(path) == ([], 1, 0, 1)
        path.write_text('# Example\n[bad](missing.md)\n[anchor](doc.md#absent)\n```json\n{broken}\n```\n', encoding="utf-8")
        problems, links, _, blocks = check_markdown(path)
        assert len(problems) == 3 and links == 2 and blocks == 1
        path.write_text('', encoding="utf-8")
        assert check_markdown(path) == ([], 0, 0, 0)
    return {"self_test": "passed"}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("root", nargs="?", default=".", help="CMS Version History example repository directory")
    parser.add_argument("--self-test", action="store_true", help="Verify the checker with known valid/invalid local fixtures")
    args = parser.parse_args()
    try:
        if args.self_test:
            print(json.dumps(self_test(), sort_keys=True))
            return 0
        root = Path(args.root).resolve()
        counts, errors = check_repository(root)
        print(json.dumps({**counts, "ok": not errors, "errors": errors}, indent=2, sort_keys=True))
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1 if errors else 0
    except (OSError, ValueError, KeyError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
