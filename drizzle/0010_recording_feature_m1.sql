CREATE TABLE `sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`set_number` integer NOT NULL,
	`weight` real,
	`reps` integer,
	`duration_seconds` integer,
	`distance_meters` real,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_sets_session` ON `sets` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_sets_exercise` ON `sets` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `workout_session_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`order_index` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_wse_session` ON `workout_session_exercises` (`session_id`);--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `exercises` ADD `measurement_type` text DEFAULT 'weight_reps' NOT NULL;
--> statement-breakpoint
UPDATE `exercises` SET `measurement_type` = 'reps' WHERE `slug` IN ('push_up', 'resistance_band_chest_press', 'incline_push_up', 'decline_push_up', 'diamond_push_up', 'wide_push_up', 'kneeling_push_up', 'one_arm_push_up', 'clap_push_up', 'hindu_push_up', 'archer_push_up', 'band_pull_apart', 'pike_push_up', 'handstand_push_up', 'dips', 'bench_dip', 'band_curl', 'band_triceps_extension', 'mountain_climber', 'dead_bug', 'bird_dog', 'superman', 'plank_shoulder_tap', 'side_plank_rotation', 'hollow_rock', 'crunch', 'leg_raise', 'russian_twist', 'ab_wheel_rollout', 'bicycle_crunch', 'hanging_leg_raise', 'captains_chair_raise', 'v_up', 'toe_touch', 'flutter_kick', 'reverse_crunch', 'decline_crunch', 'sit_up', 'side_bend', 'decline_sit_up', 'hanging_knee_raise', 'dragon_flag', 'jackknife_situp', 'toes_to_bar', 'hanging_windshield_wiper', 'knee_to_elbow_plank', 'stability_ball_crunch', 'chin_up', 'pull_up', 'back_extension', 'inverted_row', 'wide_grip_pull_up', 'close_grip_pull_up', 'neutral_grip_pull_up', 'negative_pull_up', 'banded_deadlift', 'muscle_up', 'band_lat_pulldown', 'burpee', 'box_jump', 'skater_jump', 'broad_jump', 'tuck_jump', 'rope_climb', 'double_unders', 'pistol_squat', 'sissy_squat', 'jump_squat', 'cossack_squat', 'nordic_hamstring_curl', 'glute_ham_raise', 'banded_squat', 'tibialis_raise', 'walking_calf_raise', 'banded_glute_bridge', 'cat_cow_stretch', 'world_greatest_stretch', 'medicine_ball_slam', 'tire_flip', 'inchworm', 'yoga_sun_salutation', 'kettlebell_halo');
--> statement-breakpoint
UPDATE `exercises` SET `measurement_type` = 'time' WHERE `slug` IN ('plank', 'side_plank', 'hollow_body_hold', 'stir_the_pot', 'l_sit', 'reverse_plank', 'jump_rope', 'stair_climber', 'high_knees', 'battle_rope', 'hiit_circuit', 'agility_ladder', 'jumping_jack', 'wall_sit', 'foam_rolling', 'hip_flexor_stretch', 'hamstring_stretch', 'shoulder_stretch', 'child_pose', 'bear_crawl', 'quad_stretch', 'calf_stretch', 'chest_stretch', 'spinal_twist_stretch', 'pigeon_pose', 'downward_dog');
--> statement-breakpoint
UPDATE `exercises` SET `measurement_type` = 'distance_time' WHERE `slug` IN ('running', 'walking', 'cycling', 'rowing_ergometer', 'elliptical', 'shuttle_run', 'swimming', 'assault_bike', 'sprint_intervals');
--> statement-breakpoint
UPDATE `exercises` SET `measurement_type` = 'weight_time' WHERE `slug` IN ('farmers_walk', 'wrist_roller', 'plate_pinch_grip', 'weighted_plank', 'sled_push');
