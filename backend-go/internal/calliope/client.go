package calliope

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"

	"calliope-backend/internal/models"
	"gopkg.in/yaml.v3"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Minute, // Models can take time
		},
	}
}

// RunModel sends a model to the Calliope webservice and returns job ID
func (c *Client) RunModel(config *models.ModelConfig) (string, error) {
	// Generate YAML files
	modelYAML, err := GenerateModelYAML(config)
	if err != nil {
		return "", fmt.Errorf("failed to generate model YAML: %w", err)
	}

	// Create multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Add model.yaml
	modelPart, err := writer.CreateFormFile("model", "model.yaml")
	if err != nil {
		return "", err
	}
	modelPart.Write(modelYAML)

	// Add run configuration
	runConfig := map[string]interface{}{
		"solver": config.Run.Solver,
		"solver_options": config.Run.SolverOptions,
	}
	runJSON, _ := json.Marshal(runConfig)
	writer.WriteField("config", string(runJSON))

	writer.Close()

	// Send request
	req, err := http.NewRequest("POST", c.baseURL+"/api/run", body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("calliope request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("calliope returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	// Parse response
	var result struct {
		JobID string `json:"job_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.JobID, nil
}

// GetJobStatus checks the status of a running job
func (c *Client) GetJobStatus(jobID string) (*models.Job, error) {
	resp, err := c.httpClient.Get(fmt.Sprintf("%s/api/jobs/%s", c.baseURL, jobID))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var job models.Job
	if err := json.NewDecoder(resp.Body).Decode(&job); err != nil {
		return nil, err
	}

	return &job, nil
}

// GetResults retrieves the results of a completed job
func (c *Client) GetResults(jobID string) (map[string]interface{}, error) {
	resp, err := c.httpClient.Get(fmt.Sprintf("%s/api/jobs/%s/results", c.baseURL, jobID))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var results map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, err
	}

	return results, nil
}

// GenerateModelYAML converts ModelConfig to Calliope YAML format
func GenerateModelYAML(config *models.ModelConfig) ([]byte, error) {
	calliopeModel := map[string]interface{}{
		"model": map[string]interface{}{
			"name": config.Name,
			"calliope_version": config.CalliopeVersion,
			"timeseries_data_path": nil,
		},
		"run": map[string]interface{}{
			"mode": config.Run.Mode,
			"solver": config.Run.Solver,
			"ensure_feasibility": config.Run.EnsureFeasibility,
			"cyclic_storage": config.Run.CyclicStorage,
			"objective_options": map[string]interface{}{
				"cost_class": config.Run.ObjectiveCostClass,
			},
		},
	}

	// Add solver options if present
	if len(config.Run.SolverOptions) > 0 {
		calliopeModel["run"].(map[string]interface{})["solver_options"] = config.Run.SolverOptions
	}

	// Add locations
	locations := make(map[string]interface{})
	for _, loc := range config.Locations {
		locData := map[string]interface{}{
			"coordinates": map[string]float64{
				"lat": loc.Latitude,
				"lon": loc.Longitude,
			},
			"techs": make(map[string]interface{}),
		}

		// Add technologies for this location
		for _, techName := range loc.Technologies {
			locData["techs"].(map[string]interface{})[techName] = map[string]interface{}{}
		}

		locations[loc.Name] = locData
	}
	calliopeModel["locations"] = locations

	// Add links
	links := make(map[string]interface{})
	for _, link := range config.Links {
		linkName := fmt.Sprintf("%s,%s", link.Source, link.Target)
		links[linkName] = map[string]interface{}{
			"techs": map[string]interface{}{
				link.Technology: map[string]interface{}{
					"distance": link.Distance,
				},
			},
		}
	}
	if len(links) > 0 {
		calliopeModel["links"] = links
	}

	// Add technologies
	techs := make(map[string]interface{})
	for _, tech := range config.Technologies {
		techData := map[string]interface{}{
			"essentials": map[string]interface{}{
				"name": tech.Name,
				"carrier": tech.Carrier,
				"parent": tech.Type,
			},
			"constraints": tech.Constraints,
		}

		if len(tech.CarrierIn) > 0 {
			techData["essentials"].(map[string]interface{})["carrier_in"] = tech.CarrierIn
		}
		if len(tech.CarrierOut) > 0 {
			techData["essentials"].(map[string]interface{})["carrier_out"] = tech.CarrierOut
		}

		techs[tech.Name] = techData
	}
	calliopeModel["techs"] = techs

	// Convert to YAML
	return yaml.Marshal(calliopeModel)
}
