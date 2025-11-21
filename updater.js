const db = require('./db');
const osuApi = require('osu-api-v2-js');
const config = require('./config.json');

const log = (...args) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}]`, ...args);
};

// Function to fetch new beatmaps(ets)
const FETCH_ALL_MAPS = false;
const fetchNewMaps = async () => {
    try {
        // Initialize API
        const osu = await osuApi.API.createAsync(config.osu_client_id, config.osu_api_token);
        // Create data saving transaction function
        const insertMapset = db.prepare(`INSERT OR REPLACE INTO beatmapsets VALUES (?, ?, ?, ?, ?)`);
        const insertBeatmap = db.prepare(`INSERT OR REPLACE INTO beatmaps VALUES (?, ?, ?, ?, ?, ?, ?)`);
        const save = db.transaction((mapset) => {
            // Save mapset
            insertMapset.run(mapset.id, mapset.status, mapset.title, mapset.artist, mapset.ranked_date?.getTime() || mapset.submitted_date?.getTime());
            // Loop through maps and converts and save
            for (const map of [...mapset.beatmaps, ...(mapset.converts || [])]) {
                insertBeatmap.run(map.id, mapset.id, map.status, map.version, map.mode, map.difficulty_rating, map.convert ? 1 : 0);
            }
        });
        // Loop until no more maps are found
        let cursor;
        while (true) {
            // Fetch mapsets
            const data = await osu.searchBeatmapsets({
                cursor_string: cursor,
                sort: {
                    by: 'ranked',
                    in: 'desc'
                },
                hide_explicit_content: false
            });
            // Extract data
            cursor = data.cursor_string;
            const mapsets = data.beatmapsets;
            // Loop through mapsets
            let foundExistingMapset = false;
            let countNewlySaved = 0;
            for (const mapset of mapsets) {
                // Check if this mapset is already saved
                const existingMapset = db.prepare(`SELECT 1 FROM beatmapsets WHERE id = ? LIMIT 1`).get(mapset.id);
                // Break out of loop if saved and not force-fetching all maps
                // Otherwise skip this map and continue loop
                if (existingMapset && !FETCH_ALL_MAPS) {
                    foundExistingMapset = true;
                    break;
                } else if (existingMapset) {
                    continue;
                }
                // Fetch full mapset again to get converts
                const mapsetFull = await osu.getBeatmapset(mapset.id);
                // Save mapset and its maps
                save(mapsetFull);
                countNewlySaved++;
            }
            // Log counts
            if (countNewlySaved > 0) {
                const countSavedMapsets = db.prepare(`SELECT COUNT(*) AS count FROM beatmapsets`).get().count;
                const countSavedMaps = db.prepare(`SELECT COUNT(*) AS count FROM beatmaps`).get().count;
                log(`Now storing data for ${countSavedMapsets} beatmapsets and ${countSavedMaps} beatmaps`);
            }
            // We're done if no more mapsets, or we found an existing one above
            if (!cursor || mapsets.length === 0 || foundExistingMapset) {
                log('Beatmap database is up to date!');
                break;
            }
        }
    } catch (error) {
        log('Error while fetching beatmaps:', error);
    }
    // Wait an hour and then run again
    setTimeout(fetchNewMaps, 1000 * 60 * 60);
};

// Function to update user data
// Perform one update cycle for the user who has gone the longest without an update
// Then recurse
const updateUsers = async () => {
    try {
        const task = db.prepare(`SELECT * FROM user_update_tasks ORDER BY time_queued ASC LIMIT 1`).get();
        // If no running update tasks, wait and run again
        if (!task) {
            setTimeout(updateUsers, 1000);
            return;
        }
        // Initialize API
        const osu = await osuApi.API.createAsync(config.osu_client_id, config.osu_api_token);
        // Fetch user
        const user = await osu.getUser(task.user_id);
        // Update stored user data
        const existingUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
        if (existingUser) {
            db.prepare(
                `UPDATE users
                SET name = ?,
                    avatar_url = ?,
                    banner_url = ?,
                    mode = ?
                WHERE id = ?`
            ).run(user.username, user.avatar_url, user.cover.url, user.playmode, user.id);
            log(`Updated stored user data for ${user.username}`);
        } else {
            db.prepare(
                `INSERT OR REPLACE INTO users (id, name, avatar_url, banner_url, mode)
                VALUES (?, ?, ?, ?, ?)`
            ).run(user.id, user.username, user.avatar_url, user.cover.url, user.playmode);
            log(`Stored user data for ${user.username}`);
        }
        const userEntry = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
        // If it's been less than 24 hours since we last updated this user's scores...
        if ((Date.now() - userEntry.last_score_update) < 1000 * 60 * 60 * 24) {
            log(`Fetching recent scores for ${user.username}`);
            // Fetch all available recent scores for all game modes
            const updateTime = Date.now();
            let limit = 100;
            let offset = 0;
            let ruleset = 'osu';
            const scores = [];
            while (true) {
                // Fetch scores
                let fetchedScores = [];
                try {
                    fetchedScores = await osu.getUserScores(
                        user, 'recent', osuApi.Ruleset[ruleset],
                        { fails: false, lazer: true },
                        { limit, offset }
                    );
                } catch (error) {
                    fetchedScores = [];
                    if (error.status_code != 404) {
                        throw error;
                    }
                }
                let newCount = 0;
                // Loop through scores and only keep new ones
                for (const score of fetchedScores) {
                    const existingPass = db.prepare(`SELECT * FROM user_completions WHERE user_id = ? AND map_id = ? AND mode = ? LIMIT 1`).get(
                        user.id, score.beatmap.id, score.beatmap.mode
                    );
                    if (!existingPass) {
                        scores.push(score);
                        newCount++;
                    }
                }
                if (newCount > 0)
                    log(`Found ${newCount} new ${ruleset} map completions for ${user.username}`);
                // Update new score count
                db.prepare(`UPDATE user_update_tasks SET count_new_completions = count_new_completions + ? WHERE user_id = ?`).run(newCount, user.id);
                // Update ruleset when we reach the end of a set of scores
                if (fetchedScores.length == 0 || fetchedScores.length < limit) {
                    offset = 0;
                    if (ruleset == 'osu') ruleset = 'taiko';
                    else if (ruleset == 'taiko') ruleset = 'fruits';
                    else if (ruleset == 'fruits') ruleset = 'mania';
                    else break;
                } else {
                    offset += fetchedScores.length;
                }
            }
            // Write new scores to database
            const transaction = db.transaction((scores) => {
                for (const score of scores) {
                    db.prepare(`INSERT OR IGNORE INTO user_completions (user_id, mapset_id, map_id, mode, status, is_convert) VALUES (?, ?, ?, ?, ?, ?)`).run(
                        user.id, score.beatmapset.id, score.beatmap.id, score.beatmap.mode, score.beatmap.status, score.beatmap.convert ? 1 : 0
                    );
                }
                db.prepare(`UPDATE users SET last_score_update = ? WHERE id = ?`).run(updateTime, user.id);
                db.prepare(`DELETE FROM user_update_tasks WHERE user_id = ?`).run(user.id);
                log(`Completed recent score update for ${user.username}`);
            });
            transaction(scores);
        } else {
            const countMapsetsTotal = db.prepare(`SELECT COUNT(*) AS count FROM beatmapsets`).get().count;
            while (true) {
                const task = db.prepare(`SELECT * FROM user_update_tasks WHERE user_id = ?`).get(user.id);
                // Get batch of mapset IDs
                const mapsetIds = db.prepare(
                    `SELECT id FROM beatmapsets
                     WHERE id > ?
                     ORDER BY id ASC
                     LIMIT 50`
                ).all(task.last_mapset_id).map(row => row.id);
                if (mapsetIds.length === 0) {
                    // All done updating this user
                    db.prepare(`UPDATE users SET last_score_update = ? WHERE id = ?`).run(Date.now(), user.id);
                    db.prepare(`DELETE FROM user_update_tasks WHERE user_id = ?`).run(user.id);
                    log(`Completed full pass history update for ${user.username}`);
                    break;
                }
                // Calculate progress
                const countMapsetsRemaining = countMapsetsTotal - mapsetIds.length - db.prepare(
                    `SELECT COUNT(*) AS count FROM beatmapsets WHERE id <= ?`
                ).get(task.last_mapset_id).count;
                const percentage = ((countMapsetsTotal - countMapsetsRemaining) / countMapsetsTotal * 100);
                // Log
                log(`[${percentage.toFixed(2)}%] Fetching passed maps for ${user.username}...`);
                // Fetch passed maps for each mapset
                let maps = [];
                while (true) {
                    try {
                        maps = await osu.getUserPassedBeatmaps(
                            user.id, mapsetIds,
                            { converts: true, no_diff_reduction: false }
                        );
                        break;
                    } catch (error) {
                        if (error.status_code == 429) {
                            // Wait for rate limit to clear
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        } else {
                            throw error;
                        }
                    }
                }
                // Save new passes
                const transaction = db.transaction((maps) => {
                    let newCount = 0;
                    for (const map of maps) {
                        // Skip if we already have this pass saved
                        const existingPass = db.prepare(`SELECT 1 FROM user_completions WHERE user_id = ? AND map_id = ? AND mode = ? LIMIT 1`).get(
                            user.id, map.id, map.mode
                        );
                        if (existingPass) continue;
                        // Save the pass
                        db.prepare(`INSERT OR IGNORE INTO user_completions (user_id, mapset_id, map_id, mode, status, is_convert) VALUES (?, ?, ?, ?, ?, ?)`).run(
                            user.id, map.beatmapset_id, map.id, map.mode, map.status, map.convert ? 1 : 0
                        );
                        newCount++;
                    }
                    // Log
                    if (newCount > 0)
                        log(`[${percentage.toFixed(2)}%] Found ${newCount} new map completions for ${user.username}`);
                    // Update task info
                    db.prepare(`
                        UPDATE user_update_tasks
                        SET count_new_completions = count_new_completions + ?,
                            last_mapset_id = ?, percent_complete = ?
                        WHERE user_id = ?
                    `).run(newCount, mapsetIds.pop(), percentage, user.id);
                });
                transaction(maps);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
        // Get counts
        const completionCount = db.prepare(
            `SELECT COUNT(*) AS count
                    FROM user_completions
                    WHERE user_id = ?`
        ).get(user.id).count;
        log(`Now storing ${completionCount} map completions for ${user.username}`);
    } catch (error) {
        log('Error while updating user data:', error);
    }
    // Recurse
    setTimeout(updateUsers, 1000 * 2);
};

// Queue users for update if they haven't been updated recently
const queueUsers = () => {
    try {
        const minLastUpdate = Date.now() - (1000 * 60 * 60 * 16);
        const usersToQueue = db.prepare(
            `SELECT id, name FROM users
             WHERE last_score_update < ?
             AND id NOT IN (SELECT user_id FROM user_update_tasks)
             ORDER BY last_score_update ASC`
        ).all(minLastUpdate);
        const insertTask = db.prepare(
            `INSERT INTO user_update_tasks (user_id, time_queued)
             VALUES (?, 0)`
        );
        for (const user of usersToQueue) {
            insertTask.run(user.id);
            log(`Queued ${user.name} for update`);
        }
    } catch (error) {
        log('Error while queuing users for update:', error);
    }
    setTimeout(queueUsers, 1000 * 60);
};

// Start update processes
fetchNewMaps();
updateUsers();
queueUsers();