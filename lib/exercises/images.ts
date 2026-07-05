import type { Exercise } from '@/db/schema';
import { isPresetExercise } from './constants';

type ExerciseImages = { source?: number; thumbnail: number };

const IMAGES: Record<string, { source: number; thumbnail: number }> = {
  dumbbell_curl: {
    source: require('@/assets/exercise-media/dumbbell_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/dumbbell_curl_thumb.png'),
  },
  bench_press: {
    source: require('@/assets/exercise-media/bench_press.mp4'),
    thumbnail: require('@/assets/exercise-media/bench_press_thumb.png'),
  },
  incline_bench_press: {
    source: require('@/assets/exercise-media/incline_bench_press.mp4'),
    thumbnail: require('@/assets/exercise-media/incline_bench_press_thumb.png'),
  },
  plank: {
    source: require('@/assets/exercise-media/plank.mp4'),
    thumbnail: require('@/assets/exercise-media/plank_thumb.png'),
  },
  decline_bench_press: {
    source: require('@/assets/exercise-media/decline_bench_press.mp4'),
    thumbnail: require('@/assets/exercise-media/decline_bench_press_thumb.png'),
  },
  dumbbell_fly: {
    source: require('@/assets/exercise-media/dumbbell_fly.mp4'),
    thumbnail: require('@/assets/exercise-media/dumbbell_fly_thumb.png'),
  },
  incline_dumbbell_fly: {
    source: require('@/assets/exercise-media/incline_dumbbell_fly.mp4'),
    thumbnail: require('@/assets/exercise-media/incline_dumbbell_fly_thumb.png'),
  },
  cable_crossover: {
    source: require('@/assets/exercise-media/cable_crossover.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_crossover_thumb.png'),
  },
  chest_press_machine: {
    source: require('@/assets/exercise-media/chest_press_machine.mp4'),
    thumbnail: require('@/assets/exercise-media/chest_press_machine_thumb.png'),
  },
  push_up: {
    source: require('@/assets/exercise-media/push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/push_up_thumb.png'),
  },
  barbell_shoulder_press: {
    source: require('@/assets/exercise-media/barbell_shoulder_press.mp4'),
    thumbnail: require('@/assets/exercise-media/barbell_shoulder_press_thumb.png'),
  },
  dumbbell_shoulder_press: {
    source: require('@/assets/exercise-media/dumbbell_shoulder_press.mp4'),
    thumbnail: require('@/assets/exercise-media/dumbbell_shoulder_press_thumb.png'),
  },
  side_raise: {
    source: require('@/assets/exercise-media/side_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/side_raise_thumb.png'),
  },
  front_raise: {
    source: require('@/assets/exercise-media/front_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/front_raise_thumb.png'),
  },
  rear_delt_fly: {
    source: require('@/assets/exercise-media/rear_delt_fly.mp4'),
    thumbnail: require('@/assets/exercise-media/rear_delt_fly_thumb.png'),
  },
  face_pull: {
    source: require('@/assets/exercise-media/face_pull.mp4'),
    thumbnail: require('@/assets/exercise-media/face_pull_thumb.png'),
  },
  arnold_press: {
    source: require('@/assets/exercise-media/arnold_press.mp4'),
    thumbnail: require('@/assets/exercise-media/arnold_press_thumb.png'),
  },
  barbell_curl: {
    source: require('@/assets/exercise-media/barbell_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/barbell_curl_thumb.png'),
  },
  hammer_curl: {
    source: require('@/assets/exercise-media/hammer_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/hammer_curl_thumb.png'),
  },
  preacher_curl: {
    source: require('@/assets/exercise-media/preacher_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/preacher_curl_thumb.png'),
  },
  triceps_pushdown: {
    source: require('@/assets/exercise-media/triceps_pushdown.mp4'),
    thumbnail: require('@/assets/exercise-media/triceps_pushdown_thumb.png'),
  },
  triceps_extension: {
    source: require('@/assets/exercise-media/triceps_extension.mp4'),
    thumbnail: require('@/assets/exercise-media/triceps_extension_thumb.png'),
  },
  french_press: {
    source: require('@/assets/exercise-media/french_press.mp4'),
    thumbnail: require('@/assets/exercise-media/french_press_thumb.png'),
  },
  dips: {
    source: require('@/assets/exercise-media/dips.mp4'),
    thumbnail: require('@/assets/exercise-media/dips_thumb.png'),
  },
  weighted_dips: {
    source: require('@/assets/exercise-media/weighted_dips.mp4'),
    thumbnail: require('@/assets/exercise-media/weighted_dips_thumb.png'),
  },
  side_plank: {
    source: require('@/assets/exercise-media/side_plank.mp4'),
    thumbnail: require('@/assets/exercise-media/side_plank_thumb.png'),
  },
  crunch: {
    source: require('@/assets/exercise-media/crunch.mp4'),
    thumbnail: require('@/assets/exercise-media/crunch_thumb.png'),
  },
  leg_raise: {
    source: require('@/assets/exercise-media/leg_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/leg_raise_thumb.png'),
  },
  russian_twist: {
    source: require('@/assets/exercise-media/russian_twist.mp4'),
    thumbnail: require('@/assets/exercise-media/russian_twist_thumb.png'),
  },
  ab_wheel_rollout: {
    source: require('@/assets/exercise-media/ab_wheel_rollout.mp4'),
    thumbnail: require('@/assets/exercise-media/ab_wheel_rollout_thumb.png'),
  },
  bicycle_crunch: {
    source: require('@/assets/exercise-media/bicycle_crunch.mp4'),
    thumbnail: require('@/assets/exercise-media/bicycle_crunch_thumb.png'),
  },
  deadlift: {
    source: require('@/assets/exercise-media/deadlift.mp4'),
    thumbnail: require('@/assets/exercise-media/deadlift_thumb.png'),
  },
  lat_pulldown: {
    source: require('@/assets/exercise-media/lat_pulldown.mp4'),
    thumbnail: require('@/assets/exercise-media/lat_pulldown_thumb.png'),
  },
  seated_cable_row: {
    source: require('@/assets/exercise-media/seated_cable_row.mp4'),
    thumbnail: require('@/assets/exercise-media/seated_cable_row_thumb.png'),
  },
  barbell_row: {
    source: require('@/assets/exercise-media/barbell_row.mp4'),
    thumbnail: require('@/assets/exercise-media/barbell_row_thumb.png'),
  },
  dumbbell_one_arm_row: {
    source: require('@/assets/exercise-media/dumbbell_one_arm_row.mp4'),
    thumbnail: require('@/assets/exercise-media/dumbbell_one_arm_row_thumb.png'),
  },
  chin_up: {
    source: require('@/assets/exercise-media/chin_up.mp4'),
    thumbnail: require('@/assets/exercise-media/chin_up_thumb.png'),
  },
  weighted_chin_up: {
    source: require('@/assets/exercise-media/weighted_chin_up.mp4'),
    thumbnail: require('@/assets/exercise-media/weighted_chin_up_thumb.png'),
  },
  pull_up: {
    source: require('@/assets/exercise-media/pull_up.mp4'),
    thumbnail: require('@/assets/exercise-media/pull_up_thumb.png'),
  },
  weighted_pull_up: {
    source: require('@/assets/exercise-media/weighted_pull_up.mp4'),
    thumbnail: require('@/assets/exercise-media/weighted_pull_up_thumb.png'),
  },
  high_row: {
    source: require('@/assets/exercise-media/high_row.mp4'),
    thumbnail: require('@/assets/exercise-media/high_row_thumb.png'),
  },
  back_extension: {
    source: require('@/assets/exercise-media/back_extension.mp4'),
    thumbnail: require('@/assets/exercise-media/back_extension_thumb.png'),
  },
  running: {
    source: require('@/assets/exercise-media/running.mp4'),
    thumbnail: require('@/assets/exercise-media/running_thumb.png'),
  },
  walking: {
    source: require('@/assets/exercise-media/walking.mp4'),
    thumbnail: require('@/assets/exercise-media/walking_thumb.png'),
  },
  cycling: {
    source: require('@/assets/exercise-media/cycling.mp4'),
    thumbnail: require('@/assets/exercise-media/cycling_thumb.png'),
  },
  rowing_ergometer: {
    source: require('@/assets/exercise-media/rowing_ergometer.mp4'),
    thumbnail: require('@/assets/exercise-media/rowing_ergometer_thumb.png'),
  },
  jump_rope: {
    source: require('@/assets/exercise-media/jump_rope.mp4'),
    thumbnail: require('@/assets/exercise-media/jump_rope_thumb.png'),
  },
  burpee: {
    source: require('@/assets/exercise-media/burpee.mp4'),
    thumbnail: require('@/assets/exercise-media/burpee_thumb.png'),
  },
  squat: {
    source: require('@/assets/exercise-media/squat.mp4'),
    thumbnail: require('@/assets/exercise-media/squat_thumb.png'),
  },
  front_squat: {
    source: require('@/assets/exercise-media/front_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/front_squat_thumb.png'),
  },
  leg_press: {
    source: require('@/assets/exercise-media/leg_press.mp4'),
    thumbnail: require('@/assets/exercise-media/leg_press_thumb.png'),
  },
  romanian_deadlift: {
    source: require('@/assets/exercise-media/romanian_deadlift.mp4'),
    thumbnail: require('@/assets/exercise-media/romanian_deadlift_thumb.png'),
  },
  lunge: {
    source: require('@/assets/exercise-media/lunge.mp4'),
    thumbnail: require('@/assets/exercise-media/lunge_thumb.png'),
  },
  bulgarian_split_squat: {
    source: require('@/assets/exercise-media/bulgarian_split_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/bulgarian_split_squat_thumb.png'),
  },
  leg_curl: {
    source: require('@/assets/exercise-media/leg_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/leg_curl_thumb.png'),
  },
  leg_extension: {
    source: require('@/assets/exercise-media/leg_extension.mp4'),
    thumbnail: require('@/assets/exercise-media/leg_extension_thumb.png'),
  },
  calf_raise: {
    source: require('@/assets/exercise-media/calf_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/calf_raise_thumb.png'),
  },
  hip_thrust: {
    source: require('@/assets/exercise-media/hip_thrust.mp4'),
    thumbnail: require('@/assets/exercise-media/hip_thrust_thumb.png'),
  },
  goblet_squat: {
    source: require('@/assets/exercise-media/goblet_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/goblet_squat_thumb.png'),
  },
  smith_bench_press: {
    source: require('@/assets/exercise-media/smith_bench_press.mp4'),
    thumbnail: require('@/assets/exercise-media/smith_bench_press_thumb.png'),
  },
  close_grip_bench_press: {
    source: require('@/assets/exercise-media/close_grip_bench_press.mp4'),
    thumbnail: require('@/assets/exercise-media/close_grip_bench_press_thumb.png'),
  },
  reverse_grip_bench_press: {
    source: require('@/assets/exercise-media/reverse_grip_bench_press.mp4'),
    thumbnail: require('@/assets/exercise-media/reverse_grip_bench_press_thumb.png'),
  },
  dumbbell_bench_press: {
    source: require('@/assets/exercise-media/dumbbell_bench_press.mp4'),
    thumbnail: require('@/assets/exercise-media/dumbbell_bench_press_thumb.png'),
  },
  incline_dumbbell_press: {
    source: require('@/assets/exercise-media/incline_dumbbell_press.mp4'),
    thumbnail: require('@/assets/exercise-media/incline_dumbbell_press_thumb.png'),
  },
  decline_dumbbell_press: {
    source: require('@/assets/exercise-media/decline_dumbbell_press.mp4'),
    thumbnail: require('@/assets/exercise-media/decline_dumbbell_press_thumb.png'),
  },
  decline_dumbbell_fly: {
    source: require('@/assets/exercise-media/decline_dumbbell_fly.mp4'),
    thumbnail: require('@/assets/exercise-media/decline_dumbbell_fly_thumb.png'),
  },
  pec_deck: {
    source: require('@/assets/exercise-media/pec_deck.mp4'),
    thumbnail: require('@/assets/exercise-media/pec_deck_thumb.png'),
  },
  low_cable_fly: {
    source: require('@/assets/exercise-media/low_cable_fly.mp4'),
    thumbnail: require('@/assets/exercise-media/low_cable_fly_thumb.png'),
  },
  high_cable_fly: {
    source: require('@/assets/exercise-media/high_cable_fly.mp4'),
    thumbnail: require('@/assets/exercise-media/high_cable_fly_thumb.png'),
  },
  svend_press: {
    source: require('@/assets/exercise-media/svend_press.mp4'),
    thumbnail: require('@/assets/exercise-media/svend_press_thumb.png'),
  },
  floor_press: {
    source: require('@/assets/exercise-media/floor_press.mp4'),
    thumbnail: require('@/assets/exercise-media/floor_press_thumb.png'),
  },
  resistance_band_chest_press: {
    source: require('@/assets/exercise-media/resistance_band_chest_press.mp4'),
    thumbnail: require('@/assets/exercise-media/resistance_band_chest_press_thumb.png'),
  },
  incline_push_up: {
    source: require('@/assets/exercise-media/incline_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/incline_push_up_thumb.png'),
  },
  decline_push_up: {
    source: require('@/assets/exercise-media/decline_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/decline_push_up_thumb.png'),
  },
  diamond_push_up: {
    source: require('@/assets/exercise-media/diamond_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/diamond_push_up_thumb.png'),
  },
  wide_push_up: {
    source: require('@/assets/exercise-media/wide_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/wide_push_up_thumb.png'),
  },
  kneeling_push_up: {
    source: require('@/assets/exercise-media/kneeling_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/kneeling_push_up_thumb.png'),
  },
  weighted_push_up: {
    source: require('@/assets/exercise-media/weighted_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/weighted_push_up_thumb.png'),
  },
  single_arm_dumbbell_press: {
    source: require('@/assets/exercise-media/single_arm_dumbbell_press.mp4'),
    thumbnail: require('@/assets/exercise-media/single_arm_dumbbell_press_thumb.png'),
  },
  guillotine_press: {
    source: require('@/assets/exercise-media/guillotine_press.mp4'),
    thumbnail: require('@/assets/exercise-media/guillotine_press_thumb.png'),
  },
  floor_fly: {
    source: require('@/assets/exercise-media/floor_fly.mp4'),
    thumbnail: require('@/assets/exercise-media/floor_fly_thumb.png'),
  },
  incline_smith_press: {
    source: require('@/assets/exercise-media/incline_smith_press.mp4'),
    thumbnail: require('@/assets/exercise-media/incline_smith_press_thumb.png'),
  },
  decline_smith_press: {
    source: require('@/assets/exercise-media/decline_smith_press.mp4'),
    thumbnail: require('@/assets/exercise-media/decline_smith_press_thumb.png'),
  },
  single_arm_cable_fly: {
    source: require('@/assets/exercise-media/single_arm_cable_fly.mp4'),
    thumbnail: require('@/assets/exercise-media/single_arm_cable_fly_thumb.png'),
  },
  decline_cable_fly: {
    source: require('@/assets/exercise-media/decline_cable_fly.mp4'),
    thumbnail: require('@/assets/exercise-media/decline_cable_fly_thumb.png'),
  },
  incline_cable_fly: {
    source: require('@/assets/exercise-media/incline_cable_fly.mp4'),
    thumbnail: require('@/assets/exercise-media/incline_cable_fly_thumb.png'),
  },
  dumbbell_pullover: {
    source: require('@/assets/exercise-media/dumbbell_pullover.mp4'),
    thumbnail: require('@/assets/exercise-media/dumbbell_pullover_thumb.png'),
  },
  spoto_press: {
    source: require('@/assets/exercise-media/spoto_press.mp4'),
    thumbnail: require('@/assets/exercise-media/spoto_press_thumb.png'),
  },
  board_press: {
    source: require('@/assets/exercise-media/board_press.mp4'),
    thumbnail: require('@/assets/exercise-media/board_press_thumb.png'),
  },
  one_arm_push_up: {
    source: require('@/assets/exercise-media/one_arm_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/one_arm_push_up_thumb.png'),
  },
  clap_push_up: {
    source: require('@/assets/exercise-media/clap_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/clap_push_up_thumb.png'),
  },
  hindu_push_up: {
    source: require('@/assets/exercise-media/hindu_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/hindu_push_up_thumb.png'),
  },
  archer_push_up: {
    source: require('@/assets/exercise-media/archer_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/archer_push_up_thumb.png'),
  },
  machine_incline_press: {
    source: require('@/assets/exercise-media/machine_incline_press.mp4'),
    thumbnail: require('@/assets/exercise-media/machine_incline_press_thumb.png'),
  },
  seated_barbell_shoulder_press: {
    source: require('@/assets/exercise-media/seated_barbell_shoulder_press.mp4'),
    thumbnail: require('@/assets/exercise-media/seated_barbell_shoulder_press_thumb.png'),
  },
  single_arm_dumbbell_shoulder_press: {
    source: require('@/assets/exercise-media/single_arm_dumbbell_shoulder_press.mp4'),
    thumbnail: require('@/assets/exercise-media/single_arm_dumbbell_shoulder_press_thumb.png'),
  },
  plate_front_raise: {
    source: require('@/assets/exercise-media/plate_front_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/plate_front_raise_thumb.png'),
  },
  lu_raise: {
    source: require('@/assets/exercise-media/lu_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/lu_raise_thumb.png'),
  },
  y_raise: {
    source: require('@/assets/exercise-media/y_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/y_raise_thumb.png'),
  },
  cuban_press: {
    source: require('@/assets/exercise-media/cuban_press.mp4'),
    thumbnail: require('@/assets/exercise-media/cuban_press_thumb.png'),
  },
  scott_press: {
    source: require('@/assets/exercise-media/scott_press.mp4'),
    thumbnail: require('@/assets/exercise-media/scott_press_thumb.png'),
  },
  landmine_lateral_raise: {
    source: require('@/assets/exercise-media/landmine_lateral_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/landmine_lateral_raise_thumb.png'),
  },
  band_pull_apart: {
    source: require('@/assets/exercise-media/band_pull_apart.mp4'),
    thumbnail: require('@/assets/exercise-media/band_pull_apart_thumb.png'),
  },
  landmine_press: {
    source: require('@/assets/exercise-media/landmine_press.mp4'),
    thumbnail: require('@/assets/exercise-media/landmine_press_thumb.png'),
  },
  upright_row: {
    source: require('@/assets/exercise-media/upright_row.mp4'),
    thumbnail: require('@/assets/exercise-media/upright_row_thumb.png'),
  },
  cable_upright_row: {
    source: require('@/assets/exercise-media/cable_upright_row.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_upright_row_thumb.png'),
  },
  shrug: {
    source: require('@/assets/exercise-media/shrug.mp4'),
    thumbnail: require('@/assets/exercise-media/shrug_thumb.png'),
  },
  dumbbell_shrug: {
    source: require('@/assets/exercise-media/dumbbell_shrug.mp4'),
    thumbnail: require('@/assets/exercise-media/dumbbell_shrug_thumb.png'),
  },
  behind_neck_press: {
    source: require('@/assets/exercise-media/behind_neck_press.mp4'),
    thumbnail: require('@/assets/exercise-media/behind_neck_press_thumb.png'),
  },
  reverse_pec_deck: {
    source: require('@/assets/exercise-media/reverse_pec_deck.mp4'),
    thumbnail: require('@/assets/exercise-media/reverse_pec_deck_thumb.png'),
  },
  cable_rear_delt_fly: {
    source: require('@/assets/exercise-media/cable_rear_delt_fly.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_rear_delt_fly_thumb.png'),
  },
  kettlebell_shoulder_press: {
    source: require('@/assets/exercise-media/kettlebell_shoulder_press.mp4'),
    thumbnail: require('@/assets/exercise-media/kettlebell_shoulder_press_thumb.png'),
  },
  push_press: {
    source: require('@/assets/exercise-media/push_press.mp4'),
    thumbnail: require('@/assets/exercise-media/push_press_thumb.png'),
  },
  pike_push_up: {
    source: require('@/assets/exercise-media/pike_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/pike_push_up_thumb.png'),
  },
  handstand_push_up: {
    source: require('@/assets/exercise-media/handstand_push_up.mp4'),
    thumbnail: require('@/assets/exercise-media/handstand_push_up_thumb.png'),
  },
  machine_shoulder_press: {
    source: require('@/assets/exercise-media/machine_shoulder_press.mp4'),
    thumbnail: require('@/assets/exercise-media/machine_shoulder_press_thumb.png'),
  },
  cable_lateral_raise: {
    source: require('@/assets/exercise-media/cable_lateral_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_lateral_raise_thumb.png'),
  },
  cable_front_raise: {
    source: require('@/assets/exercise-media/cable_front_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_front_raise_thumb.png'),
  },
  trap_bar_shrug: {
    source: require('@/assets/exercise-media/trap_bar_shrug.mp4'),
    thumbnail: require('@/assets/exercise-media/trap_bar_shrug_thumb.png'),
  },
  ez_bar_curl: {
    source: require('@/assets/exercise-media/ez_bar_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/ez_bar_curl_thumb.png'),
  },
  cable_curl: {
    source: require('@/assets/exercise-media/cable_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_curl_thumb.png'),
  },
  concentration_curl: {
    source: require('@/assets/exercise-media/concentration_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/concentration_curl_thumb.png'),
  },
  incline_dumbbell_curl: {
    source: require('@/assets/exercise-media/incline_dumbbell_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/incline_dumbbell_curl_thumb.png'),
  },
  spider_curl: {
    source: require('@/assets/exercise-media/spider_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/spider_curl_thumb.png'),
  },
  zottman_curl: {
    source: require('@/assets/exercise-media/zottman_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/zottman_curl_thumb.png'),
  },
  drag_curl: {
    source: require('@/assets/exercise-media/drag_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/drag_curl_thumb.png'),
  },
  reverse_curl: {
    source: require('@/assets/exercise-media/reverse_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/reverse_curl_thumb.png'),
  },
  cable_hammer_curl: {
    source: require('@/assets/exercise-media/cable_hammer_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_hammer_curl_thumb.png'),
  },
  overhead_cable_extension: {
    source: require('@/assets/exercise-media/overhead_cable_extension.mp4'),
    thumbnail: require('@/assets/exercise-media/overhead_cable_extension_thumb.png'),
  },
  bench_dip: {
    source: require('@/assets/exercise-media/bench_dip.mp4'),
    thumbnail: require('@/assets/exercise-media/bench_dip_thumb.png'),
  },
  weighted_bench_dip: {
    source: require('@/assets/exercise-media/weighted_bench_dip.mp4'),
    thumbnail: require('@/assets/exercise-media/weighted_bench_dip_thumb.png'),
  },
  wrist_curl: {
    source: require('@/assets/exercise-media/wrist_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/wrist_curl_thumb.png'),
  },
  reverse_wrist_curl: {
    source: require('@/assets/exercise-media/reverse_wrist_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/reverse_wrist_curl_thumb.png'),
  },
  farmers_walk: {
    source: require('@/assets/exercise-media/farmers_walk.mp4'),
    thumbnail: require('@/assets/exercise-media/farmers_walk_thumb.png'),
  },
  preacher_hammer_curl: {
    source: require('@/assets/exercise-media/preacher_hammer_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/preacher_hammer_curl_thumb.png'),
  },
  machine_preacher_curl: {
    source: require('@/assets/exercise-media/machine_preacher_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/machine_preacher_curl_thumb.png'),
  },
  cable_rope_hammer_curl: {
    source: require('@/assets/exercise-media/cable_rope_hammer_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_rope_hammer_curl_thumb.png'),
  },
  curl_21s: {
    source: require('@/assets/exercise-media/curl_21s.mp4'),
    thumbnail: require('@/assets/exercise-media/curl_21s_thumb.png'),
  },
  waiter_curl: {
    source: require('@/assets/exercise-media/waiter_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/waiter_curl_thumb.png'),
  },
  cross_body_hammer_curl: {
    source: require('@/assets/exercise-media/cross_body_hammer_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/cross_body_hammer_curl_thumb.png'),
  },
  single_arm_dumbbell_curl: {
    source: require('@/assets/exercise-media/single_arm_dumbbell_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/single_arm_dumbbell_curl_thumb.png'),
  },
  band_curl: {
    source: require('@/assets/exercise-media/band_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/band_curl_thumb.png'),
  },
  single_arm_triceps_pushdown: {
    source: require('@/assets/exercise-media/single_arm_triceps_pushdown.mp4'),
    thumbnail: require('@/assets/exercise-media/single_arm_triceps_pushdown_thumb.png'),
  },
  rope_pushdown: {
    source: require('@/assets/exercise-media/rope_pushdown.mp4'),
    thumbnail: require('@/assets/exercise-media/rope_pushdown_thumb.png'),
  },
  v_bar_pushdown: {
    source: require('@/assets/exercise-media/v_bar_pushdown.mp4'),
    thumbnail: require('@/assets/exercise-media/v_bar_pushdown_thumb.png'),
  },
  lying_triceps_extension: {
    source: require('@/assets/exercise-media/lying_triceps_extension.mp4'),
    thumbnail: require('@/assets/exercise-media/lying_triceps_extension_thumb.png'),
  },
  one_arm_triceps_extension: {
    source: require('@/assets/exercise-media/one_arm_triceps_extension.mp4'),
    thumbnail: require('@/assets/exercise-media/one_arm_triceps_extension_thumb.png'),
  },
  band_triceps_extension: {
    source: require('@/assets/exercise-media/band_triceps_extension.mp4'),
    thumbnail: require('@/assets/exercise-media/band_triceps_extension_thumb.png'),
  },
  wrist_roller: {
    source: require('@/assets/exercise-media/wrist_roller.mp4'),
    thumbnail: require('@/assets/exercise-media/wrist_roller_thumb.png'),
  },
  plate_pinch_grip: {
    source: require('@/assets/exercise-media/plate_pinch_grip.mp4'),
    thumbnail: require('@/assets/exercise-media/plate_pinch_grip_thumb.png'),
  },
  triceps_kickback: {
    source: require('@/assets/exercise-media/triceps_kickback.mp4'),
    thumbnail: require('@/assets/exercise-media/triceps_kickback_thumb.png'),
  },
  mountain_climber: {
    source: require('@/assets/exercise-media/mountain_climber.mp4'),
    thumbnail: require('@/assets/exercise-media/mountain_climber_thumb.png'),
  },
  dead_bug: {
    source: require('@/assets/exercise-media/dead_bug.mp4'),
    thumbnail: require('@/assets/exercise-media/dead_bug_thumb.png'),
  },
  bird_dog: {
    source: require('@/assets/exercise-media/bird_dog.mp4'),
    thumbnail: require('@/assets/exercise-media/bird_dog_thumb.png'),
  },
  hollow_body_hold: {
    source: require('@/assets/exercise-media/hollow_body_hold.mp4'),
    thumbnail: require('@/assets/exercise-media/hollow_body_hold_thumb.png'),
  },
  superman: {
    source: require('@/assets/exercise-media/superman.mp4'),
    thumbnail: require('@/assets/exercise-media/superman_thumb.png'),
  },
  pallof_press: {
    source: require('@/assets/exercise-media/pallof_press.mp4'),
    thumbnail: require('@/assets/exercise-media/pallof_press_thumb.png'),
  },
  plank_shoulder_tap: {
    source: require('@/assets/exercise-media/plank_shoulder_tap.mp4'),
    thumbnail: require('@/assets/exercise-media/plank_shoulder_tap_thumb.png'),
  },
  side_plank_rotation: {
    source: require('@/assets/exercise-media/side_plank_rotation.mp4'),
    thumbnail: require('@/assets/exercise-media/side_plank_rotation_thumb.png'),
  },
  stir_the_pot: {
    source: require('@/assets/exercise-media/stir_the_pot.mp4'),
    thumbnail: require('@/assets/exercise-media/stir_the_pot_thumb.png'),
  },
  hollow_rock: {
    source: require('@/assets/exercise-media/hollow_rock.mp4'),
    thumbnail: require('@/assets/exercise-media/hollow_rock_thumb.png'),
  },
  l_sit: {
    source: require('@/assets/exercise-media/l_sit.mp4'),
    thumbnail: require('@/assets/exercise-media/l_sit_thumb.png'),
  },
  weighted_plank: {
    source: require('@/assets/exercise-media/weighted_plank.mp4'),
    thumbnail: require('@/assets/exercise-media/weighted_plank_thumb.png'),
  },
  reverse_plank: {
    source: require('@/assets/exercise-media/reverse_plank.mp4'),
    thumbnail: require('@/assets/exercise-media/reverse_plank_thumb.png'),
  },
  hanging_leg_raise: {
    source: require('@/assets/exercise-media/hanging_leg_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/hanging_leg_raise_thumb.png'),
  },
  captains_chair_raise: {
    source: require('@/assets/exercise-media/captains_chair_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/captains_chair_raise_thumb.png'),
  },
  v_up: {
    source: require('@/assets/exercise-media/v_up.mp4'),
    thumbnail: require('@/assets/exercise-media/v_up_thumb.png'),
  },
  toe_touch: {
    source: require('@/assets/exercise-media/toe_touch.mp4'),
    thumbnail: require('@/assets/exercise-media/toe_touch_thumb.png'),
  },
  flutter_kick: {
    source: require('@/assets/exercise-media/flutter_kick.mp4'),
    thumbnail: require('@/assets/exercise-media/flutter_kick_thumb.png'),
  },
  cable_crunch: {
    source: require('@/assets/exercise-media/cable_crunch.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_crunch_thumb.png'),
  },
  reverse_crunch: {
    source: require('@/assets/exercise-media/reverse_crunch.mp4'),
    thumbnail: require('@/assets/exercise-media/reverse_crunch_thumb.png'),
  },
  sit_up: {
    source: require('@/assets/exercise-media/sit_up.mp4'),
    thumbnail: require('@/assets/exercise-media/sit_up_thumb.png'),
  },
  weighted_sit_up: {
    source: require('@/assets/exercise-media/weighted_sit_up.mp4'),
    thumbnail: require('@/assets/exercise-media/weighted_sit_up_thumb.png'),
  },
  side_bend: {
    source: require('@/assets/exercise-media/side_bend.mp4'),
    thumbnail: require('@/assets/exercise-media/side_bend_thumb.png'),
  },
  decline_sit_up: {
    source: require('@/assets/exercise-media/decline_sit_up.mp4'),
    thumbnail: require('@/assets/exercise-media/decline_sit_up_thumb.png'),
  },
  hanging_knee_raise: {
    source: require('@/assets/exercise-media/hanging_knee_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/hanging_knee_raise_thumb.png'),
  },
  cable_woodchopper: {
    source: require('@/assets/exercise-media/cable_woodchopper.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_woodchopper_thumb.png'),
  },
  dragon_flag: {
    source: require('@/assets/exercise-media/dragon_flag.mp4'),
    thumbnail: require('@/assets/exercise-media/dragon_flag_thumb.png'),
  },
  jackknife_situp: {
    source: require('@/assets/exercise-media/jackknife_situp.mp4'),
    thumbnail: require('@/assets/exercise-media/jackknife_situp_thumb.png'),
  },
  toes_to_bar: {
    source: require('@/assets/exercise-media/toes_to_bar.mp4'),
    thumbnail: require('@/assets/exercise-media/toes_to_bar_thumb.png'),
  },
  hanging_windshield_wiper: {
    source: require('@/assets/exercise-media/hanging_windshield_wiper.mp4'),
    thumbnail: require('@/assets/exercise-media/hanging_windshield_wiper_thumb.png'),
  },
  knee_to_elbow_plank: {
    source: require('@/assets/exercise-media/knee_to_elbow_plank.mp4'),
    thumbnail: require('@/assets/exercise-media/knee_to_elbow_plank_thumb.png'),
  },
  stability_ball_crunch: {
    source: require('@/assets/exercise-media/stability_ball_crunch.mp4'),
    thumbnail: require('@/assets/exercise-media/stability_ball_crunch_thumb.png'),
  },
  t_bar_row: {
    source: require('@/assets/exercise-media/t_bar_row.mp4'),
    thumbnail: require('@/assets/exercise-media/t_bar_row_thumb.png'),
  },
  pendlay_row: {
    source: require('@/assets/exercise-media/pendlay_row.mp4'),
    thumbnail: require('@/assets/exercise-media/pendlay_row_thumb.png'),
  },
  machine_row: {
    source: require('@/assets/exercise-media/machine_row.mp4'),
    thumbnail: require('@/assets/exercise-media/machine_row_thumb.png'),
  },
  cable_straight_arm_pulldown: {
    source: require('@/assets/exercise-media/cable_straight_arm_pulldown.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_straight_arm_pulldown_thumb.png'),
  },
  close_grip_lat_pulldown: {
    source: require('@/assets/exercise-media/close_grip_lat_pulldown.mp4'),
    thumbnail: require('@/assets/exercise-media/close_grip_lat_pulldown_thumb.png'),
  },
  reverse_grip_lat_pulldown: {
    source: require('@/assets/exercise-media/reverse_grip_lat_pulldown.mp4'),
    thumbnail: require('@/assets/exercise-media/reverse_grip_lat_pulldown_thumb.png'),
  },
  single_arm_lat_pulldown: {
    source: require('@/assets/exercise-media/single_arm_lat_pulldown.mp4'),
    thumbnail: require('@/assets/exercise-media/single_arm_lat_pulldown_thumb.png'),
  },
  rack_pull: {
    source: require('@/assets/exercise-media/rack_pull.mp4'),
    thumbnail: require('@/assets/exercise-media/rack_pull_thumb.png'),
  },
  sumo_deadlift: {
    source: require('@/assets/exercise-media/sumo_deadlift.mp4'),
    thumbnail: require('@/assets/exercise-media/sumo_deadlift_thumb.png'),
  },
  deficit_deadlift: {
    source: require('@/assets/exercise-media/deficit_deadlift.mp4'),
    thumbnail: require('@/assets/exercise-media/deficit_deadlift_thumb.png'),
  },
  good_morning: {
    source: require('@/assets/exercise-media/good_morning.mp4'),
    thumbnail: require('@/assets/exercise-media/good_morning_thumb.png'),
  },
  inverted_row: {
    source: require('@/assets/exercise-media/inverted_row.mp4'),
    thumbnail: require('@/assets/exercise-media/inverted_row_thumb.png'),
  },
  renegade_row: {
    source: require('@/assets/exercise-media/renegade_row.mp4'),
    thumbnail: require('@/assets/exercise-media/renegade_row_thumb.png'),
  },
  meadows_row: {
    source: require('@/assets/exercise-media/meadows_row.mp4'),
    thumbnail: require('@/assets/exercise-media/meadows_row_thumb.png'),
  },
  landmine_row: {
    source: require('@/assets/exercise-media/landmine_row.mp4'),
    thumbnail: require('@/assets/exercise-media/landmine_row_thumb.png'),
  },
  kroc_row: {
    source: require('@/assets/exercise-media/kroc_row.mp4'),
    thumbnail: require('@/assets/exercise-media/kroc_row_thumb.png'),
  },
  chest_supported_row: {
    source: require('@/assets/exercise-media/chest_supported_row.mp4'),
    thumbnail: require('@/assets/exercise-media/chest_supported_row_thumb.png'),
  },
  seal_row: {
    source: require('@/assets/exercise-media/seal_row.mp4'),
    thumbnail: require('@/assets/exercise-media/seal_row_thumb.png'),
  },
  wide_grip_pull_up: {
    source: require('@/assets/exercise-media/wide_grip_pull_up.mp4'),
    thumbnail: require('@/assets/exercise-media/wide_grip_pull_up_thumb.png'),
  },
  close_grip_pull_up: {
    source: require('@/assets/exercise-media/close_grip_pull_up.mp4'),
    thumbnail: require('@/assets/exercise-media/close_grip_pull_up_thumb.png'),
  },
  neutral_grip_pull_up: {
    source: require('@/assets/exercise-media/neutral_grip_pull_up.mp4'),
    thumbnail: require('@/assets/exercise-media/neutral_grip_pull_up_thumb.png'),
  },
  assisted_pull_up: {
    source: require('@/assets/exercise-media/assisted_pull_up.mp4'),
    thumbnail: require('@/assets/exercise-media/assisted_pull_up_thumb.png'),
  },
  negative_pull_up: {
    source: require('@/assets/exercise-media/negative_pull_up.mp4'),
    thumbnail: require('@/assets/exercise-media/negative_pull_up_thumb.png'),
  },
  single_arm_cable_row: {
    source: require('@/assets/exercise-media/single_arm_cable_row.mp4'),
    thumbnail: require('@/assets/exercise-media/single_arm_cable_row_thumb.png'),
  },
  snatch_grip_deadlift: {
    source: require('@/assets/exercise-media/snatch_grip_deadlift.mp4'),
    thumbnail: require('@/assets/exercise-media/snatch_grip_deadlift_thumb.png'),
  },
  trap_bar_deadlift: {
    source: require('@/assets/exercise-media/trap_bar_deadlift.mp4'),
    thumbnail: require('@/assets/exercise-media/trap_bar_deadlift_thumb.png'),
  },
  stiff_leg_deadlift: {
    source: require('@/assets/exercise-media/stiff_leg_deadlift.mp4'),
    thumbnail: require('@/assets/exercise-media/stiff_leg_deadlift_thumb.png'),
  },
  banded_deadlift: {
    source: require('@/assets/exercise-media/banded_deadlift.mp4'),
    thumbnail: require('@/assets/exercise-media/banded_deadlift_thumb.png'),
  },
  muscle_up: {
    source: require('@/assets/exercise-media/muscle_up.mp4'),
    thumbnail: require('@/assets/exercise-media/muscle_up_thumb.png'),
  },
  band_lat_pulldown: {
    source: require('@/assets/exercise-media/band_lat_pulldown.mp4'),
    thumbnail: require('@/assets/exercise-media/band_lat_pulldown_thumb.png'),
  },
  elliptical: {
    source: require('@/assets/exercise-media/elliptical.mp4'),
    thumbnail: require('@/assets/exercise-media/elliptical_thumb.png'),
  },
  stair_climber: {
    source: require('@/assets/exercise-media/stair_climber.mp4'),
    thumbnail: require('@/assets/exercise-media/stair_climber_thumb.png'),
  },
  high_knees: {
    source: require('@/assets/exercise-media/high_knees.mp4'),
    thumbnail: require('@/assets/exercise-media/high_knees_thumb.png'),
  },
  battle_rope: {
    source: require('@/assets/exercise-media/battle_rope.mp4'),
    thumbnail: require('@/assets/exercise-media/battle_rope_thumb.png'),
  },
  box_jump: {
    source: require('@/assets/exercise-media/box_jump.mp4'),
    thumbnail: require('@/assets/exercise-media/box_jump_thumb.png'),
  },
  shuttle_run: {
    source: require('@/assets/exercise-media/shuttle_run.mp4'),
    thumbnail: require('@/assets/exercise-media/shuttle_run_thumb.png'),
  },
  swimming: {
    source: require('@/assets/exercise-media/swimming.mp4'),
    thumbnail: require('@/assets/exercise-media/swimming_thumb.png'),
  },
  hiit_circuit: {
    source: require('@/assets/exercise-media/hiit_circuit.mp4'),
    thumbnail: require('@/assets/exercise-media/hiit_circuit_thumb.png'),
  },
  assault_bike: {
    source: require('@/assets/exercise-media/assault_bike.mp4'),
    thumbnail: require('@/assets/exercise-media/assault_bike_thumb.png'),
  },
  kettlebell_swing: {
    source: require('@/assets/exercise-media/kettlebell_swing.mp4'),
    thumbnail: require('@/assets/exercise-media/kettlebell_swing_thumb.png'),
  },
  sled_push: {
    source: require('@/assets/exercise-media/sled_push.mp4'),
    thumbnail: require('@/assets/exercise-media/sled_push_thumb.png'),
  },
  sprint_intervals: {
    source: require('@/assets/exercise-media/sprint_intervals.mp4'),
    thumbnail: require('@/assets/exercise-media/sprint_intervals_thumb.png'),
  },
  agility_ladder: {
    source: require('@/assets/exercise-media/agility_ladder.mp4'),
    thumbnail: require('@/assets/exercise-media/agility_ladder_thumb.png'),
  },
  jumping_jack: {
    source: require('@/assets/exercise-media/jumping_jack.mp4'),
    thumbnail: require('@/assets/exercise-media/jumping_jack_thumb.png'),
  },
  skater_jump: {
    source: require('@/assets/exercise-media/skater_jump.mp4'),
    thumbnail: require('@/assets/exercise-media/skater_jump_thumb.png'),
  },
  broad_jump: {
    source: require('@/assets/exercise-media/broad_jump.mp4'),
    thumbnail: require('@/assets/exercise-media/broad_jump_thumb.png'),
  },
  tuck_jump: {
    source: require('@/assets/exercise-media/tuck_jump.mp4'),
    thumbnail: require('@/assets/exercise-media/tuck_jump_thumb.png'),
  },
  rope_climb: {
    source: require('@/assets/exercise-media/rope_climb.mp4'),
    thumbnail: require('@/assets/exercise-media/rope_climb_thumb.png'),
  },
  double_unders: {
    source: require('@/assets/exercise-media/double_unders.mp4'),
    thumbnail: require('@/assets/exercise-media/double_unders_thumb.png'),
  },
  hack_squat: {
    source: require('@/assets/exercise-media/hack_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/hack_squat_thumb.png'),
  },
  smith_squat: {
    source: require('@/assets/exercise-media/smith_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/smith_squat_thumb.png'),
  },
  box_squat: {
    source: require('@/assets/exercise-media/box_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/box_squat_thumb.png'),
  },
  sumo_squat: {
    source: require('@/assets/exercise-media/sumo_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/sumo_squat_thumb.png'),
  },
  pistol_squat: {
    source: require('@/assets/exercise-media/pistol_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/pistol_squat_thumb.png'),
  },
  step_up: {
    source: require('@/assets/exercise-media/step_up.mp4'),
    thumbnail: require('@/assets/exercise-media/step_up_thumb.png'),
  },
  walking_lunge: {
    source: require('@/assets/exercise-media/walking_lunge.mp4'),
    thumbnail: require('@/assets/exercise-media/walking_lunge_thumb.png'),
  },
  reverse_lunge: {
    source: require('@/assets/exercise-media/reverse_lunge.mp4'),
    thumbnail: require('@/assets/exercise-media/reverse_lunge_thumb.png'),
  },
  lateral_lunge: {
    source: require('@/assets/exercise-media/lateral_lunge.mp4'),
    thumbnail: require('@/assets/exercise-media/lateral_lunge_thumb.png'),
  },
  curtsy_lunge: {
    source: require('@/assets/exercise-media/curtsy_lunge.mp4'),
    thumbnail: require('@/assets/exercise-media/curtsy_lunge_thumb.png'),
  },
  seated_leg_curl: {
    source: require('@/assets/exercise-media/seated_leg_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/seated_leg_curl_thumb.png'),
  },
  seated_calf_raise: {
    source: require('@/assets/exercise-media/seated_calf_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/seated_calf_raise_thumb.png'),
  },
  donkey_calf_raise: {
    source: require('@/assets/exercise-media/donkey_calf_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/donkey_calf_raise_thumb.png'),
  },
  adductor_machine: {
    source: require('@/assets/exercise-media/adductor_machine.mp4'),
    thumbnail: require('@/assets/exercise-media/adductor_machine_thumb.png'),
  },
  abductor_machine: {
    source: require('@/assets/exercise-media/abductor_machine.mp4'),
    thumbnail: require('@/assets/exercise-media/abductor_machine_thumb.png'),
  },
  sissy_squat: {
    source: require('@/assets/exercise-media/sissy_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/sissy_squat_thumb.png'),
  },
  jump_squat: {
    source: require('@/assets/exercise-media/jump_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/jump_squat_thumb.png'),
  },
  wall_sit: {
    source: require('@/assets/exercise-media/wall_sit.mp4'),
    thumbnail: require('@/assets/exercise-media/wall_sit_thumb.png'),
  },
  single_leg_deadlift: {
    source: require('@/assets/exercise-media/single_leg_deadlift.mp4'),
    thumbnail: require('@/assets/exercise-media/single_leg_deadlift_thumb.png'),
  },
  zercher_squat: {
    source: require('@/assets/exercise-media/zercher_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/zercher_squat_thumb.png'),
  },
  pin_squat: {
    source: require('@/assets/exercise-media/pin_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/pin_squat_thumb.png'),
  },
  smith_lunge: {
    source: require('@/assets/exercise-media/smith_lunge.mp4'),
    thumbnail: require('@/assets/exercise-media/smith_lunge_thumb.png'),
  },
  dumbbell_lunge: {
    source: require('@/assets/exercise-media/dumbbell_lunge.mp4'),
    thumbnail: require('@/assets/exercise-media/dumbbell_lunge_thumb.png'),
  },
  barbell_lunge: {
    source: require('@/assets/exercise-media/barbell_lunge.mp4'),
    thumbnail: require('@/assets/exercise-media/barbell_lunge_thumb.png'),
  },
  overhead_squat: {
    source: require('@/assets/exercise-media/overhead_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/overhead_squat_thumb.png'),
  },
  cossack_squat: {
    source: require('@/assets/exercise-media/cossack_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/cossack_squat_thumb.png'),
  },
  belt_squat: {
    source: require('@/assets/exercise-media/belt_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/belt_squat_thumb.png'),
  },
  leg_press_calf_raise: {
    source: require('@/assets/exercise-media/leg_press_calf_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/leg_press_calf_raise_thumb.png'),
  },
  cable_hip_abduction: {
    source: require('@/assets/exercise-media/cable_hip_abduction.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_hip_abduction_thumb.png'),
  },
  cable_hip_adduction: {
    source: require('@/assets/exercise-media/cable_hip_adduction.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_hip_adduction_thumb.png'),
  },
  nordic_hamstring_curl: {
    source: require('@/assets/exercise-media/nordic_hamstring_curl.mp4'),
    thumbnail: require('@/assets/exercise-media/nordic_hamstring_curl_thumb.png'),
  },
  glute_ham_raise: {
    source: require('@/assets/exercise-media/glute_ham_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/glute_ham_raise_thumb.png'),
  },
  banded_squat: {
    source: require('@/assets/exercise-media/banded_squat.mp4'),
    thumbnail: require('@/assets/exercise-media/banded_squat_thumb.png'),
  },
  tibialis_raise: {
    source: require('@/assets/exercise-media/tibialis_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/tibialis_raise_thumb.png'),
  },
  walking_calf_raise: {
    source: require('@/assets/exercise-media/walking_calf_raise.mp4'),
    thumbnail: require('@/assets/exercise-media/walking_calf_raise_thumb.png'),
  },
  glute_bridge: {
    source: require('@/assets/exercise-media/glute_bridge.mp4'),
    thumbnail: require('@/assets/exercise-media/glute_bridge_thumb.png'),
  },
  cable_kickback: {
    source: require('@/assets/exercise-media/cable_kickback.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_kickback_thumb.png'),
  },
  donkey_kick: {
    source: require('@/assets/exercise-media/donkey_kick.mp4'),
    thumbnail: require('@/assets/exercise-media/donkey_kick_thumb.png'),
  },
  fire_hydrant: {
    source: require('@/assets/exercise-media/fire_hydrant.mp4'),
    thumbnail: require('@/assets/exercise-media/fire_hydrant_thumb.png'),
  },
  glute_kickback_machine: {
    source: require('@/assets/exercise-media/glute_kickback_machine.mp4'),
    thumbnail: require('@/assets/exercise-media/glute_kickback_machine_thumb.png'),
  },
  single_leg_hip_thrust: {
    source: require('@/assets/exercise-media/single_leg_hip_thrust.mp4'),
    thumbnail: require('@/assets/exercise-media/single_leg_hip_thrust_thumb.png'),
  },
  cable_pull_through: {
    source: require('@/assets/exercise-media/cable_pull_through.mp4'),
    thumbnail: require('@/assets/exercise-media/cable_pull_through_thumb.png'),
  },
  reverse_hyperextension: {
    source: require('@/assets/exercise-media/reverse_hyperextension.mp4'),
    thumbnail: require('@/assets/exercise-media/reverse_hyperextension_thumb.png'),
  },
  barbell_glute_bridge: {
    source: require('@/assets/exercise-media/barbell_glute_bridge.mp4'),
    thumbnail: require('@/assets/exercise-media/barbell_glute_bridge_thumb.png'),
  },
  banded_glute_bridge: {
    source: require('@/assets/exercise-media/banded_glute_bridge.mp4'),
    thumbnail: require('@/assets/exercise-media/banded_glute_bridge_thumb.png'),
  },
  clamshell: {
    source: require('@/assets/exercise-media/clamshell.mp4'),
    thumbnail: require('@/assets/exercise-media/clamshell_thumb.png'),
  },
  single_leg_glute_bridge: {
    source: require('@/assets/exercise-media/single_leg_glute_bridge.mp4'),
    thumbnail: require('@/assets/exercise-media/single_leg_glute_bridge_thumb.png'),
  },
  hip_thrust_machine: {
    source: require('@/assets/exercise-media/hip_thrust_machine.mp4'),
    thumbnail: require('@/assets/exercise-media/hip_thrust_machine_thumb.png'),
  },
  foam_rolling: {
    source: require('@/assets/exercise-media/foam_rolling.mp4'),
    thumbnail: require('@/assets/exercise-media/foam_rolling_thumb.png'),
  },
  hip_flexor_stretch: {
    source: require('@/assets/exercise-media/hip_flexor_stretch.mp4'),
    thumbnail: require('@/assets/exercise-media/hip_flexor_stretch_thumb.png'),
  },
  hamstring_stretch: {
    source: require('@/assets/exercise-media/hamstring_stretch.mp4'),
    thumbnail: require('@/assets/exercise-media/hamstring_stretch_thumb.png'),
  },
  shoulder_stretch: {
    source: require('@/assets/exercise-media/shoulder_stretch.mp4'),
    thumbnail: require('@/assets/exercise-media/shoulder_stretch_thumb.png'),
  },
  cat_cow_stretch: {
    source: require('@/assets/exercise-media/cat_cow_stretch.mp4'),
    thumbnail: require('@/assets/exercise-media/cat_cow_stretch_thumb.png'),
  },
  child_pose: {
    source: require('@/assets/exercise-media/child_pose.mp4'),
    thumbnail: require('@/assets/exercise-media/child_pose_thumb.png'),
  },
  world_greatest_stretch: {
    source: require('@/assets/exercise-media/world_greatest_stretch.mp4'),
    thumbnail: require('@/assets/exercise-media/world_greatest_stretch_thumb.png'),
  },
  turkish_get_up: {
    source: require('@/assets/exercise-media/turkish_get_up.mp4'),
    thumbnail: require('@/assets/exercise-media/turkish_get_up_thumb.png'),
  },
  medicine_ball_slam: {
    source: require('@/assets/exercise-media/medicine_ball_slam.mp4'),
    thumbnail: require('@/assets/exercise-media/medicine_ball_slam_thumb.png'),
  },
  tire_flip: {
    source: require('@/assets/exercise-media/tire_flip.mp4'),
    thumbnail: require('@/assets/exercise-media/tire_flip_thumb.png'),
  },
  bear_crawl: {
    source: require('@/assets/exercise-media/bear_crawl.mp4'),
    thumbnail: require('@/assets/exercise-media/bear_crawl_thumb.png'),
  },
  inchworm: {
    source: require('@/assets/exercise-media/inchworm.mp4'),
    thumbnail: require('@/assets/exercise-media/inchworm_thumb.png'),
  },
  quad_stretch: {
    source: require('@/assets/exercise-media/quad_stretch.mp4'),
    thumbnail: require('@/assets/exercise-media/quad_stretch_thumb.png'),
  },
  calf_stretch: {
    source: require('@/assets/exercise-media/calf_stretch.mp4'),
    thumbnail: require('@/assets/exercise-media/calf_stretch_thumb.png'),
  },
  chest_stretch: {
    source: require('@/assets/exercise-media/chest_stretch.mp4'),
    thumbnail: require('@/assets/exercise-media/chest_stretch_thumb.png'),
  },
  spinal_twist_stretch: {
    source: require('@/assets/exercise-media/spinal_twist_stretch.mp4'),
    thumbnail: require('@/assets/exercise-media/spinal_twist_stretch_thumb.png'),
  },
  pigeon_pose: {
    source: require('@/assets/exercise-media/pigeon_pose.mp4'),
    thumbnail: require('@/assets/exercise-media/pigeon_pose_thumb.png'),
  },
  downward_dog: {
    source: require('@/assets/exercise-media/downward_dog.mp4'),
    thumbnail: require('@/assets/exercise-media/downward_dog_thumb.png'),
  },
  yoga_sun_salutation: {
    source: require('@/assets/exercise-media/yoga_sun_salutation.mp4'),
    thumbnail: require('@/assets/exercise-media/yoga_sun_salutation_thumb.png'),
  },
  kettlebell_halo: {
    source: require('@/assets/exercise-media/kettlebell_halo.mp4'),
    thumbnail: require('@/assets/exercise-media/kettlebell_halo_thumb.png'),
  },
  landmine_twist: {
    source: require('@/assets/exercise-media/landmine_twist.mp4'),
    thumbnail: require('@/assets/exercise-media/landmine_twist_thumb.png'),
  },
  assisted_dip_machine: {
    source: require('@/assets/exercise-media/assisted_dip_machine.mp4'),
    thumbnail: require('@/assets/exercise-media/assisted_dip_machine_thumb.png'),
  },
  standing_cable_chest_press: {
    source: require('@/assets/exercise-media/standing_cable_chest_press.mp4'),
    thumbnail: require('@/assets/exercise-media/standing_cable_chest_press_thumb.png'),
  },
};

// 種目ごとのサムネイル素材がまだ揃っていないため、未用意の種目はこの画像を仮のサムネイルとして使う
const PLACEHOLDER_THUMBNAIL = require('@/assets/exercise-media/bench_press_thumb.png');

export function getExerciseImages(exercise: Exercise): ExerciseImages {
  const entry = isPresetExercise(exercise) && exercise.slug ? IMAGES[exercise.slug] : undefined;
  return {
    source: entry?.source,
    thumbnail: entry?.thumbnail ?? PLACEHOLDER_THUMBNAIL,
  };
}
