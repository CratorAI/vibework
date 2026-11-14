# Start a packaged Vibework build with launchd's minimal environment (what an
# app opened from Finder gets), without LaunchServices. Usage:
#   python3 scripts/e2e/launch-release.py <Vibework.app/Contents/MacOS/Vibework> <log> [--probe]
# --probe (dev-release-probe builds only): turn the dev bridge on and pass the
# key in the environment (never in argv, never printed): VIBEWORK_DEV_OPENROUTER_KEY
# from the caller's environment when set (a dummy key keeps the Keychain out of it
# entirely), else read from the Keychain. VIBEWORK_DEV_DATA_DIR is passed through
# too: such a copy runs on its own data folder beside an installed Vibework.
# Prints the app's pid; quit it with `kill -TERM <pid>` (a clean exit).
import os, subprocess, sys
exe, log = sys.argv[1], sys.argv[2]
env = {
    'HOME': os.environ['HOME'], 'USER': os.environ['USER'], 'LOGNAME': os.environ['USER'],
    'SHELL': '/bin/zsh', 'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'TMPDIR': os.environ.get('TMPDIR', '/tmp/'),
    'LANG': 'en_US.UTF-8', '__CFBundleIdentifier': 'com.vibeworkapp.vibework',
}
if '--probe' in sys.argv:
    env['VIBEWORK_DEV_BRIDGE'] = '1'
    env['VIBEWORK_DEV_OPENROUTER_KEY'] = os.environ.get('VIBEWORK_DEV_OPENROUTER_KEY') or subprocess.check_output(['/usr/bin/security', 'find-generic-password', '-s', 'vibe-work-openrouter', '-a', 'api-key', '-w']).decode().strip()
    if os.environ.get('VIBEWORK_DEV_DATA_DIR'):
        env['VIBEWORK_DEV_DATA_DIR'] = os.environ['VIBEWORK_DEV_DATA_DIR']
p = subprocess.Popen([exe], env=env, stdout=open(log, 'ab'), stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
print(p.pid)
