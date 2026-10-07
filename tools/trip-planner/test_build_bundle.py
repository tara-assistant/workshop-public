"""Focused regression tests; every builder invocation uses an isolated project."""
import errno
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parent
ASSETS = (
    'app.js', 'client-key.css', 'client-key.js', 'enhancements.css',
    'enhancements.js', 'index.html', 'styles.css',
)
# Verified by two isolated builds of the current public Trip Planner source.
EXPECTED_HASHES = {
    'app.js': '105abd1086554a952afbdd4ce4f7602f1cd8bf20479c62532dfde5120a96d268',
    'client-key.css': '2eedcdeb063eb439cb46c4be730efaba09fded26ca928faf6314b25f5cfd35ce',
    'client-key.js': 'e45a6ec9d11dfa2fb3a3e8258367680cf7663166248aba698fe32d0bdf6e4a95',
    'enhancements.css': '07969c5eca58284fb0e37619de1d33c7e25457156d43abf21920081a46762059',
    'enhancements.js': 'c83dc43c1653352dcaf58c7e62f32c6a846b0ee07629cb69cabee05861e121c7',
    'index.html': 'f0927ef7a3da9db910e472404289fc91aded5aa2549aba0e8240ea87a588ead3',
    'styles.css': '73f0dcb21e37db10c824acf1d1a29357a0e6f2d97d85e3171eec2f1bc8d63523',
}


def snapshot(directory: Path) -> dict[str, bytes]:
    return {
        path.relative_to(directory).as_posix(): path.read_bytes()
        for path in sorted(directory.rglob('*')) if path.is_file()
    }


def tree_state(directory: Path) -> dict[str, tuple[str, bytes | str]]:
    state = {}
    for path in sorted(directory.rglob('*')):
        name = path.relative_to(directory).as_posix()
        if path.is_symlink():
            state[name] = ('symlink', str(path.readlink()))
        elif path.is_dir():
            state[name] = ('directory', '')
        else:
            state[name] = ('file', path.read_bytes())
    return state


