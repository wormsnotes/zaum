"""Exercise real Git snapshots, rollback selection and published asset links."""

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("prepare_site", Path(__file__).parents[1] / "scripts" / "prepare_site.py")
site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site)


class WebsiteVersionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Versioning tests")
        self.git("config", "user.email", "tests@example.invalid")
        (self.repo / "index.html").write_text('<link href="style.css?theme=paper&amp;v=old#top"><a href="news.html?topic=culture#story">Read</a>', encoding="utf-8")
        (self.repo / "news.html").write_text('<h1>News</h1>', encoding="utf-8")
        (self.repo / "style.css").write_text("/* first edition */", encoding="utf-8")
        (self.repo / "scripts").mkdir()
        (self.repo / "scripts" / "private.json").write_text('{"tooling": true}', encoding="utf-8")
        self.first = self.commit("First edition")
        self.git("tag", "site-0", self.first)
        (self.repo / "style.css").write_text("/* second edition */", encoding="utf-8")
        self.second = self.commit("Second edition")
        self.git("tag", "site-1", self.second)
        self.git("update-ref", "refs/remotes/origin/main", self.second)

    def git(self, *arguments):
        return site.git(self.repo, *arguments).decode().strip()

    def commit(self, message):
        self.git("add", ".")
        self.git("commit", "-m", message)
        return self.git("rev-parse", "HEAD")

    def prepare(self, ref, version="site-2"):
        output = self.root / "output"
        manifest = site.prepare(self.repo, ref, version, "123.1", output)
        return manifest, output

    def test_rollback_exports_old_assets_without_rewinding_main(self):
        (self.repo / "untracked.json").write_text("private", encoding="utf-8")
        manifest, output = self.prepare("previous")
        self.assertEqual(manifest["source_sha"], self.first)
        self.assertEqual((output / "style.css").read_text(), "/* first edition */")
        self.assertEqual(self.git("rev-parse", "HEAD"), self.second)
        self.assertFalse((output / "scripts").exists())
        self.assertFalse((output / "untracked.json").exists())
        self.assertEqual(json.loads((output / "version.json").read_text())["version"], "site-2")

    def test_rollback_replaces_cache_version_and_preserves_topic_and_fragment(self):
        _, output = self.prepare("site-0")
        content = (output / "index.html").read_text()
        self.assertIn("theme=paper&amp;v=" + self.first[:12] + "-123.1#top", content)
        self.assertIn("news.html?topic=culture&amp;v=" + self.first[:12] + "-123.1#story", content)
        self.assertNotIn("v=old", content)

    def test_previous_skips_duplicate_publications_of_same_commit(self):
        self.git("tag", "site-2", self.second)
        manifest, _ = self.prepare("previous", "site-3")
        self.assertEqual(manifest["source_sha"], self.first)

    def test_successful_run_is_reproducible_when_rerun(self):
        self.git("tag", "site-2", self.first)
        manifest, _ = self.prepare("main", "site-2")
        self.assertEqual(manifest["source_sha"], self.first)

    def test_missing_previous_version_does_not_publish(self):
        self.git("tag", "-d", "site-0")
        with self.assertRaisesRegex(ValueError, "No previous"):
            self.prepare("previous")
        self.assertFalse((self.root / "output").exists())

    def test_missing_linked_asset_does_not_publish(self):
        (self.repo / "news.html").unlink()
        broken = self.commit("Broken edition")
        with self.assertRaisesRegex(ValueError, "Missing local file"):
            self.prepare(broken)
        self.assertFalse((self.root / "output").exists())

    def test_version_without_homepage_does_not_publish(self):
        (self.repo / "index.html").unlink()
        broken = self.commit("No homepage")
        with self.assertRaisesRegex(ValueError, "no index.html"):
            self.prepare(broken)
        self.assertFalse((self.root / "output").exists())


if __name__ == "__main__":
    unittest.main()
