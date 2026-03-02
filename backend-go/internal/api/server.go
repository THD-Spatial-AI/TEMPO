package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"calliope-backend/internal/calliope"
	"calliope-backend/internal/models"
	"calliope-backend/internal/overpass"
	"calliope-backend/internal/storage"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Server struct {
	db          *storage.DB
	osm         *overpass.Client
	calliopeAPI *calliope.Client
	router      *gin.Engine
	port        string
}

func NewServer(db *storage.DB, port string) *Server {
	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()

	// Enable CORS for Electron
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Increase max body size to 64 MB to accommodate large model payloads
	router.MaxMultipartMemory = 64 << 20

	server := &Server{
		db:          db,
		osm:         overpass.NewClient(), // queries Overpass API + Nominatim directly
		calliopeAPI: calliope.NewClient("http://localhost:5000"),
		router:      router,
		port:        port,
	}

	server.setupRoutes()
	return server
}

func (s *Server) setupRoutes() {
	api := s.router.Group("/api")
	{
		// Model management
		api.POST("/models", s.saveModel)
		api.GET("/models", s.listModels)
		api.GET("/models/:id", s.getModel)
		api.PUT("/models/:id", s.updateModel)
		api.DELETE("/models/:id", s.deleteModel)

		// Job management
		api.POST("/models/:id/run", s.runModel)
		api.GET("/jobs/:id", s.getJobStatus)
		api.GET("/jobs/:id/results", s.getJobResults)

		// OSM / Overpass integration
		api.GET("/osm/:layer", s.getOSMLayer)
		api.GET("/osm/layers", s.getAvailableLayers)
		api.GET("/osm/regions", s.getLoadedRegions)
		api.GET("/geocode", s.geocode)

		// Health check
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok"})
		})
	}
}

func (s *Server) Start() error {
	return s.router.Run(":" + s.port)
}

// readJSONBody reads the raw request body and unmarshals it into a map.
// Using io.ReadAll avoids issues with Gin's ShouldBindJSON on large or
// non-standard payloads while still accepting any valid JSON object.
func readJSONBody(c *gin.Context) (map[string]interface{}, error) {
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 64<<20))
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return result, nil
}