class BuildBundleTest(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix='trip-planner-bundle-')
        self.addCleanup(temporary.cleanup)
        self.temp_root = Path(temporary.name).resolve()
        self.repo_root = self.temp_root / 'repo'
        self.project = self.repo_root / 'projects' / 'trip-planner'
        self.project.mkdir(parents=True)
        (self.repo_root / '.git').mkdir()
        self.builder = self.project / 'build_bundle.py'
        for name in ('build_bundle.py', *ASSETS):
            (self.project / name).write_bytes((PROJECT / name).read_bytes())
        self.protected = (self.project / 'public-preview', self.repo_root / 'dist')
        for directory in self.protected:
            (directory / 'empty').mkdir(parents=True)
            (directory / 'keep.bin').write_bytes(b'protected sentinel\x00\xff\r\n')
            before = tree_state(directory)
            self.addCleanup(
                lambda directory=directory, before=before:
                self.assertEqual(tree_state(directory), before)
            )

    def build(self, destination: Path | None = None, *, optimized: bool = False) -> subprocess.CompletedProcess[str]:
        arguments = [sys.executable, '-B']
        if optimized:
            arguments.append('-O')
        self.assertTrue(self.builder.resolve().is_relative_to(self.temp_root))
        self.assertTrue(self.repo_root.resolve().is_relative_to(self.temp_root))
        arguments.append(str(self.builder.relative_to(self.repo_root)))
        if destination is not None:
            self.assertTrue(destination.is_absolute())
            self.assertTrue(destination.is_relative_to(self.temp_root))
            self.assertTrue(destination.resolve().is_relative_to(self.temp_root))
            arguments.extend(('--output', str(destination)))
        return subprocess.run(
            arguments, cwd=self.repo_root, capture_output=True, text=True,
            encoding='utf-8', errors='replace', timeout=30,
        )

    def assert_refused(self, destination: Path | None, message: str, *, optimized: bool = False) -> None:
        before = tree_state(self.temp_root)
        result = self.build(destination, optimized=optimized)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(message, result.stderr)
        self.assertEqual(tree_state(self.temp_root), before)

    def symlink(self, link: Path, target: Path, *, directory: bool = True) -> None:
        try:
            link.symlink_to(target, target_is_directory=directory)
        except OSError as exc:
            if exc.errno in (errno.EPERM, errno.EACCES, errno.ENOSYS, errno.ENOTSUP) or getattr(exc, 'winerror', None) in (50, 1314):
                self.skipTest(f'Host cannot create this symlink: {exc}')
            raise
        except NotImplementedError as exc:
            self.skipTest(f'Host does not implement symlinks: {exc}')

    def test_reproducible_preview(self) -> None:
        source = snapshot(self.project)
        first, second = self.temp_root / 'first', self.temp_root / 'second'
        for destination in (first, second):
            result = self.build(destination)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        first_files, second_files = snapshot(first), snapshot(second)
        self.assertEqual(list(first_files), list(ASSETS))
        self.assertEqual(first_files, second_files)
        self.assertEqual(
            {name: hashlib.sha256(data).hexdigest() for name, data in first_files.items()},
            EXPECTED_HASHES,
        )
        self.assertEqual(snapshot(self.project), source)
        for data in first_files.values():
            self.assertNotIn(b'__MAPBOX_TOKEN__', data)

        html = first_files['index.html'].decode('utf-8')
        self.assertIn('<div class="modal-overlay" id="mapboxTokenModal"', html)
        self.assertNotIn('<div class="modal-backdrop" id="mapboxTokenModal"', html)
        for element in (
            'mapboxTokenNotice', 'mapboxTokenModal', 'mapboxTokenForm',
            'mapboxTokenInput', 'mapboxTokenFeedback', 'configureMapboxBtn',
            'mapboxSettingsBtn', 'mapboxSettingsMenuBtn',
            'closeMapboxTokenModal', 'clearMapboxTokenBtn',
        ):
            self.assertEqual(html.count(f'id="{element}"'), 1, element)
        for disclosure in (
            'Map requires your own Mapbox public token.',
            'The token is saved only in this browser.',
            'Do not enter a secret token.',
            'Remove saved key', 'Save in this browser',
        ):
            self.assertIn(disclosure, html)
        self.assertIn(
            '<input id="mapboxTokenInput" type="password" autocomplete="off"', html,
        )
        self.assertIn(
            '<script src="app.js"></script><script src="enhancements.js"></script>'
            '<script src="client-key.js"></script>', html,
        )
        self.assertEqual(html.count('src="client-key.js"'), 1)
        self.assertIn('<h1 class="page-title">Trip Planner</h1>', html)
        self.assertIn('.page-title {', first_files['styles.css'].decode('utf-8'))
        self.assertIn(b"mapboxgl.accessToken = '';", first_files['app.js'])
        self.assertIn(b"mapboxgl.accessToken='';", first_files['enhancements.js'])


    def test_existing_empty_and_file_outputs(self) -> None:
        existing = self.temp_root / 'existing'
        (existing / 'empty-child').mkdir(parents=True)
        (existing / 'keep.bin').write_bytes(b'untouched\x00\xff\r\n')
        empty = self.temp_root / 'empty'
        empty.mkdir()
        occupied = self.temp_root / 'occupied'
        occupied.write_bytes(b'preserve this file\x00\xff')
        for destination in (existing, empty, occupied):
            with self.subTest(destination=destination.name):
                self.assert_refused(destination, 'output path already exists')

    def test_protected_outputs(self) -> None:
        for protected in self.protected:
            for destination in (protected, protected / 'new-bundle'):
                with self.subTest(destination=str(destination)):
                    self.assert_refused(destination, 'protected output path')
        self.assert_refused(None, 'required: --output')

    def test_nearest_repository_with_git_directory_or_file(self) -> None:
        (self.temp_root / '.git').mkdir()
        outer_dist = self.temp_root / 'dist'
        outer_dist.mkdir()
        marker = self.repo_root / '.git'
        for kind in ('directory', 'file'):
            with self.subTest(marker=kind):
                if kind == 'file':
                    marker.rmdir()
                    marker.write_text('gitdir: dummy-worktree\n', encoding='utf-8')
                for protected in self.protected:
                    for destination in (protected, protected / 'new-bundle'):
                        self.assert_refused(destination, 'protected output path')
                destination = outer_dist / kind
                result = self.build(destination)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(
                    {name: hashlib.sha256(data).hexdigest() for name, data in snapshot(destination).items()},
                    EXPECTED_HASHES,
                )

    def test_missing_git_ancestor_refused(self) -> None:
        (self.repo_root / '.git').rmdir()
        for optimized in (False, True):
            with self.subTest(optimized=optimized):
                self.assert_refused(
                    self.temp_root / 'missing-repository',
                    'no Git repository root found', optimized=optimized,
                )

    def test_existing_output_symlink(self) -> None:
        for directory in (True, False):
            with self.subTest(directory=directory):
                target = self.temp_root / f'target-{directory}'
                if directory:
                    (target / 'empty').mkdir(parents=True)
                    (target / 'keep.bin').write_bytes(b'symlink target sentinel')
                else:
                    target.write_bytes(b'file target sentinel')
                link = self.temp_root / f'output-link-{directory}'
                self.symlink(link, target, directory=directory)
                self.assert_refused(link, 'output path already exists')
                self.assertTrue(link.is_symlink())

    def test_dangling_output_symlink(self) -> None:
        target = self.temp_root / 'absent-target'
        link = self.temp_root / 'dangling-output'
        self.symlink(link, target)
        self.assert_refused(link, 'output path already exists')
        self.assertFalse(target.exists())
        self.assertTrue(link.is_symlink())

    def test_parent_symlink_into_protected_output(self) -> None:
        for protected in self.protected:
            with self.subTest(protected=protected.name):
                link = self.temp_root / f'parent-link-{protected.name}'
                self.symlink(link, protected)
                self.assert_refused(link / 'new-bundle', 'protected output path')
                self.assertFalse((protected / 'new-bundle').exists())
                self.assertTrue(link.is_symlink())

    def test_script_marker_refused_under_optimization(self) -> None:
        source = self.project / 'index.html'
        original = source.read_text(encoding='utf-8')
        marker = '<script src="app.js"></script>'
        self.assertEqual(original.count(marker), 1)
        for replacement in ('', marker + marker):
            with self.subTest(marker_count=replacement.count(marker)):
                source.write_text(original.replace(marker, replacement), encoding='utf-8')
                self.assert_refused(
                    self.temp_root / 'invalid-marker',
                    'expected exactly one app.js script insertion marker', optimized=True,
                )

    def test_script_counts_refused_under_optimization(self) -> None:
        source = self.project / 'index.html'
        original_html = source.read_text(encoding='utf-8')
        original_builder = self.builder.read_text(encoding='utf-8')
        for script in ('enhancements.js', 'client-key.js'):
            for count in (0, 2):
                with self.subTest(script=script, count=count):
                    source.write_text(original_html, encoding='utf-8')
                    self.builder.write_text(original_builder, encoding='utf-8')
                    if count == 0:
                        # Fault injection into the fixture's generated markup.
                        tag = f'<script src="{script}"></script>'
                        self.assertEqual(original_builder.count(tag), 1)
                        self.builder.write_text(original_builder.replace(tag, ''), encoding='utf-8')
                    else:
                        source.write_text(
                            original_html + f"<script defer src='{script}'></script>", encoding='utf-8',
                        )
                    self.assert_refused(
                        self.temp_root / 'invalid-scripts',
                        f'expected exactly one {script} script tag', optimized=True,
                    )

    def test_required_ids_refused_under_optimization(self) -> None:
        original = self.builder.read_text(encoding='utf-8')
        for element in (
            'phaseTabs', 'transportMode', 'routeStatus', 'packingList',
            'mapMessage', 'controlHint', 'navigationSteps', 'mapboxTokenNotice',
            'mapboxTokenForm', 'mapboxSettingsBtn', 'mapboxSettingsMenuBtn',
        ):
            with self.subTest(element=element):
                # These IDs are generated, so corrupt only the fixture builder's markup.
                marker = f'id="{element}"'
                self.assertEqual(original.count(marker), 1)
                self.builder.write_text(
                    original.replace(marker, f'data-removed-id="{element}"'), encoding='utf-8',
                )
                self.assert_refused(
                    self.temp_root / 'invalid-ids',
                    f'missing required element IDs: {element}.', optimized=True,
                )


if __name__ == '__main__':
    unittest.main()
