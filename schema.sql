CREATE TABLE IF NOT EXISTS "beatmapsets" (
	"id"	INTEGER,
	"status"	TEXT,
	"title"	TEXT,
	"artist"	TEXT,
	"time_ranked"	INTEGER NOT NULL,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "beatmaps" (
	"id"	INTEGER,
	"mapset_id"	INTEGER,
	"status"	TEXT NOT NULL,
	"name"	TEXT,
	"mode"	TEXT NOT NULL,
	"stars"	REAL NOT NULL,
	"is_convert"	INTEGER NOT NULL,
	PRIMARY KEY("id","mapset_id")
);
CREATE TABLE IF NOT EXISTS "user_completions" (
		"user_id" INTEGER,
		"mapset_id" INTEGER,
		"map_id" INTEGER,
		"mode" TEXT NOT NULL,
		"status" TEXT NOT NULL,
		"is_convert" INTEGER NOT NULL,
		PRIMARY KEY ("user_id", "mapset_id", "map_id")
	);
CREATE TABLE IF NOT EXISTS "users" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL,
	"avatar_url"	TEXT,
	"banner_url"	INTEGER,
	"mode"	TEXT NOT NULL,
	"last_score_update"	INTEGER DEFAULT 0,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "user_update_tasks" (
	"user_id"	INTEGER NOT NULL UNIQUE,
	"time_queued"	INTEGER DEFAULT 0,
	"last_mapset_id"	TEXT DEFAULT 0,
	"count_new_completions"	INTEGER DEFAULT 0,
	"percent_complete"	REAL DEFAULT 0
);
