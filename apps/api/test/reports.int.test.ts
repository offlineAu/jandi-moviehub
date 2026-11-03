import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGuest, createTestApp, registerUser, resetState, type TestApp } from './helpers';

describe('reports (integration)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetState(t);
  });

  it('creates reports for existing targets, dedupes OPEN ones, and lets a moderator resolve', async () => {
    const reporter = await registerUser(t);
    const offender = await registerUser(t);
    const mod = await registerUser(t, { role: 'MODERATOR' });
    const room = (
      await offender.agent
        .post('/api/v1/rooms')
        .send({ name: 'Rude room', visibility: 'PUBLIC' })
        .expect(201)
    ).body.room;
    const msg = (
      await offender.agent
        .post(`/api/v1/rooms/${room.id}/messages`)
        .send({ body: 'nasty words' })
        .expect(201)
    ).body.message;

    const first = await reporter.agent
      .post('/api/v1/reports')
      .send({ targetType: 'USER', targetId: offender.id, reason: 'Harassment in chat' })
      .expect(201);
    expect(first.body.report).toMatchObject({
      targetType: 'USER',
      targetId: offender.id,
      status: 'OPEN',
    });
    const dup = await reporter.agent
      .post('/api/v1/reports')
      .send({ targetType: 'USER', targetId: offender.id, reason: 'Again' })
      .expect(409);
    expect(dup.body.error.code).toBe('ALREADY_REPORTED');
    await reporter.agent
      .post('/api/v1/reports')
      .send({ targetType: 'MESSAGE', targetId: msg.id, reason: 'Offensive message' })
      .expect(201);
    await reporter.agent
      .post('/api/v1/reports')
      .send({ targetType: 'ROOM', targetId: room.id, reason: 'Bad room name' })
      .expect(201);

    // Validation: unknown target, self-report, bad body.
    let res = await reporter.agent
      .post('/api/v1/reports')
      .send({ targetType: 'PLAYLIST', targetId: randomUUID(), reason: 'Spam list' })
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    res = await reporter.agent
      .post('/api/v1/reports')
      .send({ targetType: 'USER', targetId: reporter.id, reason: 'Me me me' })
      .expect(400);
    expect(res.body.error.code).toBe('CANNOT_REPORT_SELF');
    await reporter.agent
      .post('/api/v1/reports')
      .send({ targetType: 'USER', targetId: offender.id, reason: 'x' })
      .expect(400);
    await reporter.agent
      .post('/api/v1/reports')
      .send({ targetType: 'SONG', targetId: offender.id, reason: 'xyz' })
      .expect(400);

    const mine = await reporter.agent.get('/api/v1/reports/mine').expect(200);
    expect(mine.body.total).toBe(3);
    expect((await offender.agent.get('/api/v1/reports/mine').expect(200)).body.total).toBe(0);

    const queue = await mod.agent.get('/api/v1/admin/reports?status=OPEN').expect(200);
    expect(queue.body.total).toBe(3);
    const byType = Object.fromEntries(
      queue.body.items.map((r: { targetType: string }) => [r.targetType, r]),
    );
    expect(byType.USER.target).toMatchObject({
      type: 'USER',
      user: { id: offender.id },
      suspended: false,
    });
    expect(byType.MESSAGE.target).toMatchObject({
      type: 'MESSAGE',
      body: 'nasty words',
      author: { id: offender.id },
      room: { id: room.id, name: 'Rude room' },
    });
    expect(byType.ROOM.target).toMatchObject({
      type: 'ROOM',
      name: 'Rude room',
      host: { id: offender.id },
    });
    expect(byType.USER.reporter).toMatchObject({ id: reporter.id });
    const onlyMessages = await mod.agent
      .get('/api/v1/admin/reports?targetType=MESSAGE')
      .expect(200);
    expect(onlyMessages.body.total).toBe(1);

    const resolved = await mod.agent
      .patch(`/api/v1/admin/reports/${first.body.report.id}`)
      .send({ status: 'RESOLVED', resolutionNote: 'User warned' })
      .expect(200);
    expect(resolved.body.report).toMatchObject({
      status: 'RESOLVED',
      resolutionNote: 'User warned',
    });
    await mod.agent
      .patch(`/api/v1/admin/reports/${first.body.report.id}`)
      .send({ status: 'OPEN' })
      .expect(400);
    const audit = await t.prisma.auditLog.findMany({ where: { action: 'admin.report.resolve' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: mod.id,
      targetType: 'report',
      targetId: first.body.report.id,
    });
    expect(audit[0]!.metadata).toMatchObject({ from: 'OPEN', to: 'RESOLVED' });

    // After resolution the same target can be reported again.
    await reporter.agent
      .post('/api/v1/reports')
      .send({ targetType: 'USER', targetId: offender.id, reason: 'It happened again' })
      .expect(201);
    expect(
      (await mod.agent.get('/api/v1/admin/reports?status=RESOLVED').expect(200)).body.items[0]
        .resolvedBy,
    ).toMatchObject({ id: mod.id });
  });

  it('rejects guests, and rate-limits to 10 reports per hour per user', async () => {
    const guest = await createGuest(t);
    const reporter = await registerUser(t);
    // Created directly (registration has its own per-IP rate limit).
    const targets = await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        t.prisma.user.create({
          data: { username: `target_${i}`, email: `target_${i}@example.test` },
        }),
      ),
    );
    const g = await guest.agent
      .post('/api/v1/reports')
      .send({ targetType: 'USER', targetId: reporter.id, reason: 'guest report' })
      .expect(403);
    expect(g.body.error.code).toBe('GUEST_NOT_ALLOWED');
    for (const target of targets.slice(0, 10)) {
      await reporter.agent
        .post('/api/v1/reports')
        .send({ targetType: 'USER', targetId: target.id, reason: 'Spam account' })
        .expect(201);
    }
    const res = await reporter.agent
      .post('/api/v1/reports')
      .send({ targetType: 'USER', targetId: targets[10]!.id, reason: 'Spam account' })
      .expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
