package api

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"calliope-backend/internal/calliope"
	"calliope-backend/internal/geoserver"
	"calliope-backend/internal/models"
	"calliope-backend/internal/overpass"
	"calliope-backend/internal/storage"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// geoComponentRe restricts OSM region/country/continent values to safe identifiers.
var geoComponentRe = regexp.MustCompile(`^[A-Za-z0-9\-_ ]{1,80}$`)

// allowedCORSOrigins is the strict set of origins permitted to call this API.
// Electron file:// renderer sends Origin: "null"; all others must be local Vite dev origins.
var allowedCORSOrigins = map[string]bool{
	"http://localhost:5173":  true,
	"http://localhost:5174":  true,
	"http://127.0.0.1:5173": true,
	"http://127.0.0.1:5174": true,
}

// maxModelBodyBytes caps incoming model payloads at 4 MB — far above any
// realistic Calliope YAML/JSON config while preventing DoS via huge bodies.
const maxModelBodyBytes = 4 << 20 // 4 MB

const geoServerURL = "http://localhost:8081/geoserver"
const techAPIURL = "http://localhost:8000"

type Server struct {
	db          *storage.DB
	geoServer   *geoserver.Client // primary: local curated PostGIS data
	osm         *overpass.Client  // fallback: live public OSM via Overpass API
	calliopeAPI *calliope.Client
	router      *gin.Engine
	port        string
}

func NewServer(db *storage.DB, port string) *Server {
	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()

	// Strict CORS: allow only the Electron renderer (null origin) and local Vite dev origins.
	router.Use(func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		switch {
		case origin == "" || origin == "null":
			// Electron file:// renderer — allow.
			c.Writer.Header().Set("Access-Control-Allow-Origin", "null")
		case allowedCORSOrigins[origin]:
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
		default:
			if c.Request.Method == http.MethodOptions {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
		}
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		c.Writer.Header().Set("Access-Control-Max-Age", "3600")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	server := &Server{
		db:          db,
		geoServer:   geoserver.NewClient(geoServerURL),
		osm:         overpass.NewClient(),
		calliopeAPI: calliope.NewClient("http://localhost:5000"),
		router:      router,
		port:        port,
	}

	// Probe GeoServer at startup so the log is informative.
	go func() {
		client := &http.Client{Timeout: 3 * time.Second}
		// Use WFS GetCapabilities instead of /web/ to avoid redirect loops
		probeURL := geoServerURL + "/wfs?service=WFS&version=2.0.0&request=GetCapabilities"
		log.Printf("[OSM] Probing GeoServer at %s", geoServerURL)
		resp, err := client.Get(probeURL)
		if err == nil {
			resp.Body.Close()
			log.Println("[OSM] GeoServer reachable at", geoServerURL, "– using local PostGIS data as primary source")
		} else {
			log.Printf("[OSM] GeoServer not reachable (err: %v) – OSM data will come from Overpass API (live public data)", err)
		}
	}()

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

		// Completed runs (persisted history)
		api.POST("/completed-runs", s.saveCompletedRun)
		api.GET("/completed-runs", s.listCompletedRuns)
		api.DELETE("/completed-runs/:id", s.deleteCompletedRun)

		// OSM / Overpass integration — static routes MUST come before :layer param
		api.GET("/osm/layers", s.getAvailableLayers)
		api.GET("/osm/regions", s.getLoadedRegions)
		api.GET("/osm/regions-db", s.getRegionsDatabase)
		api.POST("/osm/download", s.downloadOSMRegion)
		api.GET("/osm/:layer", s.getOSMLayer)
		api.GET("/geocode", s.geocode)

		// Health check
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok"})
		})
	}

	// Proxy /tech/* to the opentech-db Python API (port 8000, not reachable from browser)
	s.router.GET("/tech/health", s.proxyTechAPIHealth)
	s.router.Any("/tech/api/v1/*path", s.proxyTechAPI)
}

func (s *Server) Start() error {
	return s.router.Run(":" + s.port)
}

// readJSONBody reads the raw request body and unmarshals it into a map.
// Capped at maxModelBodyBytes (4 MB) to prevent DoS via oversized payloads.
func readJSONBody(c *gin.Context) (map[string]interface{}, error) {
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, maxModelBodyBytes))
	if err != nil {
		return nil, err
	}
	if len(body) == 0 {
		return nil, fmt.Errorf("empty body")
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
	modelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || modelID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid model id"})
		return
	}

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
	modelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || modelID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid model id"})
		return
	}

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
	modelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || modelID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid model id"})
		return
	}

	if err := s.db.DeleteModel(modelID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Model deleted"})
}

