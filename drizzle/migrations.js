// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_rapid_diamondback.sql';
import m0001 from './0001_safe_screwball.sql';
import m0002 from './0002_oval_jean_grey.sql';
import m0003 from './0003_nth_weekday.sql';
import m0004 from './0004_unify_kinds.sql';
import m0005 from './0005_exercise_library.sql';
import m0006 from './0006_add_exercise_slug.sql';
import m0007 from './0007_exercise_category_slug.sql';
import m0008 from './0008_backfill_exercise_slug.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007,
m0008
    }
  }