// saveModel saves a full frontend model as JSON
func (s *Server) saveModel(c *gin.Context) {
	rawModel, err := readJSONBody(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	name, _ := rawModel["name"].(string)
	if name == "" {
		name = "Unnamed Model"
	}

	modelJSON, err := json.Marshal(rawModel)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	id, err := s.db.SaveFullModel(name, string(modelJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": fmt.Sprintf("%d", id), "name": name})
}

// listModels returns all saved models with parsed config
func (s *Server) listModels(c *gin.Context) {
	modelsList, err := s.db.ListModels()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]map[string]interface{}, 0, len(modelsList))
	for _, m := range modelsList {
		var modelData map[string]interface{}
		if err := json.Unmarshal([]byte(m.Config), &modelData); err != nil {
			// Return minimal info if config can't be parsed
			result = append(result, map[string]interface{}{
				"id":        fmt.Sprintf("%d", m.ID),
				"name":      m.Name,
				"createdAt": m.CreatedAt,
				"updatedAt": m.UpdatedAt,
			})
			continue
		}
		modelData["id"] = fmt.Sprintf("%d", m.ID)
		modelData["createdAt"] = m.CreatedAt
		modelData["updatedAt"] = m.UpdatedAt
		result = append(result, modelData)
	}

	c.JSON(http.StatusOK, result)
}

// getModel retrieves a specific model with parsed config
func (s *Server) getModel(c *gin.Context) {
	id := c.Param("id")
	var modelID int64
	fmt.Sscanf(id, "%d", &modelID)

	m, err := s.db.GetModel(modelID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Model not found"})
		return
	}

	var modelData map[string]interface{}
	if err := json.Unmarshal([]byte(m.Config), &modelData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid model config"})
		return
	}
	modelData["id"] = fmt.Sprintf("%d", m.ID)
	modelData["createdAt"] = m.CreatedAt
	modelData["updatedAt"] = m.UpdatedAt

	c.JSON(http.StatusOK, modelData)
}

// updateModel updates an existing model
func (s *Server) updateModel(c *gin.Context) {
	var modelID int64
	fmt.Sscanf(c.Param("id"), "%d", &modelID)

	rawModel, err := readJSONBody(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	name, _ := rawModel["name"].(string)
	if name == "" {
		name = "Unnamed Model"
	}

	modelJSON, err := json.Marshal(rawModel)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := s.db.UpdateModel(modelID, name, string(modelJSON)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"id": fmt.Sprintf("%d", modelID), "name": name})
}

// deleteModel removes a model by ID
func (s *Server) deleteModel(c *gin.Context) {
	var modelID int64
	fmt.Sscanf(c.Param("id"), "%d", &modelID)

	if err := s.db.DeleteModel(modelID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Model deleted"})
}

// runModel executes optimization via Calliope webservice
func (s *Server) runModel(c *gin.Context) {
	var modelID int64
	fmt.Sscanf(c.Param("id"), "%d", &modelID)

	// Get model config
	savedModel, err := s.db.GetModel(modelID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Model not found"})
		return
	}

	var config models.ModelConfig
	if err := json.Unmarshal([]byte(savedModel.Config), &config); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid model config"})
		return
	}

	// Create job record
	job := &models.Job{
		ID:        uuid.New().String(),
		ModelID:   modelID,
		Status:    "pending",
		Progress:  0,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := s.db.CreateJob(job); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create job"})
		return
	}

	// Submit to Calliope webservice asynchronously
	go func() {
		// Update status to running
		job.Status = "running"
		job.Progress = 10
		s.db.UpdateJob(job)

		// Send to Calliope API
		calliopeJobID, err := s.calliopeAPI.RunModel(&config)
		if err != nil {
			job.Status = "failed"
			job.Error = err.Error()
			s.db.UpdateJob(job)
			return
		}

		// Poll for results
		for {
			time.Sleep(5 * time.Second)

			status, err := s.calliopeAPI.GetJobStatus(calliopeJobID)
			if err != nil {
				job.Status = "failed"
				job.Error = err.Error()
				s.db.UpdateJob(job)
				return
			}

			job.Progress = status.Progress
			job.Status = status.Status
			s.db.UpdateJob(job)

			if status.Status == "completed" {
				// Fetch results
				results, err := s.calliopeAPI.GetResults(calliopeJobID)
				if err != nil {
					job.Status = "failed"
					job.Error = err.Error()
					s.db.UpdateJob(job)
					return
				}

				resultsJSON, _ := json.Marshal(results)
				job.Result = string(resultsJSON)
				s.db.UpdateJob(job)
				return
			} else if status.Status == "failed" {
				job.Error = status.Error
				s.db.UpdateJob(job)
				return
			}
		}
	}()

	c.JSON(http.StatusAccepted, gin.H{"job_id": job.ID})
}

// getJobStatus returns current job status
func (s *Server) getJobStatus(c *gin.Context) {
	jobID := c.Param("id")

	job, err := s.db.GetJob(jobID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	c.JSON(http.StatusOK, job)
}

// getJobResults returns job results
func (s *Server) getJobResults(c *gin.Context) {
	jobID := c.Param("id")

	job, err := s.db.GetJob(jobID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	if job.Status != "completed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Job not completed yet"})
		return
	}

	var results map[string]interface{}
	json.Unmarshal([]byte(job.Result), &results)

	c.JSON(http.StatusOK, results)
}

// getOSMLayer fetches OSM infrastructure data via the Overpass API and
// returns GeoJSON.  No GeoServer or PostGIS setup is required.
//
// Query parameters:
//   bbox  (required) minLon,minLat,maxLon,maxLat
//
// Examples:
//   /api/osm/osm_substations?bbox=-74,-36,-69,-17
//   /api/osm/osm_power_lines?bbox=8,47,10,49
func (s *Server) getOSMLayer(c *gin.Context) {
	layer := c.Param("layer")
	bboxStr := c.Query("bbox")

	var bbox *overpass.BBox
	if bboxStr != "" {
		var minLon, minLat, maxLon, maxLat float64
		_, err := fmt.Sscanf(bboxStr, "%f,%f,%f,%f", &minLon, &minLat, &maxLon, &maxLat)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bbox format, use: minLon,minLat,maxLon,maxLat"})
			return
		}
		bbox = &overpass.BBox{
			MinLon: minLon,
			MinLat: minLat,
			MaxLon: maxLon,
			MaxLat: maxLat,
		}
	}

	data, err := s.osm.GetOSMLayer(layer, bbox)
	if err != nil {
		c.Data(http.StatusOK, "application/json", []byte(`{"type":"FeatureCollection","features":[]}`))
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

// getLoadedRegions returns an empty list — region selection is now driven
// by the static regions_database.json bundled with the frontend.
// The Overpass API fetches live data for any region the user selects.
func (s *Server) getLoadedRegions(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"regions": []string{}})
}

// getAvailableLayers returns the available OSM layer names.
func (s *Server) getAvailableLayers(c *gin.Context) {
	layers, _ := s.osm.GetAvailableLayers()
	c.JSON(http.StatusOK, gin.H{"layers": layers})
}

// geocode proxies a Nominatim geocoding request for the given query string.
//
// Query parameters:
//   q  (required) free-text search, e.g. "Germany" or "Santiago, Chile"
//
// Returns the raw Nominatim JSON array.
func (s *Server) geocode(c *gin.Context) {
	q := c.Query("q")
	if q == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "q parameter required"})
		return
	}
	data, err := s.osm.Geocode(q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}