// runModel executes optimization via Calliope webservice
func (s *Server) runModel(c *gin.Context) {
	modelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || modelID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid model id"})
		return
	}

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

// isEmptyFC returns true if the GeoJSON bytes are an empty FeatureCollection.
func isEmptyFC(data []byte) bool {
	var fc struct {
		Features []json.RawMessage `json:"features"`
	}
	if err := json.Unmarshal(data, &fc); err != nil {
		return true
	}
	return len(fc.Features) == 0
}

func resolveTempoDataRoot() string {
	if d := os.Getenv("TEMPO_DATA_DIR"); d != "" {
		return d
	}
	// Dev fallback: repository public/data
	if cwd, err := os.Getwd(); err == nil {
		projectRoot := cwd
		if filepath.Base(cwd) == "backend-go" {
			projectRoot = filepath.Dir(cwd)
		}
		return filepath.Join(projectRoot, "public", "data")
	}
	return filepath.Join("public", "data")
}

func localLayerFilePath(layer, regionPath string) string {
	if strings.TrimSpace(regionPath) == "" {
		return ""
	}
	parts := strings.Split(strings.Trim(regionPath, "/"), "/")
	if len(parts) == 0 {
		return ""
	}
	leaf := strings.ToLower(parts[len(parts)-1])
	suffixMap := map[string]string{
		"osm_substations":  "substations",
		"osm_power_plants": "power_plants",
		"osm_power_lines":  "power_lines",
		"osm_communes":     "communes",
		"osm_districts":    "districts",
	}
	suffix, ok := suffixMap[layer]
	if !ok {
		return ""
	}
	base := resolveTempoDataRoot()
	file := fmt.Sprintf("%s_%s.geojson", leaf, suffix)
	all := append([]string{base, "osm_extracts"}, parts...)
	all = append(all, file)
	return filepath.Join(all...)
}

func listLocalExtractedRegions() []string {
	base := filepath.Join(resolveTempoDataRoot(), "osm_extracts")
	var regions []string
	_ = filepath.WalkDir(base, func(p string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		name := strings.ToLower(d.Name())
		if !strings.HasSuffix(name, "_substations.geojson") {
			return nil
		}
		rel, err := filepath.Rel(base, filepath.Dir(p))
		if err != nil || rel == "." {
			return nil
		}
		regions = append(regions, filepath.ToSlash(rel))
		return nil
	})
	if len(regions) == 0 {
		return regions
	}
	uniq := make(map[string]struct{}, len(regions))
	for _, r := range regions {
		uniq[r] = struct{}{}
	}
	out := make([]string, 0, len(uniq))
	for r := range uniq {
		out = append(out, r)
	}
	sort.Strings(out)
	return out
}

