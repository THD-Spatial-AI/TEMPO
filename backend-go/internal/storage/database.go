package storage

import (
	"database/sql"
	"encoding/json"
	"time"

	"calliope-backend/internal/models"
	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
}

func InitDB(path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}

	// Limit to one open connection so concurrent writes are serialised
	// instead of getting "database is locked" errors.
	conn.SetMaxOpenConns(1)

	// Enable WAL journal mode for better concurrent read performance and
	// set a 10 s busy timeout so transient lock conflicts retry automatically.
	pragmas := []string{
		"PRAGMA journal_mode=WAL;",
		"PRAGMA busy_timeout=10000;",
		"PRAGMA synchronous=NORMAL;",
	}
	for _, p := range pragmas {
		if _, err := conn.Exec(p); err != nil {
			return nil, err
		}
	}

	// Create tables
	schema := `
	CREATE TABLE IF NOT EXISTS models (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		config TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS jobs (
		id TEXT PRIMARY KEY,
		model_id INTEGER NOT NULL,
		status TEXT NOT NULL,
		progress INTEGER DEFAULT 0,
		result TEXT,
		error TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (model_id) REFERENCES models(id)
	);

	CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
	CREATE INDEX IF NOT EXISTS idx_jobs_model_id ON jobs(model_id);

	CREATE TABLE IF NOT EXISTS completed_runs (
		id TEXT PRIMARY KEY,
		model_name TEXT NOT NULL,
		framework TEXT NOT NULL DEFAULT 'calliope',
		solver TEXT NOT NULL DEFAULT '',
		status TEXT NOT NULL DEFAULT 'completed',
		objective REAL,
		termination_condition TEXT,
		duration TEXT,
		completed_at TIMESTAMP,
		result_json TEXT,
		logs_json TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_completed_runs_completed_at ON completed_runs(completed_at DESC);
	`

	if _, err := conn.Exec(schema); err != nil {
		return nil, err
	}

	return &DB{conn: conn}, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

