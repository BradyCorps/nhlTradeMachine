"""Offline archive integrity checks; no network or Production access."""
import argparse
import gzip
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
import crawl


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.original = (crawl.ARCHIVE, crawl.MANIFEST)
        crawl.ARCHIVE = Path(self.directory.name)
        crawl.MANIFEST = crawl.ARCHIVE / "manifest.jsonl"

    def tearDown(self):
        crawl.ARCHIVE, crawl.MANIFEST = self.original
        self.directory.cleanup()

    def test_plan_has_explicit_complete_season_and_competition(self):
        urls = crawl.harvest_plan(["20252026"], [2, 3])
        self.assertEqual(len(urls), 102)
        self.assertFalse(any("/now" in url for url in urls))
        self.assertEqual(sum("limit=-1" in url for url in urls), 6)
        self.assertTrue(any("gameTypeId=3" in url for url in urls))

    def test_content_addressing_reuses_and_recovers_missing_objects(self):
        client = crawl.Client(0)
        with patch.object(client, "get", return_value=(200, b'{"season":20252026}', None)):
            first = crawl.store(client, "https://example.com/20252026/2", set())
            second = crawl.store(client, first.url, {first.sha256})
            self.assertEqual(first.sha256, second.sha256)
            (crawl.ARCHIVE / first.path).unlink()
            third = crawl.store(client, first.url, {first.sha256})
            with gzip.open(crawl.ARCHIVE / third.path, "rb") as body:
                self.assertEqual(body.read(), b'{"season":20252026}')

    def test_corrupt_object_cannot_be_overwritten(self):
        client = crawl.Client(0)
        with patch.object(client, "get", return_value=(200, b'{}', None)):
            record = crawl.store(client, "https://example.com/20252026/2", set())
            with gzip.open(crawl.ARCHIVE / record.path, "wb") as body: body.write(b'wrong')
            with self.assertRaises(ValueError): crawl.store(client, record.url, set())

    def test_harvest_and_verify_include_all_discovered_players(self):
        args = argparse.Namespace(seasons="20252026", game_types="2,3", include_player_details=True, rate=0, dry_run=False)
        def get(_client, url):
            if "/summary?" in url:
                # Include a historical player absent from today's roster.
                rows = [] if "/team/" in url else [{"playerId": 123, "seasonId": 20252026}]
                return 200, json.dumps({"total": len(rows), "data": rows}).encode(), None
            return (404, None, None) if "/edge/" in url else (200, b'{}', None)
        with patch.object(crawl.Client, "get", get): crawl.harvest(args)
        crawl.verify(args)
        records = [json.loads(line) for line in crawl.MANIFEST.read_text().splitlines()]
        self.assertTrue(any("/player/123/landing" in r["url"] for r in records))
        self.assertTrue(any("/123/20252026/3" in r["url"] for r in records))

    def test_truncated_summary_fails_closed(self):
        args = argparse.Namespace(seasons="20252026", game_types="2", include_player_details=True, rate=0, dry_run=False)
        with patch.object(crawl.Client, "get", return_value=(200, b'{"total":101,"data":[]}', None)):
            with self.assertRaises(SystemExit): crawl.harvest(args)


if __name__ == "__main__": unittest.main()
