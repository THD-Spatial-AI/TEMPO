package geoserver

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

// regionPathRe restricts region_path values to slash-separated path segments
// containing only letters, digits, hyphens, and underscores — no SQL metacharacters.
var regionPathRe = regexp.MustCompile(`^[A-Za-z0-9\-_]+((/[A-Za-z0-9\-_]+)*)$`)

// validLayers is the authoritative set of PostGIS table names this client may query.
var validLayers = map[string]bool{
	"osm_substations": true,
	"osm_power_plants": true,
	"osm_power_lines":  true,
	"osm_communes":     true,
	"osm_districts":    true,
}

type Client struct {
	baseURL    string
	httpClient *http.Client
	cache      map[string]cacheEntry
	cacheMu    sync.RWMutex
}

type BBox struct {
	MinLon float64
	MinLat float64
	MaxLon float64
	MaxLat float64
}

type cacheEntry struct {
	data      []byte
	timestamp time.Time
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		cache: make(map[string]cacheEntry),
	}
}

// GetOSMLayer fetches GeoJSON data from GeoServer WFS service.
//
// layerName  – PostGIS table name (e.g. "osm_substations")
// bbox       – optional bounding-box spatial filter
// regionPath – optional region path prefix filter (e.g. "Europe/Germany" or
//              "South_America/Chile"). An empty string disables filtering and
//              returns data for ALL loaded regions.
//
// Examples:
//   GetOSMLayer("osm_substations", nil, "")
//   GetOSMLayer("osm_substations", &BBox{...}, "Europe/Germany/Bayern")
func (c *Client) GetOSMLayer(layerName string, bbox *BBox, regionPath string) ([]byte, error) {
	// Validate layerName against known-good set to prevent injection via typeName parameter.
	if !validLayers[layerName] {
		return nil, fmt.Errorf("unknown layer: %q", layerName)
	}

	// Validate regionPath to contains only safe path characters.
	if regionPath != "" && !regionPathRe.MatchString(regionPath) {
		return nil, fmt.Errorf("invalid region path: %q", regionPath)
	}

	// Check cache first (5 minute TTL)
	var bboxKey string
	if bbox != nil {
		bboxKey = fmt.Sprintf("%.4f,%.4f,%.4f,%.4f", bbox.MinLon, bbox.MinLat, bbox.MaxLon, bbox.MaxLat)
	}
	cacheKey := fmt.Sprintf("%s:%s:%s", layerName, bboxKey, regionPath)
	
	c.cacheMu.RLock()
	entry, ok := c.cache[cacheKey]
	c.cacheMu.RUnlock()
	
	if ok && time.Since(entry.timestamp) < 5*time.Minute {
		return entry.data, nil
	}

	// Build WFS request
	params := url.Values{}
	params.Add("service", "WFS")
	params.Add("version", "2.0.0")
	params.Add("request", "GetFeature")
	params.Add("typeName", fmt.Sprintf("osm:%s", layerName))
	params.Add("outputFormat", "application/json")
	params.Add("srsName", "EPSG:4326")

	// Add region_path filter using CQL with prefix matching
	// This supports hierarchical filtering:
	// - "Europe/Germany" matches data tagged exactly with or under that path
	// - "Europe/Germany/Bayern" matches "Europe/Germany/Bayern/Niederbayern" etc.
	// 
	// For spatial filtering based on district boundaries when data is tagged
	// at country level, see GetOSMLayerByBoundary()
	if regionPath != "" {
		// Escape any literal single quotes per CQL spec (double them: '')
		// before interpolating into the LIKE expression.
		safePath := strings.ReplaceAll(regionPath, "'", "''")
		cqlFilter := fmt.Sprintf("region_path LIKE '%s%%'", safePath)
		params.Add("cql_filter", cqlFilter)
		log.Printf("[geoserver] CQL filter applied for layer %s", layerName)
	} else if bbox != nil {
		// Only add bbox if no region filter (GeoServer returns 500 when both are combined)
		params.Add("bbox", fmt.Sprintf("%f,%f,%f,%f,EPSG:4326",
			bbox.MinLon, bbox.MinLat, bbox.MaxLon, bbox.MaxLat))
	}

	reqURL := fmt.Sprintf("%s/wfs?%s", c.baseURL, params.Encode())

	resp, err := c.httpClient.Get(reqURL)
	if err != nil {
		return nil, fmt.Errorf("geoserver request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("geoserver returned status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Validate JSON
	var test interface{}
	if err := json.Unmarshal(data, &test); err != nil {
		return nil, fmt.Errorf("invalid JSON response: %w", err)
	}

	// Cache the result
	c.cacheMu.Lock()
	c.cache[cacheKey] = cacheEntry{
		data:      data,
		timestamp: time.Now(),
	}
	c.cacheMu.Unlock()

	return data, nil
}

// GetLoadedRegions returns the distinct region_paths that have data in PostGIS.
// It queries both infrastructure and boundary layers to get complete region hierarchy.
func (c *Client) GetLoadedRegions() ([]string, error) {
	seen := make(map[string]bool)
	unique := []string{}
	
	// Query multiple layers to get all region_paths
	// Boundaries (districts/communes) have the complete hierarchy
	// Infrastructure (substations/etc) might only have country-level paths
	layers := []string{
		"osm:osm_districts",  // Priority: provinces/states
		"osm:osm_communes",   // Priority: municipalities
		"osm:osm_substations", // Fallback: infrastructure
	}
	
	for _, layerName := range layers {
		params := url.Values{}
		params.Add("service", "WFS")
		params.Add("version", "2.0.0")
		params.Add("request", "GetFeature")
		params.Add("typeNames", layerName)
		params.Add("outputFormat", "application/json")
		params.Add("propertyName", "region_path")
		params.Add("maxFeatures", "10000")
		
		reqURL := fmt.Sprintf("%s/wfs?%s", c.baseURL, params.Encode())
		
		resp, err := c.httpClient.Get(reqURL)
		if err != nil {
			// If one layer fails, continue with others
			continue
		}
		
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			continue
		}
		
		var result struct {
			Features []struct {
				Properties struct {
					RegionPath string `json:"region_path"`
				} `json:"properties"`
			} `json:"features"`
		}
		
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			resp.Body.Close()
			continue
		}
		resp.Body.Close()
		
		// Collect unique region_path values
		for _, feature := range result.Features {
			regionPath := feature.Properties.RegionPath
			if regionPath != "" && !seen[regionPath] {
				seen[regionPath] = true
				unique = append(unique, regionPath)
			}
		}
	}
	
	if len(unique) == 0 {
		return nil, fmt.Errorf("no regions found in any layer")
	}

	return unique, nil
}

func (c *Client) GetAvailableLayers() ([]string, error) {
	params := url.Values{}
	params.Add("service", "WFS")
	params.Add("version", "2.0.0")
	params.Add("request", "GetCapabilities")

	reqURL := fmt.Sprintf("%s/wfs?%s", c.baseURL, params.Encode())

	resp, err := c.httpClient.Get(reqURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Parse WFS capabilities (simplified)
	// In production, parse XML properly
	return []string{
		"osm_substations",
		"osm_power_plants",
		"osm_power_lines",
		"osm_communes",
		"osm_districts",
	}, nil
}

// ClearCache removes all cached entries
func (c *Client) ClearCache() {
	c.cacheMu.Lock()
	c.cache = make(map[string]cacheEntry)
	c.cacheMu.Unlock()
}