// getOSMLayer returns GeoJSON for the requested layer.
//
// Strategy:
//  1. Try GeoServer (local PostGIS – returns the user's curated OSM data).
//  2. If GeoServer is unavailable or returns no features, fall back to the
//     public Overpass API so the map still shows something useful.
//
// Query parameters:
//
//	bbox    (optional) minLon,minLat,maxLon,maxLat
//	region  (optional) region path filter, e.g. "Europe/Germany/Bayern"
func (s *Server) getOSMLayer(c *gin.Context) {
	layer := c.Param("layer")
	bboxStr := c.Query("bbox")
	regionPath := c.Query("region")

	var minLon, minLat, maxLon, maxLat float64
	hasBBox := false
	if bboxStr != "" {
		_, err := fmt.Sscanf(bboxStr, "%f,%f,%f,%f", &minLon, &minLat, &maxLon, &maxLat)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bbox format, use: minLon,minLat,maxLon,maxLat"})
			return
		}
		hasBBox = true
	}

	// ── 1. GeoServer (primary) ───────────────────────────────────────────────
	var gsBBox *geoserver.BBox
	if hasBBox {
		gsBBox = &geoserver.BBox{MinLon: minLon, MinLat: minLat, MaxLon: maxLon, MaxLat: maxLat}
	}
	data, err := s.geoServer.GetOSMLayer(layer, gsBBox, regionPath)
	if err == nil && !isEmptyFC(data) {
		log.Printf("[OSM] GeoServer ✓ %s (%d B)", layer, len(data))
		c.Data(http.StatusOK, "application/json", data)
		return
	}
	if err != nil {
		log.Printf("[OSM] GeoServer unavailable for %s: %v – falling back to Overpass", layer, err)
	} else {
		log.Printf("[OSM] GeoServer returned empty for %s – falling back to Overpass", layer)
	}

	// ── 2. Local extracted GeoJSON (no-DB fallback) ──────────────────────────
	if fp := localLayerFilePath(layer, regionPath); fp != "" {
		if b, readErr := os.ReadFile(fp); readErr == nil && !isEmptyFC(b) {
			log.Printf("[OSM] Local extract ✓ %s (%s, %d B)", layer, fp, len(b))
			c.Data(http.StatusOK, "application/json", b)
			return
		}
	}

	// ── 3. Overpass API (fallback) ───────────────────────────────────────────
	var opBBox *overpass.BBox
	if hasBBox {
		opBBox = &overpass.BBox{MinLon: minLon, MinLat: minLat, MaxLon: maxLon, MaxLat: maxLat}
	}
	data, err = s.osm.GetOSMLayer(layer, opBBox)
	if err != nil {
		log.Printf("[OSM] Overpass also failed for %s: %v", layer, err)
		c.Data(http.StatusOK, "application/json", []byte(`{"type":"FeatureCollection","features":[]}`))
		return
	}
	log.Printf("[OSM] Overpass ✓ %s (%d B)", layer, len(data))
	c.Data(http.StatusOK, "application/json", data)
}

// getLoadedRegions returns the distinct region_paths stored in PostGIS.
// Falls back to an empty list if GeoServer is unavailable (frontend then uses
// the static regions_database.json for the selector UI).
func (s *Server) getLoadedRegions(c *gin.Context) {
	regions, err := s.geoServer.GetLoadedRegions()
	if err != nil || len(regions) == 0 {
		local := listLocalExtractedRegions()
		if len(local) > 0 {
			c.JSON(http.StatusOK, gin.H{"regions": local})
			return
		}
		c.JSON(http.StatusOK, gin.H{"regions": []string{}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"regions": regions})
}

// getAvailableLayers returns the known OSM layer names.
func (s *Server) getAvailableLayers(c *gin.Context) {
	layers, _ := s.geoServer.GetAvailableLayers()
	c.JSON(http.StatusOK, gin.H{"layers": layers})
}

// proxyTechAPI forwards /tech/api/v1/* requests to the opentech-db Python API on port 8000.
func (s *Server) proxyTechAPI(c *gin.Context) {
	// Canonicalise the path to strip any traversal sequences before forwarding.
	rawPath := c.Param("path")
	cleanedPath := path.Clean("/" + strings.TrimPrefix(rawPath, "/"))
	if !strings.HasPrefix(cleanedPath, "/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
		return
	}

	target := techAPIURL + "/api/v1" + cleanedPath
	if c.Request.URL.RawQuery != "" {
		target += "?" + c.Request.URL.RawQuery
	}

	// Limit forwarded body size to prevent DoS relay attacks.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<20)

	req, err := http.NewRequestWithContext(c.Request.Context(), c.Request.Method, target, c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	// Forward relevant headers
	if ct := c.GetHeader("Content-Type"); ct != "" {
		req.Header.Set("Content-Type", ct)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "tech API unavailable: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	c.Data(resp.StatusCode, contentType, body)
}

// proxyTechAPIHealth forwards /tech/health to the opentech-db Python API health endpoint.
func (s *Server) proxyTechAPIHealth(c *gin.Context) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(techAPIURL + "/health")
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"status": "unavailable", "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	c.Data(resp.StatusCode, contentType, body)
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

// ─── Completed Runs Handlers ───────────────────────────────────────────────

// saveCompletedRun persists a run record sent from the frontend.
func (s *Server) saveCompletedRun(c *gin.Context) {
	var run models.CompletedRun
	if err := c.ShouldBindJSON(&run); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if run.ID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id is required"})
		return
	}
	if err := s.db.SaveCompletedRun(&run); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": run.ID})
}

// listCompletedRuns returns all persisted completed runs.
func (s *Server) listCompletedRuns(c *gin.Context) {
	runs, err := s.db.ListCompletedRuns()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if runs == nil {
		runs = []*models.CompletedRun{}
	}
	c.JSON(http.StatusOK, runs)
}

// deleteCompletedRun removes a single completed run record.
func (s *Server) deleteCompletedRun(c *gin.Context) {
	id := c.Param("id")
	if err := s.db.DeleteCompletedRun(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// getRegionsDatabase returns the contents of geofabrik_regions_database.json
// so the frontend doesn't need to bundle a large static file.
func (s *Server) getRegionsDatabase(c *gin.Context) {
	// Locate the JSON file relative to the binary / working directory.
	// Works both in development (go run .) and when built to a binary.
	candidates := []string{
		filepath.Join(".", "..", "osm_processing", "geofabrik_regions_database.json"),
		filepath.Join(".", "osm_processing", "geofabrik_regions_database.json"),
	}
	// Also try relative to the executable
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "..", "osm_processing", "geofabrik_regions_database.json"),
			filepath.Join(exeDir, "osm_processing", "geofabrik_regions_database.json"),
		)
	}
	var data []byte
	for _, p := range candidates {
		if b, err := os.ReadFile(p); err == nil {
			data = b
			break
		}
	}
	if data == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "regions database not found"})
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

