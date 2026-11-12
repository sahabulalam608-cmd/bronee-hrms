import type { SessionUser } from '@bronee/shared';
import type { DB } from './db/client.js';
import type { Env } from './env.js';

/**
 * The typed Hono environment shared by every router in the Worker.
 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    db: DB;
    env: Env;
    session: SessionUser;
    permissions: string[];
  };
};
