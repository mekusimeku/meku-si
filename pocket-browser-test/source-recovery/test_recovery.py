"""Disposable tests for the Pocket v9 EXACT commit recovery tool; no production source."""
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

HERE = Path(__file__).resolve().parent
SCRIPT = (HERE / "recover-exact-v9.sh").read_text()
OFFICIAL = "cdda79046ec97bdcd219fcc2f963a252aeef7ea4"


def run(*cmd, cwd=None, check=True):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=check)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.repo = self.base / 'original'
        self.repo.mkdir()
        run('git', 'init', '-q', str(self.repo))
        run('git', 'config', 'user.name', 'Test Owner', cwd=self.repo)
        run('git', 'config', 'user.email', 'test@example.invalid', cwd=self.repo)
        (self.repo / 'src').mkdir()
        (self.repo / 'src' / 'Pocket.tsx').write_text('EXACT TEST APP\n')
        (self.repo / 'README.md').write_text('SAFE DEMO ONLY\n')
        run('git', 'add', '.', cwd=self.repo)
        run('git', 'commit', '-qm', 'saved exact test app', cwd=self.repo)
        self.saved = run('git', 'rev-parse', 'HEAD', cwd=self.repo).stdout.strip()
        # The only test-time change is in the disposable script copy.
        self.script = self.base / 'test-recover.sh'
        assert SCRIPT.count(OFFICIAL) >= 2
        self.script.write_text(SCRIPT.replace(OFFICIAL, self.saved))

    def call(self, script=None, out=None, repo=None):
        cmd = ['bash', str(script or self.script), '--repo', str(repo or self.repo)]
        if out: cmd += ['--out', str(out)]
        return run(*cmd, check=False)

    def test_export_exact_commit_and_manifest(self):
        output = self.base / 'private-out'
        result = self.call(out=output)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('RECOVERED_EXACT_V9=YES', result.stdout)
        self.assertIn(f'COMMIT={self.saved}', result.stdout)
        self.assertTrue((output / 'MANIFEST.txt').exists())
        with zipfile.ZipFile(output / 'MEKU-Pocket-v9-EXACT-SOURCE.zip') as z:
            self.assertEqual(z.read('src/Pocket.tsx'), b'EXACT TEST APP\n')
            self.assertEqual(z.read('README.md'), b'SAFE DEMO ONLY\n')

    def test_newer_head_does_not_change_exported_snapshot(self):
        (self.repo / 'src' / 'Pocket.tsx').write_text('WRONG NEW HEAD\n')
        run('git','add','.',cwd=self.repo)
        run('git','commit','-qm','newer not-v9',cwd=self.repo)
        output = self.base / 'old-source-only'
        self.assertEqual(self.call(out=output).returncode, 0)
        with zipfile.ZipFile(output / 'MEKU-Pocket-v9-EXACT-SOURCE.zip') as z:
            self.assertEqual(z.read('src/Pocket.tsx'), b'EXACT TEST APP\n')

    def test_original_official_commit_missing_does_not_export(self):
        output = self.base / 'must-not-exist'
        result = self.call(script=HERE / 'recover-exact-v9.sh',out=output)
        self.assertEqual(result.returncode, 4)
        self.assertIn('NOT FOUND', result.stderr)
        self.assertFalse(output.exists())

    def test_refuse_existing_output(self):
        output = self.base / 'do-not-overwrite'
        output.mkdir()
        marker = output / 'important.txt'
        marker.write_text('KEEP')
        result = self.call(out=output)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(marker.read_text(), 'KEEP')

    def test_refuse_output_inside_project(self):
        output = self.repo / 'recovery'
        result = self.call(out=output)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(output.exists())

    def test_nested_output_inside_project_is_rejected_without_creating_dirs(self):
        output = self.repo / 'new' / 'nested' / 'recovery'
        result = self.call(out=output)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.repo / 'new').exists())

    def test_refuse_non_git_path(self):
        other = self.base / 'plain'
        other.mkdir()
        result = self.call(repo=other,out=self.base / 'none')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.base / 'none').exists())

    def test_original_working_tree_unmodified(self):
        before = run('git','status','--porcelain',cwd=self.repo).stdout
        result = self.call(out=self.base / 'export')
        self.assertEqual(result.returncode, 0)
        after = run('git','status','--porcelain',cwd=self.repo).stdout
        self.assertEqual(before, after)


if __name__ == '__main__':
    unittest.main(verbosity=2)
