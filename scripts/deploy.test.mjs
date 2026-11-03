import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function deploy(failure = '') {
  const root = mkdtempSync(join(tmpdir(), 'tracker-deploy-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'bin'));
    copyFileSync(new URL('./deploy.sh', import.meta.url), join(root, 'scripts/deploy.sh'));
    writeFileSync(join(root, '.env.test'), '');
    writeFileSync(join(root, 'bin/docker'), `#!/bin/sh
echo "docker $*" >> "$DEPLOY_TEST_LOG"
case "$*" in
  *"ps -a"*) echo "pb-setup exited 0" ;;
  *"restart pocketbase"*) [ "$DEPLOY_TEST_FAILURE" != restart ] || exit 1 ;;
  *"--wait-timeout 120 pocketbase"*) [ "$DEPLOY_TEST_FAILURE" != health ] || exit 1 ;;
esac
exit 0
`, { mode: 0o755 });
    writeFileSync(join(root, 'bin/curl'), '#!/bin/sh\necho "curl $*" >> "$DEPLOY_TEST_LOG"\n', { mode: 0o755 });
    const log = join(root, 'commands.log');
    const result = spawnSync('bash', [join(root, 'scripts/deploy.sh'), 'test', '--no-checks', '--no-caddy'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${join(root, 'bin')}:${process.env.PATH}`,
        DEPLOY_TEST_LOG: log,
        DEPLOY_TEST_FAILURE: failure
      }
    });
    return { ...result, commands: readFileSync(log, 'utf8') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('deploy reloads hooks after successful migrations and waits for health before smoke tests', () => {
  const result = deploy();
  assert.equal(result.status, 0, result.stderr);
  const migration = result.commands.lastIndexOf('ps -a');
  const restart = result.commands.indexOf('restart pocketbase');
  const healthy = result.commands.indexOf('up -d --no-deps --wait --wait-timeout 120 pocketbase');
  const smoke = result.commands.indexOf('curl ');
  assert.ok(migration >= 0 && restart > migration && healthy > restart && smoke > healthy);
  assert.match(result.stdout, /Deploy test geslaagd/);
});

for (const failure of ['restart', 'health']) {
  test(`deploy stops without reporting success when PocketBase ${failure} fails`, () => {
    const result = deploy(failure);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.commands, /curl /);
    assert.doesNotMatch(result.stdout, /Deploy test geslaagd/);
  });
}
