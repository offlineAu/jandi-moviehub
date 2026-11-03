/* eslint-disable no-console -- CLI script: stdout is the user interface. */
/**
 * Creates an administrator account, or promotes an existing account to ADMIN.
 *
 *   pnpm admin:bootstrap -- --email admin@example.com --username admin [--display-name "Admin"] [--reset-password]
 *
 * The password is read from the ADMIN_PASSWORD environment variable or prompted for on stdin
 * (hidden). It is never accepted as a command-line argument (argv leaks into shell history and `ps`).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { emailSchema, passwordSchema, usernameSchema } from '@jandi/shared';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';

const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile) && !process.env.DATABASE_URL) process.loadEnvFile(envFile);

const USAGE =
  'Usage: pnpm admin:bootstrap -- --email <email> --username <username> [--display-name <name>] [--reset-password]\n' +
  'The password is read from ADMIN_PASSWORD or prompted for interactively.';

class UsageError extends Error {}

function parseCli() {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  if (argv.some((a) => a === '--password' || a.startsWith('--password='))) {
    throw new UsageError(
      'Passing a password on the command line is not allowed (it would leak into shell history and process lists).\n' +
        'Set ADMIN_PASSWORD in the environment or enter it at the prompt.',
    );
  }
  const { values } = parseArgs({
    args: argv,
    options: {
      email: { type: 'string' },
      username: { type: 'string' },
      'display-name': { type: 'string' },
      'reset-password': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }
  const email = emailSchema.safeParse(values.email ?? '');
  if (!email.success) throw new UsageError(`A valid --email is required.\n${USAGE}`);
  const username = usernameSchema.safeParse(values.username ?? '');
  if (!username.success) {
    throw new UsageError(
      `A valid --username is required (3–24 lowercase letters, numbers or underscores).\n${USAGE}`,
    );
  }
  const displayName =
    (values['display-name'] ?? username.data).trim().slice(0, 40) || username.data;
  return {
    email: email.data,
    username: username.data,
    displayName,
    resetPassword: values['reset-password'],
  };
}

/** Reads a line from stdin without echoing it when attached to a TTY. */
function prompt(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return new Promise((resolveLine, reject) => {
      const rl = createInterface({ input: stdin, terminal: false });
      let done = false;
      rl.once('line', (line) => {
        done = true;
        rl.close();
        resolveLine(line);
      });
      rl.once('close', () => {
        if (!done) reject(new UsageError('No password provided on stdin.'));
      });
    });
  }
  return new Promise((resolveLine, reject) => {
    process.stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const finish = (err?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stdout.write('\n');
      if (err) reject(err);
      else resolveLine(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') return finish();
        if (ch === '\u0003') return finish(new UsageError('Aborted.'));
        if (ch === '\u007f' || ch === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (ch >= ' ') {
          value += ch;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  let password: string;
  if (fromEnv) {
    password = fromEnv;
  } else {
    password = await prompt('Admin password: ');
    if (process.stdin.isTTY) {
      const confirm = await prompt('Confirm password: ');
      if (confirm !== password) throw new UsageError('Passwords do not match.');
    }
  }
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) throw new UsageError(parsed.error.issues.map((i) => i.message).join('; '));
  return parsed.data;
}

async function main() {
  const args = parseCli();
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({
      where: { email: args.email },
      include: { profile: true },
    });
    if (existing?.isGuest) throw new UsageError('Refusing to promote a guest account.');

    const needsPassword = !existing || args.resetPassword || !existing.passwordHash;
    const passwordHash = needsPassword ? await hashPassword(await readPassword()) : undefined;

    const { user, created } = await prisma.$transaction(async (tx) => {
      if (existing) {
        const updated = await tx.user.update({
          where: { id: existing.id },
          data: {
            role: 'ADMIN',
            suspendedAt: null,
            emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
            ...(passwordHash ? { passwordHash } : {}),
          },
        });
        if (!existing.profile) {
          await tx.userProfile.create({
            data: { userId: existing.id, displayName: args.displayName },
          });
        }
        if (passwordHash && existing.passwordHash) {
          // Credentials changed: revoke existing sessions.
          await tx.session.deleteMany({ where: { userId: existing.id } });
        }
        return { user: updated, created: false };
      }
      const taken = await tx.user.findUnique({ where: { username: args.username } });
      if (taken)
        throw new UsageError(
          `The username "${args.username}" is already taken by another account.`,
        );
      const createdUser = await tx.user.create({
        data: {
          email: args.email,
          username: args.username,
          passwordHash: passwordHash!,
          role: 'ADMIN',
          emailVerifiedAt: new Date(),
          profile: { create: { displayName: args.displayName } },
        },
      });
      await tx.watchlist.create({
        data: { ownerId: createdUser.id, name: 'My Watchlist', isDefault: true },
      });
      return { user: createdUser, created: true };
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'admin.bootstrap',
        targetType: 'user',
        targetId: user.id,
        metadata: { created, email: args.email, passwordSet: !!passwordHash },
      },
    });

    console.log(
      created
        ? `Created admin account ${user.username} <${user.email}> (id ${user.id}).`
        : `Promoted ${user.username} <${user.email}> (id ${user.id}) to ADMIN${passwordHash ? ' and set a new password' : ''}.`,
    );
    if (existing && existing.username !== args.username) {
      console.log(
        `Note: existing account kept its username "${existing.username}" (--username ignored).`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof UsageError || (error instanceof TypeError && 'code' in error)) {
    console.error(error.message);
    process.exit(2);
  }
  console.error('admin:bootstrap failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
