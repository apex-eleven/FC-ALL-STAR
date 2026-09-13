import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Lets the admin panel write game data into the repo while `npm run dev` is running.
 *
 * The game has no server, so everything it saves normally lives in localStorage —
 * per-browser, per-profile, and gone the moment the project moves to another machine.
 * Card catalogues and admin tuning are real work; losing them to a new laptop is not
 * acceptable. Written into `public/`, they travel with the repo like source does.
 *
 * Dev only, and deliberately so. `configureServer` never runs in a build, so a
 * deployed site has no endpoint that can write to disk. There the panel falls back to
 * download-a-file and pick-a-file.
 *
 * **Accounts are not writable here.** They carry password hashes, and `public/` is
 * served to anyone who loads the site. Account backups go through the manual export
 * file, which the operator puts wherever they choose.
 */
export const STORE_ENDPOINT = '/__store';

/** The only paths this endpoint will write, by name. Anything else is refused. */
const TARGETS: Record<string, string[]> = {
  catalogue: ['public', 'players', 'catalogue.json'],
  config: ['public', 'config', 'admin.json'],
};

/** Guards against a runaway write filling the disk. Banner images make configs fat. */
const MAX_BODY_BYTES = 12_000_000;

export default function repoStorePlugin(): Plugin {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  return {
    name: 'fc-allstar-repo-store',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use(STORE_ENDPOINT, (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405;
          response.end('POST only');
          return;
        }

        // connect strips the mount path, so what is left is "/catalogue" or "/config".
        const name = (request.url ?? '').replace(/^\/+/, '').split('?')[0] ?? '';
        const target = TARGETS[name];
        if (!target) {
          response.statusCode = 404;
          response.end('unknown target');
          return;
        }

        let body = '';
        let aborted = false;

        request.on('data', (chunk: Buffer) => {
          if (aborted) return;
          body += chunk.toString('utf8');
          if (body.length > MAX_BODY_BYTES) {
            aborted = true;
            response.statusCode = 413;
            response.end('too large');
            request.destroy();
          }
        });

        request.on('end', () => {
          if (aborted) return;

          void (async () => {
            try {
              // Parsed before writing, so a malformed body cannot replace good data
              // with something the app will refuse to read back.
              const parsed: unknown = JSON.parse(body);
              const file = join(root, ...target);

              await mkdir(dirname(file), { recursive: true });
              await writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

              response.setHeader('content-type', 'application/json');
              response.end(JSON.stringify({ ok: true, name }));
            } catch (error) {
              response.statusCode = 400;
              response.end(String(error instanceof Error ? error.message : error));
            }
          })();
        });
      });
    },
  };
}
