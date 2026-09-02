package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"calliope-backend/internal/calliope"
	"calliope-backend/internal/geoserver"
	"calliope-backend/internal/overpass"
	"calliope-backend/internal/storage"

	"github.com/gin-gonic/gin"
)

// This package is organised by resource. server.go owns wiring only —
// CORS, the Server struct, route registration and shared helpers. The HTTP
// handlers live in sibling files: models.go, jobs.go, runs.go, osm.go,
// techproxy.go. setupRoutes() below is the readable index of the whole API.

// allowedCORSOrigins is the strict set of origins permitted to call this API.
// Electron file:// renderer sends Origin: "null"; all others must be local Vite dev origins.
var allowedCORSOrigins = map[string]bool{
	"http://localhost:5173": true,
	"http://localhost:5174": true,
	"http://127.0.0.1:5173": true,
	"http://127.0.0.1:5174": true,
}

// maxModelBodyBytes caps incoming model payloads at 256 MB.
// Models with many inline CSV timeSeries (Calliope YAML imports) can exceed 32 MB
// when the raw CSV strings are stored for reload persistence.
const maxModelBodyBytes = 256 << 20 // 256 MB

const geoServerURL = "http://localhost:8081/geoserver"

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
		// Model management → models.go
		api.POST("/models", s.saveModel)
		api.GET("/models", s.listModels)
		api.GET("/models/:id", s.getModel)
		api.PUT("/models/:id", s.updateModel)
		api.DELETE("/models/:id", s.deleteModel)

		// Job management → jobs.go
		api.POST("/models/:id/run", s.runModel)
		api.GET("/jobs/:id", s.getJobStatus)
		api.GET("/jobs/:id/results", s.getJobResults)

		// Completed runs (persisted history) → runs.go
		api.POST("/completed-runs", s.saveCompletedRun)
		api.GET("/completed-runs", s.listCompletedRuns)
		api.DELETE("/completed-runs/:id", s.deleteCompletedRun)

		// OSM / Overpass integration → osm.go — static routes MUST come before :layer param
		api.GET("/osm/layers", s.getAvailableLayers)
		api.GET("/osm/regions", s.getLoadedRegions)
		api.GET("/osm/regions-db", s.getRegionsDatabase)
		api.POST("/osm/download", s.downloadOSMRegion)
		api.GET("/osm/:layer", s.getOSMLayer)
		// Per-zone, transmission-filtered Overpass fetch for the zonal builder
		api.GET("/overpass/power", s.getOverpassPower)
		api.GET("/geocode", s.geocode)

		// Health check
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok"})
		})
	}

	// Proxy /tech/* to the opentech-db Python API (port 8000) → techproxy.go
	s.router.GET("/tech/health", s.proxyTechAPIHealth)
	s.router.Any("/tech/api/v1/*path", s.proxyTechAPI)
}

func (s *Server) Start() error {
	return s.router.Run(":" + s.port)
}

// readJSONBody reads the raw request body and unmarshals it into a map.
// Capped at maxModelBodyBytes to prevent DoS via oversized payloads.
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
