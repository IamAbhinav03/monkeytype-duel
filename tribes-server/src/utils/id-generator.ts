const usedIds = new Set<string>();

export function generateRoomId(): string {
  let id: string;
  do {
    id = Math.random().toString(16).substring(2, 8).toUpperCase();
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

export function releaseRoomId(id: string): void {
  usedIds.delete(id);
}

export function generateSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}
