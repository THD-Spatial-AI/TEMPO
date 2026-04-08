package models

import "time"

// Location represents a node in the energy system
type Location struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Latitude    float64                `json:"latitude"`
	Longitude   float64                `json:"longitude"`
	Technologies []string              `json:"technologies"`
	Constraints map[string]interface{} `json:"constraints,omitempty"`
}

// Link represents a transmission connection between locations
type Link struct {
	ID          string                 `json:"id"`
	Source      string                 `json:"source"`
	Target      string                 `json:"target"`
	Distance    float64                `json:"distance"`
	Technology  string                 `json:"technology"`
	Constraints map[string]interface{} `json:"constraints,omitempty"`
}

// Technology represents an energy technology definition
type Technology struct {
	Name        string                 `json:"name"`
	Type        string                 `json:"type"` // supply, demand, conversion, storage, transmission
	Carrier     string                 `json:"carrier"`
	CarrierIn   []string               `json:"carrier_in,omitempty"`
	CarrierOut  []string               `json:"carrier_out,omitempty"`
	Constraints map[string]interface{} `json:"constraints"`
}

// ModelConfig represents the Calliope model configuration
type ModelConfig struct {
	Name              string            `json:"name"`
	CalliopeVersion   string            `json:"calliope_version"`
	Timeseries        TimeseriesConfig  `json:"timeseries"`
	Run               RunConfig         `json:"run"`
	Locations         []Location        `json:"locations"`
	Links             []Link            `json:"links"`
	Technologies      []Technology      `json:"technologies"`
}

type TimeseriesConfig struct {
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
}

type RunConfig struct {
	Mode               string                 `json:"mode"`
	Solver             string                 `json:"solver"`
	EnsureFeasibility  bool                   `json:"ensure_feasibility"`
	CyclicStorage      bool                   `json:"cyclic_storage"`
	ObjectiveCostClass string                 `json:"objective_cost_class"`
	SolverOptions      map[string]interface{} `json:"solver_options,omitempty"`
}

// SavedModel represents a stored model in the database
type SavedModel struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Config    string    `json:"config"` // JSON serialized ModelConfig
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Job represents an optimization job
type Job struct {
	ID        string    `json:"id"`
	ModelID   int64     `json:"model_id"`
	Status    string    `json:"status"` // pending, running, completed, failed
	Progress  int       `json:"progress"`
	Result    string    `json:"result,omitempty"` // JSON results
	Error     string    `json:"error,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// CompletedRun is a persisted record of a finished optimisation run.
type CompletedRun struct {
	ID                   string                 `json:"id"`
	ModelName            string                 `json:"modelName"`
	Framework            string                 `json:"framework"`
	Solver               string                 `json:"solver"`
	Status               string                 `json:"status"` // completed | failed
	Objective            *float64               `json:"objective,omitempty"`
	TerminationCondition string                 `json:"terminationCondition"`
	Duration             string                 `json:"duration"`
	CompletedAt          string                 `json:"completedAt"`
	Result               map[string]interface{} `json:"result,omitempty"`
	Logs                 []string               `json:"logs,omitempty"`
}

// GeoServerLayer represents OSM data from GeoServer
type GeoServerLayer struct {
	Type     string `json:"type"`
	Features []struct {
		Type       string                 `json:"type"`
		Geometry   map[string]interface{} `json:"geometry"`
		Properties map[string]interface{} `json:"properties"`
	} `json:"features"`
}
