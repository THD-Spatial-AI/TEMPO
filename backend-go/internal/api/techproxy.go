package api

import (
	"io"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// techAPIURL is the upstream opentech-db base URL.
// Override with TEMPO_TECH_UPSTREAM_URL env var (e.g. for a local dev instance).
var techAPIURL = func() string {
	if u := os.Getenv("TEMPO_TECH_UPSTREAM_URL"); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "https://otdb.th-deg.de"
}()

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