// downloadOSMRegion spawns add_region_to_geoserver.py and streams its output
// back to the client as newline-delimited JSON log lines.
//
// Request body JSON: { "continent": "Europe", "country": "Germany", "region": "Bayern" }
// region is optional; omit it to import the whole country.
//
// Response: text/event-stream — each line is a JSON object:
//
//	{ "type": "log",     "message": "..." }
//	{ "type": "done",    "message": "Import complete" }
//	{ "type": "error",   "message": "..." }
func (s *Server) downloadOSMRegion(c *gin.Context) {
	var req struct {
		Continent string `json:"continent"`
		Country   string `json:"country"`
		Region    string `json:"region"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Continent == "" || req.Country == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "continent and country are required"})
		return
	}

	// Validate all geo components against a strict allowlist to prevent path
	// traversal or injection via positional args passed to the Python subprocess.
	if !geoComponentRe.MatchString(req.Continent) || !geoComponentRe.MatchString(req.Country) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid continent or country value"})
		return
	}
	if req.Region != "" && !geoComponentRe.MatchString(req.Region) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid region value"})
		return
	}

	// Resolve project root robustly across dev and packaged installs.
	// Prefer cwd only if it actually contains osm_processing, otherwise derive
	// from the backend executable location (resources directory in packaged app).
	var projectRoot string
	if cwd, err := os.Getwd(); err == nil {
		if filepath.Base(cwd) == "backend-go" {
			projectRoot = filepath.Dir(cwd)
		} else {
			projectRoot = cwd
		}
	}
	if projectRoot == "" || func() bool {
		_, err := os.Stat(filepath.Join(projectRoot, "osm_processing", "add_region_to_geoserver.py"))
		return err != nil
	}() {
		if exe, err := os.Executable(); err == nil {
			projectRoot = filepath.Dir(filepath.Dir(exe))
		}
	}
	if projectRoot == "" {
		projectRoot = filepath.Join(".", "..")
	}

	// Prefer the osm-venv python injected by Electron via TEMPO_OSM_PYTHON.
	// Fall back to .venv-calliope, then system python.
	var pythonBin string
	if envPy := os.Getenv("TEMPO_OSM_PYTHON"); envPy != "" {
		if _, err := os.Stat(envPy); err == nil {
			pythonBin = envPy
			log.Printf("[OSM] Using TEMPO_OSM_PYTHON: %s", pythonBin)
		} else {
			log.Printf("[OSM] TEMPO_OSM_PYTHON set but not found (%s), falling back", envPy)
		}
	}
	if pythonBin == "" {
		venvPython := filepath.Join(projectRoot, ".venv-calliope", "Scripts", "python.exe")
		if runtime.GOOS != "windows" {
			venvPython = filepath.Join(projectRoot, ".venv-calliope", "bin", "python")
		}
		if _, err := os.Stat(venvPython); err == nil {
			pythonBin = venvPython
			log.Printf("[OSM] Using venv python at %s", pythonBin)
		} else {
			if runtime.GOOS == "windows" {
				pythonBin = "python"
			} else {
				pythonBin = "python3"
			}
			log.Printf("[OSM] venv python not found, falling back to system python: %s", pythonBin)
		}
	}

	// Resolve osm_processing root.
	// TEMPO_OSM_SCRIPTS may point to:
	//   - root containing osm_processing/
	//   - osm_processing/ directory itself
	//   - add_region_to_geoserver.py file path
	osmScriptsDir := projectRoot
	if envScripts := os.Getenv("TEMPO_OSM_SCRIPTS"); envScripts != "" {
		if st, err := os.Stat(envScripts); err == nil {
			if st.IsDir() {
				// If it is already the osm_processing dir, use its parent as root.
				if filepath.Base(envScripts) == "osm_processing" {
					osmScriptsDir = filepath.Dir(envScripts)
				} else {
					osmScriptsDir = envScripts
				}
			} else {
				// File path provided; use containing directory or its parent if file is in osm_processing.
				parent := filepath.Dir(envScripts)
				if filepath.Base(parent) == "osm_processing" {
					osmScriptsDir = filepath.Dir(parent)
				} else {
					osmScriptsDir = parent
				}
			}
		}
	}

	scriptPath := filepath.Join(osmScriptsDir, "osm_processing", "add_region_to_geoserver.py")
	if _, err := os.Stat(scriptPath); err != nil {
		alt := filepath.Join(osmScriptsDir, "resources", "osm_processing", "add_region_to_geoserver.py")
		if _, altErr := os.Stat(alt); altErr == nil {
			scriptPath = alt
			osmScriptsDir = filepath.Join(osmScriptsDir, "resources")
		}
	}
	log.Printf("[OSM] projectRoot=%s scriptPath=%s", osmScriptsDir, scriptPath)

	// Verify the resolved script path is inside the expected osm_processing directory.
	expectedScriptDir := filepath.Clean(filepath.Join(osmScriptsDir, "osm_processing"))
	if !strings.HasPrefix(filepath.Clean(scriptPath), expectedScriptDir+string(filepath.Separator)) &&
		filepath.Clean(scriptPath) != expectedScriptDir {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "script path resolution error"})
		return
	}

	args := []string{scriptPath, req.Continent, req.Country}
	if req.Region != "" {
		args = append(args, req.Region)
	}

	log.Printf("[OSM] Starting download: %s %v", pythonBin, args)

	// Stream a startup message so the user sees what's running
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	sendMsg := func(msgType, text string) {
		msg, _ := json.Marshal(map[string]string{"type": msgType, "message": text})
		fmt.Fprintf(c.Writer, "data: %s\n\n", msg)
		c.Writer.Flush()
	}
	sendMsg("log", fmt.Sprintf("Python: %s", pythonBin))
	sendMsg("log", fmt.Sprintf("Script: %s", scriptPath))
	sendMsg("log", fmt.Sprintf("Args: %s %s %s", req.Continent, req.Country, req.Region))

	cmd := exec.CommandContext(c.Request.Context(), pythonBin, args...)
	cmd.Dir = filepath.Join(osmScriptsDir, "osm_processing")
	cmd.Env = append(os.Environ(),
		"PYTHONIOENCODING=utf-8",
		"PYTHONUTF8=1",
	)
	// Forward TEMPO_DATA_DIR so Python scripts write PBF/GeoJSON to userData.
	if tempoData := os.Getenv("TEMPO_DATA_DIR"); tempoData != "" {
		cmd.Env = append(cmd.Env, "TEMPO_DATA_DIR="+tempoData)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		sendMsg("error", "StdoutPipe: "+err.Error())
		return
	}
	cmd.Stderr = cmd.Stdout // merge stderr so all output is visible

	if err := cmd.Start(); err != nil {
		sendMsg("error", "could not start python: "+err.Error())
		return
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		log.Printf("[OSM] %s", line)
		msg, _ := json.Marshal(map[string]string{"type": "log", "message": line})
		fmt.Fprintf(c.Writer, "data: %s\n\n", msg)
		c.Writer.Flush()
	}

	if err := cmd.Wait(); err != nil {
		msg, _ := json.Marshal(map[string]string{"type": "error", "message": err.Error()})
		fmt.Fprintf(c.Writer, "data: %s\n\n", msg)
	} else {
		msg, _ := json.Marshal(map[string]string{"type": "done", "message": "Import complete"})
		fmt.Fprintf(c.Writer, "data: %s\n\n", msg)
	}
	c.Writer.Flush()
}
