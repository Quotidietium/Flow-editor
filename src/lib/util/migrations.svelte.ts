import { injectHistoryIDs } from '$lib/components/History/historyState.svelte';
import { persisted } from '$lib/util/persist.svelte';

interface MigrationState {
  version: number;
}

const migrations: Record<string, () => void> = {
  injectHistoryIDs
};

const migrationState = persisted<MigrationState>('migrations', { version: -1 });

export const applyMigrations = (): void => {
  const allMigrations = Object.entries(migrations);
  const latest = allMigrations.length - 1;
  // The persisted version is untrusted (hand-edited or corrupt localStorage):
  // a negative or fractional value made the loop read migrations[-4] and
  // throw during startup; a value beyond `latest` silently skipped every
  // future migration. Anything outside [-1, latest] resets to -1 and re-runs
  // the (idempotent) migrations from scratch.
  const raw = migrationState.value.version;
  const version = Number.isInteger(raw) && raw >= -1 && raw <= latest ? raw : -1;
  if (version !== raw) {
    migrationState.value = { version };
  }
  if (version === latest) {
    return;
  }
  console.log(`Current migration version: v${version}. Migrating to v${latest}.`);
  for (let i = version + 1; i <= latest; i++) {
    const [key, fn] = allMigrations[i] as [string, () => void];
    console.log(`Applying migration ${i}: ${key}.`);
    fn();
    migrationState.value = { version: i };
  }
};
