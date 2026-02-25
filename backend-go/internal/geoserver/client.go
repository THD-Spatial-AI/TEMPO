package geoserver

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
	cache      map[string]cacheEntry
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
	// Check cache first (5 minute TTL)
	cacheKey := fmt.Sprintf("%s:%v:%s", layerName, bbox, regionPath)
	if entry, ok := c.cache[cacheKey]; ok {
		if time.Since(entry.timestamp) < 5*time.Minute {
			return entry.data, nil
		}
	}

	// Build WFS request
	params := url.Values{}
	params.Add("service", "WFS")
	params.Add("version", "2.0.0")
	params.Add("request", "GetFeature")
	params.Add("typeName", fmt.Sprintf("osm:%s", layerName))
	params.Add("outputFormat", "application/json")
	params.Add("srsName", "EPSG:4326")

	// Add bounding box spatial filter if provided
	if bbox != nil {
		// BBOX format: minLon,minLat,maxLon,maxLat,CRS
		params.Add("bbox", fmt.Sprintf("%f,%f,%f,%f,EPSG:4326",
			bbox.MinLon, bbox.MinLat, bbox.MaxLon, bbox.MaxLat))
	}

	// Add CQL region filter if provided.
	// Use LIKE with a trailing wildcard so "Europe/Germany" also matches
	// sub-regions like "Europe/Germany/Bayern/Niederbayern".
	if regionPath != "" {
		params.Add("CQL_FILTER", fmt.Sprintf("region_path LIKE '%s%%'", regionPath))
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
	c.cache[cacheKey] = cacheEntry{
		data:      data,
		timestamp: time.Now(),
	}

	return data, nil
}

// GetLoadedRegions returns the distinct region_paths that have data in PostGIS.
// It queries the osm_substations table as a representative sample.
func (c *Client) GetLoadedRegions() ([]string, error) {
	params := url.Values{}
	params.Add("service", "WFS")
	params.Add("version", "2.0.0")
	params.Add("request", "GetPropertyValue")
	params.Add("typeNames", "osm:osm_substations")
	params.Add("valueReference", "region_path")
	params.Add("outputFormat", "application/json")

	reqURL := fmt.Sprintf("%s/wfs?%s", c.baseURL, params.Encode())

	resp, err := c.httpClient.Get(reqURL)
	if err != nil {
		return nil, fmt.Errorf("geoserver regions request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("geoserver returned status %d", resp.StatusCode)
	}

	var result struct {
		Values []string `json:"values"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode regions response: %w", err)
	}

	// Deduplicate
	seen := make(map[string]bool)
	unique := []string{}
	for _, v := range result.Values {
		if v != "" && !seen[v] {
			seen[v] = true
			unique = append(unique, v)
		}
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
	c.cache = make(map[string]cacheEntry)
}
