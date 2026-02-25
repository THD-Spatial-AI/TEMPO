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
