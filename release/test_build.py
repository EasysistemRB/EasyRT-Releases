import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('build', Path(__file__).with_name('build.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

class BuildValidation(unittest.TestCase):
    def test_tag_must_match_packaged_version(self):
        with self.assertRaisesRegex(ValueError, 'differs'):
            build.build('unused.zip', 'v99.0.0', False)

    def test_runtime_paths_cannot_escape_installation(self):
        for name in ['../outside.exe', '/outside.exe', 'C:/outside.exe', 'resources\\outside.exe']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as folder:
                archive = Path(folder) / 'runtime.zip'
                with zipfile.ZipFile(archive, 'w') as z:
                    z.writestr(name, b'bad')
                with self.assertRaisesRegex(ValueError, 'Unsafe'):
                    build.build(archive, 'v'+build.VERSION+'-rc.1', False)

if __name__ == '__main__':
    unittest.main()
