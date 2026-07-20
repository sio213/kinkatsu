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
import m0009 from './0009_add_exercise_guide_fields.sql';
import m0010 from './0010_recording_feature_m1.sql';
import m0011 from './0011_amused_night_nurse.sql';
import m0012 from './0012_silky_purple_man.sql';
import m0013 from './0013_nth_weekdays_multi_select.sql';
import m0014 from './0014_routines.sql';
import m0015 from './0015_scheduled_workouts.sql';
import m0016 from './0016_reminder_schedule_skips.sql';
import m0017 from './0017_workout_sessions_routine_id.sql';
import m0018 from './0018_scheduled_workout_exercises.sql';
import m0019 from './0019_scheduled_workout_sets.sql';

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
m0008,
m0009,
m0010,
m0011,
m0012,
m0013,
m0014,
m0015,
m0016,
m0017,
m0018,
m0019
    }
  }
