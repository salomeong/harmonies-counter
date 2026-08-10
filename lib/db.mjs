import { neon } from '@neondatabase/serverless';

let _sql;
export function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

export function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isDefaultName(name) {
  return /^Player\s+\d+$/i.test(String(name || '').trim());
}

export const GAMES = ['harmonies', 'faraway'];

export function normalizeGame(game) {
  const g = String(game || '').trim().toLowerCase();
  return GAMES.includes(g) ? g : null;
}
