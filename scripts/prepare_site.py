"""Export a recorded website version without changing the working branch."""

import argparse
from datetime import datetime, timezone
import html
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import subprocess
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


ASSET_EXTENSIONS = {
    ".html", ".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".webp",
    ".gif", ".avif", ".ico", ".woff", ".woff2", ".ttf", ".otf",
    ".mp3", ".ogg", ".wav", ".mp4", ".webm", ".json", ".xml", ".txt",
}
EXCLUDED_DIRECTORIES = {"scripts", "tests", "node_modules"}
EXCLUDED_FILES = {"package.json", "package-lock.json", "tsconfig.json"}
ATTRIBUTE = re.compile(r"\b(?P<name>href|src)\s*=\s*(?P<quote>[\"'])(?P<url>.*?)(?P=quote)", re.I)


def git(repo, *arguments):
    result = subprocess.run(["git", "-C", str(repo), *arguments], capture_output=True)
    if result.returncode:
        raise ValueError(result.stderr.decode("utf-8", errors="replace").strip())
    return result.stdout


def resolve_commit(repo, ref):
    return git(repo, "rev-parse", "--verify", "--end-of-options", ref + "^{commit}").decode().strip()


def recorded_versions(repo):
    tags = git(repo, "tag", "--list", "site-*").decode().splitlines()
    return sorted((tag for tag in tags if re.fullmatch(r"site-\d+", tag)),
                  key=lambda tag: int(tag.split("-")[1]), reverse=True)


def select_source(repo, requested, version):
    # A rerun must reuse the source it already published, even for "previous".
    if version in recorded_versions(repo):
        return resolve_commit(repo, "refs/tags/" + version)
    if requested == "previous":
        versions = recorded_versions(repo)
        if versions:
            current = resolve_commit(repo, "refs/tags/" + versions[0])
            for tag in versions[1:]:
                candidate = resolve_commit(repo, "refs/tags/" + tag)
                if candidate != current:
                    return candidate
        raise ValueError("No previous published version exists. Choose a saved tag or commit SHA instead.")
    return resolve_commit(repo, "origin/main" if requested == "main" else requested)


def website_files(repo, source_sha):
    files = {}
    for record in git(repo, "ls-tree", "-r", "-z", source_sha).split(b"\0"):
        if not record:
            continue
        metadata, raw_name = record.split(b"\t", 1)
        mode, kind, object_sha = metadata.decode().split()
        name = raw_name.decode("utf-8")
        path = PurePosixPath(name)
        if name == ".nojekyll":
            pass
        elif (any(part.startswith(".") or part in EXCLUDED_DIRECTORIES for part in path.parts)
              or path.name in EXCLUDED_FILES
              or (path.suffix.lower() not in ASSET_EXTENSIONS and name != "CNAME")):
            continue
        if mode not in {"100644", "100755"} or kind != "blob":
            raise ValueError("Website assets must be ordinary files: " + name)
        files[name] = git(repo, "cat-file", "blob", object_sha)
    if "index.html" not in files:
        raise ValueError("The selected version has no index.html; publication cancelled.")
    return files


def version_links(source, page, files, cache_key):
    def replace(match):
        original = html.unescape(match.group("url"))
        parts = urlsplit(original)
        if parts.scheme or parts.netloc or not parts.path:
            return match.group(0)
        path = posixpath.normpath(posixpath.join(posixpath.dirname(page), parts.path))
        if parts.path.endswith("/"):
            path = posixpath.join(path, "index.html")
        if PurePosixPath(path).suffix.lower() not in ASSET_EXTENSIONS:
            return match.group(0)
        if path not in files:
            raise ValueError("Missing local file in " + page + ": " + original)
        query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "v"]
        query.append(("v", cache_key))
        updated = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
        quote = match.group("quote")
        return match.group("name") + "=" + quote + html.escape(updated, quote=True) + quote
    return ATTRIBUTE.sub(replace, source)


def prepare(repo, requested, version, deployment_id, output):
    if not re.fullmatch(r"site-\d+", version):
        raise ValueError("Version must use the site-N format.")
    source_sha = select_source(repo, requested, version)
    files = website_files(repo, source_sha)
    cache_key = source_sha[:12] + "-" + deployment_id
    for name in list(files):
        if name.endswith(".html"):
            files[name] = version_links(files[name].decode("utf-8"), name, files, cache_key).encode("utf-8")
    manifest = {
        "version": version,
        "source_sha": source_sha,
        "requested_ref": requested,
        "deployment_id": deployment_id,
        "published_at": datetime.now(timezone.utc).isoformat(),
    }
    files["version.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError("The output folder must be empty: " + str(output))
    for name, data in files.items():
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--ref", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--deployment-id", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        manifest = prepare(args.repo, args.ref, args.version, args.deployment_id, args.output)
    except ValueError as error:
        parser.exit(1, str(error) + "\n")
    print(json.dumps(manifest, indent=2))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
            stream.write("source_sha=" + manifest["source_sha"] + "\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as stream:
            stream.write("## Website version\n\n- Saved version: `" + manifest["version"]
                         + "`\n- Source: `" + manifest["source_sha"] + "`\n")


if __name__ == "__main__":
    main()
