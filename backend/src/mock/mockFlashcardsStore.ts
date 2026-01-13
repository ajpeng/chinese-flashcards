export type FlashcardRecord = {
  id: number;
  userId: string; // mock user id
  wordId: number;
  createdAt: string;
};

const store: FlashcardRecord[] = [];
let nextId = 1;

export function addFlashcard(userId: string, wordId: number) {
  const rec: FlashcardRecord = {
    id: nextId++,
    userId,
    wordId,
    createdAt: new Date().toISOString(),
  };
  store.push(rec);
  return rec;
}

export function listFlashcards() {
  return store.slice();
}

export function removeFlashcard(userId: string, wordId: number) {
  let removed = 0;
  for (let i = store.length - 1; i >= 0; i--) {
    if (store[i].userId === userId && store[i].wordId === wordId) {
      store.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

export function clearFlashcards() {
  store.length = 0;
  nextId = 1;
}
