// Ensure DATABASE_URL exists so app can import modules that expect it.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/test';

import request from 'supertest';
import app from '../../src/app';
import { clearFlashcards, listFlashcards } from '../../src/mock/mockFlashcardsStore';

beforeEach(() => {
  clearFlashcards();
});

describe('POST /api/users/mock/flashcards', () => {
  it('returns 201 and stored record for valid wordId', async () => {
    const res = await request(app)
      .post('/api/users/mock/flashcards')
      .send({ wordId: 42 })
      .set('Accept', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toMatchObject({ userId: 'mock-user', wordId: 42 });

    const all = listFlashcards();
    expect(all.length).toBe(1);
    expect(all[0].wordId).toBe(42);
  });

  it('returns 400 for invalid payload', async () => {
    const res = await request(app).post('/api/users/mock/flashcards').send({ wordId: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/users/mock/flashcards', () => {
  it('returns empty array initially and contains entries after posting', async () => {
    const empty = await request(app).get('/api/users/mock/flashcards');
    expect(empty.status).toBe(200);
    expect(Array.isArray(empty.body)).toBe(true);
    expect(empty.body.length).toBe(0);

    await request(app).post('/api/users/mock/flashcards').send({ wordId: 7 });
    const after = await request(app).get('/api/users/mock/flashcards');
    expect(after.status).toBe(200);
    expect(after.body.length).toBe(1);
    expect(after.body[0]).toMatchObject({ wordId: 7 });
  });
});
