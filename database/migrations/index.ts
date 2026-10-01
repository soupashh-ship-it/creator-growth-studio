import type { Migration } from '../migrate'
import { migration0001 } from './0001_core'
import { migration0002 } from './0002_fts'
import { migration0003 } from './0003_competitors'
import { migration0004 } from './0004_analytics'

/** All migrations, ascending by version. Add new ones here. */
export const migrations: readonly Migration[] = [
  migration0001,
  migration0002,
  migration0003,
  migration0004,
]
