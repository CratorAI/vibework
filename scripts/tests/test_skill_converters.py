"""Run with Python unittest; exercises both standalone skill converters.

Kept outside .vibework/skills so it is not bundled with the app:
    python3 -m unittest scripts/tests/test_skill_converters.py
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SKILLS = Path(__file__).resolve().parents[2] / '.vibework' / 'skills'
SCRIPTS = SKILLS / 'vibework-docx' / 'scripts'

class ConverterTests(unittest.TestCase):
    def modules(self):
        for path in [SCRIPTS / 'converter.py', SKILLS / 'vibework-pptx/scripts/converter.py']:
            spec = importlib.util.spec_from_file_location('converter_under_test', path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            yield module

    def test_fake_executable_and_profile(self):
        for module in self.modules():
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                executable = root / 'soffice'
                executable.write_text('''#!/bin/sh
[ "$1" = "--version" ] && exit 0
case "$1" in -env:UserInstallation=file://*/profile) ;; *) exit 9;; esac
[ "$2" = "--headless" ] && [ "$3" = "--convert-to" ] && [ "$4" = "pdf" ] && [ "$5" = "--outdir" ] || exit 8
name="${7##*/}"
printf '%%PDF-1.4 dummy' > "$6/${name%.*}.pdf"
''')
                executable.chmod(0o755)
                source = root / 'document with spaces.docx'
                source.write_bytes(b'dummy input')
                with patch.dict(os.environ, {'PATH': str(root)}):
                    self.assertEqual(module.find_soffice(), str(executable))
                    self.assertTrue(module.convert_to_pdf(source).startswith(b'%PDF-'))

    def test_broken_symlink_and_missing(self):
        for module in self.modules():
            with tempfile.TemporaryDirectory() as temp:
                link = Path(temp) / 'soffice'
                link.symlink_to(Path(temp) / 'missing')
                # Hide platform installs to make this test portable.
                original_is_file = module.Path.is_file
                def isolated_is_file(path):
                    return original_is_file(path) if str(path).startswith(temp) else False
                with patch.object(module.shutil, 'which', return_value=str(link)), patch.object(module.Path, 'is_file', isolated_is_file):
                    with self.assertRaisesRegex(module.LibreOfficeNotInstalled, 'brew install --cask libreoffice'):
                        module.find_soffice()

    def test_stale_wrapper_is_not_an_installation(self):
        for module in self.modules():
            with tempfile.TemporaryDirectory() as temp:
                wrapper = Path(temp) / 'soffice'
                wrapper.write_text('#!/bin/sh\nexit 127\n')
                wrapper.chmod(0o755)
                original_is_file = module.Path.is_file
                def isolated_is_file(path):
                    return original_is_file(path) if str(path).startswith(temp) else False
                with patch.object(module.shutil, 'which', return_value=str(wrapper)), patch.object(module.Path, 'is_file', isolated_is_file):
                    with self.assertRaises(module.LibreOfficeNotInstalled):
                        module.find_soffice()

    def test_timeout_and_failed_conversion(self):
        for module in self.modules():
            with tempfile.TemporaryDirectory() as temp:
                source = Path(temp) / 'test.pptx'
                source.touch()
                with patch.object(module, 'find_soffice', return_value='/fake/soffice'):
                    with patch.object(module.subprocess, 'run', side_effect=subprocess.TimeoutExpired('soffice', 120)):
                        with self.assertRaisesRegex(RuntimeError, 'timed out'):
                            module.convert_to_pdf(source)
                    with patch.object(module.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '', '')):
                        with self.assertRaisesRegex(RuntimeError, 'failed to produce'):
                            module.convert_to_pdf(source)

if __name__ == '__main__':
    unittest.main()