// SaveModel saves a model configuration
func (db *DB) SaveModel(config *models.ModelConfig) (int64, error) {
	configJSON, err := json.Marshal(config)
	if err != nil {
		return 0, err
	}

	result, err := db.conn.Exec(
		"INSERT INTO models (name, config, created_at, updated_at) VALUES (?, ?, ?, ?)",
		config.Name, string(configJSON), time.Now(), time.Now(),
	)
	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

// GetModel retrieves a model by ID
func (db *DB) GetModel(id int64) (*models.SavedModel, error) {
	var model models.SavedModel
	err := db.conn.QueryRow(
		"SELECT id, name, config, created_at, updated_at FROM models WHERE id = ?", id,
	).Scan(&model.ID, &model.Name, &model.Config, &model.CreatedAt, &model.UpdatedAt)
	
	if err != nil {
		return nil, err
	}
	return &model, nil
}

// ListModels returns all saved models
func (db *DB) ListModels() ([]*models.SavedModel, error) {
	rows, err := db.conn.Query(
		"SELECT id, name, config, created_at, updated_at FROM models ORDER BY updated_at DESC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var modelsList []*models.SavedModel
	for rows.Next() {
		var model models.SavedModel
		if err := rows.Scan(&model.ID, &model.Name, &model.Config, &model.CreatedAt, &model.UpdatedAt); err != nil {
			return nil, err
		}
		modelsList = append(modelsList, &model)
	}

	return modelsList, nil
}

// CreateJob creates a new optimization job
func (db *DB) CreateJob(job *models.Job) error {
	_, err := db.conn.Exec(
		"INSERT INTO jobs (id, model_id, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		job.ID, job.ModelID, job.Status, job.Progress, time.Now(), time.Now(),
	)
	return err
}

// UpdateJob updates job status and progress
func (db *DB) UpdateJob(job *models.Job) error {
	_, err := db.conn.Exec(
		"UPDATE jobs SET status = ?, progress = ?, result = ?, error = ?, updated_at = ? WHERE id = ?",
		job.Status, job.Progress, job.Result, job.Error, time.Now(), job.ID,
	)
	return err
}

// SaveFullModel saves a complete frontend model JSON (name extracted separately)
func (db *DB) SaveFullModel(name string, modelJSON string) (int64, error) {
	result, err := db.conn.Exec(
		"INSERT INTO models (name, config, created_at, updated_at) VALUES (?, ?, ?, ?)",
		name, modelJSON, time.Now(), time.Now(),
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// UpdateModel updates a stored model's name and full JSON config
func (db *DB) UpdateModel(id int64, name string, modelJSON string) error {
	_, err := db.conn.Exec(
		"UPDATE models SET name = ?, config = ?, updated_at = ? WHERE id = ?",
		name, modelJSON, time.Now(), id,
	)
	return err
}

// DeleteModel removes a model by ID
func (db *DB) DeleteModel(id int64) error {
	_, err := db.conn.Exec("DELETE FROM models WHERE id = ?", id)
	return err
}

// GetJob retrieves a job by ID
func (db *DB) GetJob(id string) (*models.Job, error) {
	var job models.Job
	err := db.conn.QueryRow(
		"SELECT id, model_id, status, progress, result, error, created_at, updated_at FROM jobs WHERE id = ?", id,
	).Scan(&job.ID, &job.ModelID, &job.Status, &job.Progress, &job.Result, &job.Error, &job.CreatedAt, &job.UpdatedAt)

	if err != nil {
		return nil, err
	}
	return &job, nil
}

// ─── Completed Runs ────────────────────────────────────────────────────────

// SaveCompletedRun persists a finished optimisation run.
func (db *DB) SaveCompletedRun(run *models.CompletedRun) error {
	resultJSON, _ := json.Marshal(run.Result)
	logsJSON, _ := json.Marshal(run.Logs)
	_, err := db.conn.Exec(
		`INSERT INTO completed_runs
			(id, model_name, framework, solver, status, objective, termination_condition,
			 duration, completed_at, result_json, logs_json, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
			model_name=excluded.model_name, framework=excluded.framework,
			solver=excluded.solver, status=excluded.status, objective=excluded.objective,
			termination_condition=excluded.termination_condition, duration=excluded.duration,
			completed_at=excluded.completed_at, result_json=excluded.result_json,
			logs_json=excluded.logs_json`,
		run.ID, run.ModelName, run.Framework, run.Solver, run.Status,
		run.Objective, run.TerminationCondition, run.Duration,
		run.CompletedAt, string(resultJSON), string(logsJSON), time.Now(),
	)
	return err
}

// ListCompletedRuns returns all completed runs ordered newest first.
func (db *DB) ListCompletedRuns() ([]*models.CompletedRun, error) {
	rows, err := db.conn.Query(
		`SELECT id, model_name, framework, solver, status, objective, termination_condition,
		        duration, completed_at, result_json, logs_json
		 FROM completed_runs ORDER BY completed_at DESC LIMIT 100`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []*models.CompletedRun
	for rows.Next() {
		var r models.CompletedRun
		var objective sql.NullFloat64
		var resultJSON, logsJSON string
		if err := rows.Scan(
			&r.ID, &r.ModelName, &r.Framework, &r.Solver, &r.Status,
			&objective, &r.TerminationCondition, &r.Duration,
			&r.CompletedAt, &resultJSON, &logsJSON,
		); err != nil {
			continue
		}
		if objective.Valid {
			r.Objective = &objective.Float64
		}
		_ = json.Unmarshal([]byte(resultJSON), &r.Result)
		_ = json.Unmarshal([]byte(logsJSON), &r.Logs)
		runs = append(runs, &r)
	}
	return runs, rows.Err()
}

// DeleteCompletedRun removes a single completed run by ID.
func (db *DB) DeleteCompletedRun(id string) error {
	_, err := db.conn.Exec("DELETE FROM completed_runs WHERE id = ?", id)
	return err
}
