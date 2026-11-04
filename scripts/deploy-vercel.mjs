import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Deploy only committed source. Local build caches, media and credentials never
// enter the upload, even if the CLI's ignore handling changes.
const root = resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git('status', '--porcelain')) {
  throw new Error('Commit or stash your changes before deploying the committed source.');
}
const project = join(root, '.vercel', 'project.json');
if (!existsSync(project)) {
  throw new Error('Link this folder first with vercel link --project jandi-moviehub.');
}

const temporary = mkdtempSync(join(tmpdir(), 'jandi-vercel-'));
try {
  const source = join(temporary, 'source');
  const archive = join(temporary, 'source.tar');
  mkdirSync(source);
  execFileSync('git', ['archive', '--format=tar', '--output', archive, 'HEAD'], { cwd: root });
  execFileSync('tar', ['-xf', archive, '-C', source]);
  mkdirSync(join(source, '.vercel'));
  copyFileSync(project, join(source, '.vercel', 'project.json'));
  console.log(
    `Prepared commit ${git('rev-parse', '--short', 'HEAD')} (${statSync(archive).size} bytes).`,
  );
  if (process.argv.includes('--check')) {
    console.log('Source archive and project link are ready; no deployment requested.');
  } else {
    const result = spawnSync('vercel', ['deploy', '--prod', '--yes', '--archive=tgz'], {
      cwd: source,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
