// Package overpass provides a client for the Overpass API (OSM data) and
// Nominatim geocoding.  It replaces the GeoServer/PostGIS stack so that the
// application works without any bundled Java or database services.
package overpass

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

// BBox is a geographic bounding box.
type BBox struct {
	MinLon float64
	MinLat float64
	MaxLon float64
	MaxLat float64
}

// Client queries Overpass API and Nominatim with a simple in-memory cache.
type Client struct {
	overpassURL string
	nominatimURL string
	http        *http.Client
	mu          sync.Mutex
	cache       map[string]cacheEntry
}

type cacheEntry struct {
	data      []byte
	expiresAt time.Time
}

// ──────────────────────────────────────────────────────────────────────────────
// Constructor
// ──────────────────────────────────────────────────────────────────────────────

// NewClient creates a client using the public Overpass / Nominatim endpoints.
func NewClient() *Client {
	return &Client{
		overpassURL:  "https://overpass-api.de/api/interpreter",
		nominatimURL: "https://nominatim.openstreetmap.org",
		http: &http.Client{
			Timeout: 60 * time.Second,
		},
		cache: make(map[string]cacheEntry),
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// GetOSMLayer  (replaces GeoServer WFS calls)
// ──────────────────────────────────────────────────────────────────────────────

// GetOSMLayer fetches OSM features for the given layer within the bounding box
// and returns GeoJSON bytes.  Results are cached for 5 minutes.
//
// Supported layer names (same as the old GeoServer table names):
//
//	osm_substations, osm_power_plants, osm_power_lines,
//	osm_communes, osm_districts
func (c *Client) GetOSMLayer(layerName string, bbox *BBox) ([]byte, error) {
	if bbox == nil {
		return emptyFC(), nil
	}

	// Limit bbox size to avoid overloading Overpass (max ~5°×5°).
	// Large queries are clamped rather than rejected so the UI still shows data.
	bbox = clampBBox(bbox, 5.0)

	cacheKey := fmt.Sprintf("%s:%.4f,%.4f,%.4f,%.4f", layerName, bbox.MinLat, bbox.MinLon, bbox.MaxLat, bbox.MaxLon)

	// Check cache
	c.mu.Lock()
	if e, ok := c.cache[cacheKey]; ok && time.Now().Before(e.expiresAt) {
		c.mu.Unlock()
		return e.data, nil
	}
	c.mu.Unlock()

	query := buildQuery(layerName, bbox)
	raw, err := c.runOverpassQuery(query)
	if err != nil {
		return emptyFC(), nil // return empty rather than hard error
	}

	geojson, err := overpassToGeoJSON(raw)
	if err != nil {
		return emptyFC(), nil
	}

	// Store in cache (5 min TTL)
	c.mu.Lock()
	c.cache[cacheKey] = cacheEntry{data: geojson, expiresAt: time.Now().Add(5 * time.Minute)}
	c.mu.Unlock()

	return geojson, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Geocode  (Nominatim search – replaces PostGIS region list)
// ──────────────────────────────────────────────────────────────────────────────

// Geocode queries Nominatim for the given free-text query and returns the raw
// JSON response from Nominatim (array of results with boundingbox, lat, lon, …).
func (c *Client) Geocode(query string) ([]byte, error) {
	params := url.Values{}
	params.Set("q", query)
	params.Set("format", "json")
	params.Set("limit", "8")
	params.Set("addressdetails", "1")

	reqURL := fmt.Sprintf("%s/search?%s", c.nominatimURL, params.Encode())

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	// Nominatim requires a valid User-Agent
	req.Header.Set("User-Agent", "CalliopeVisualizer/1.0 (energy-system-modelling)")
	req.Header.Set("Accept-Language", "en")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nominatim returned %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}

// GetAvailableLayers returns the hardcoded list of layer names.
func (c *Client) GetAvailableLayers() ([]string, error) {
	return []string{
		"osm_substations",
		"osm_power_plants",
		"osm_power_lines",
	}, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

func buildQuery(layer string, bbox *BBox) string {
	// Overpass bbox order: south,west,north,east  (lat_min,lon_min,lat_max,lon_max)
	b := fmt.Sprintf("(%.6f,%.6f,%.6f,%.6f)", bbox.MinLat, bbox.MinLon, bbox.MaxLat, bbox.MaxLon)

	switch layer {
	case "osm_substations":
		return fmt.Sprintf(
			`[out:json][timeout:40];(node["power"="substation"]%s;way["power"="substation"]%s;);out geom;`,
			b, b,
		)
	case "osm_power_plants":
		return fmt.Sprintf(
			`[out:json][timeout:40];(node["power"="plant"]%s;way["power"="plant"]%s;node["power"="generator"]%s;way["power"="generator"]%s;);out geom;`,
			b, b, b, b,
		)
	case "osm_power_lines":
		return fmt.Sprintf(
			`[out:json][timeout:40];(way["power"="line"]%s;way["power"="cable"]%s;way["power"="minor_line"]%s;);out geom;`,
			b, b, b,
		)
	case "osm_communes":
		// admin_level 8 = municipalities in most European countries
		return fmt.Sprintf(
			`[out:json][timeout:40];(relation["boundary"="administrative"]["admin_level"="8"]%s;);out geom;`,
			b,
		)
	case "osm_districts":
		// admin_level 6 = districts / counties
		return fmt.Sprintf(
			`[out:json][timeout:40];(relation["boundary"="administrative"]["admin_level"="6"]%s;);out geom;`,
			b,
		)
	default:
		return fmt.Sprintf(`[out:json][timeout:40];(node%s;);out geom;`, b)
	}
}

func (c *Client) runOverpassQuery(query string) ([]byte, error) {
	req, err := http.NewRequest("POST", c.overpassURL,
		strings.NewReader(url.Values{"data": {query}}.Encode()))
	if err != nil {
		return nil, fmt.Errorf("overpass request failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "TEMPO/1.0 (energy-system-modelling)")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("overpass request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("overpass returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return body, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Overpass JSON → GeoJSON conversion
// ──────────────────────────────────────────────────────────────────────────────

type overpassResponse struct {
	Elements []overpassElement `json:"elements"`
}

type overpassElement struct {
	Type     string             `json:"type"`
	ID       int64              `json:"id"`
	Lat      float64            `json:"lat"`
	Lon      float64            `json:"lon"`
	Geometry []overpassGeomPt   `json:"geometry"`
	Tags     map[string]string  `json:"tags"`
	Members  []overpassMember   `json:"members"`
}

type overpassGeomPt struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type overpassMember struct {
	Type     string           `json:"type"`
	Ref      int64            `json:"ref"`
	Role     string           `json:"role"`
	Geometry []overpassGeomPt `json:"geometry"`
}

type geojsonFC struct {
	Type     string        `json:"type"`
	Features []interface{} `json:"features"`
}

type geojsonFeature struct {
	Type       string                 `json:"type"`
	ID         string                 `json:"id"`
	Geometry   interface{}            `json:"geometry"`
	Properties map[string]interface{} `json:"properties"`
}

type geojsonPoint struct {
	Type        string    `json:"type"`
	Coordinates []float64 `json:"coordinates"`
}

type geojsonLineString struct {
	Type        string      `json:"type"`
	Coordinates [][]float64 `json:"coordinates"`
}

type geojsonPolygon struct {
	Type        string        `json:"type"`
	Coordinates [][][]float64 `json:"coordinates"`
}

type geojsonMultiPolygon struct {
	Type        string          `json:"type"`
	Coordinates [][][][]float64 `json:"coordinates"`
}

func overpassToGeoJSON(data []byte) ([]byte, error) {
	var ovResp overpassResponse
	if err := json.Unmarshal(data, &ovResp); err != nil {
		return nil, fmt.Errorf("parse overpass: %w", err)
	}

	fc := geojsonFC{Type: "FeatureCollection", Features: []interface{}{}}

	for _, el := range ovResp.Elements {
		var f *geojsonFeature
		switch el.Type {
		case "node":
			f = nodeToFeature(el)
		case "way":
			f = wayToFeature(el)
		case "relation":
			f = relationToFeature(el)
		}
		if f != nil {
			fc.Features = append(fc.Features, f)
		}
	}

	return json.Marshal(fc)
}

func nodeToFeature(el overpassElement) *geojsonFeature {
	return &geojsonFeature{
		Type: "Feature",
		ID:   fmt.Sprintf("node/%d", el.ID),
		Geometry: geojsonPoint{
			Type:        "Point",
			Coordinates: []float64{el.Lon, el.Lat},
		},
		Properties: tagsToProps(el.Tags, el.ID, "node"),
	}
}

func wayToFeature(el overpassElement) *geojsonFeature {
	if len(el.Geometry) < 2 {
		return nil
	}
	coords := make([][]float64, len(el.Geometry))
	for i, pt := range el.Geometry {
		coords[i] = []float64{pt.Lon, pt.Lat}
	}

	// Closed way (first == last) → Polygon, otherwise LineString
	first := el.Geometry[0]
	last := el.Geometry[len(el.Geometry)-1]
	isClosedWay := first.Lat == last.Lat && first.Lon == last.Lon

	var geom interface{}
	if isClosedWay && len(coords) >= 4 {
		geom = geojsonPolygon{
			Type:        "Polygon",
			Coordinates: [][][]float64{coords},
		}
	} else {
		geom = geojsonLineString{
			Type:        "LineString",
			Coordinates: coords,
		}
	}

	return &geojsonFeature{
		Type:       "Feature",
		ID:         fmt.Sprintf("way/%d", el.ID),
		Geometry:   geom,
		Properties: tagsToProps(el.Tags, el.ID, "way"),
	}
}

func relationToFeature(el overpassElement) *geojsonFeature {
	// Collect outer/inner rings from member ways
	var outerRings [][][]float64
	var innerRings [][][]float64

	for _, m := range el.Members {
		if m.Type != "way" || len(m.Geometry) < 2 {
			continue
		}
		coords := make([][]float64, len(m.Geometry))
		for i, pt := range m.Geometry {
			coords[i] = []float64{pt.Lon, pt.Lat}
		}
		switch m.Role {
		case "outer", "":
			outerRings = append(outerRings, coords)
		case "inner":
			innerRings = append(innerRings, coords)
		}
	}

	if len(outerRings) == 0 {
		return nil
	}

	// Build MultiPolygon: each outer ring is its own Polygon with no holes
	// (simplified – holes are omitted for now)
	var polygons [][][][]float64
	for _, outer := range outerRings {
		poly := [][][]float64{outer}
		polygons = append(polygons, poly)
	}
	_ = innerRings

	var geom interface{}
	if len(polygons) == 1 {
		geom = geojsonPolygon{
			Type:        "Polygon",
			Coordinates: polygons[0],
		}
	} else {
		geom = geojsonMultiPolygon{
			Type:        "MultiPolygon",
			Coordinates: polygons,
		}
	}

	return &geojsonFeature{
		Type:       "Feature",
		ID:         fmt.Sprintf("relation/%d", el.ID),
		Geometry:   geom,
		Properties: tagsToProps(el.Tags, el.ID, "relation"),
	}
}

func tagsToProps(tags map[string]string, id int64, elType string) map[string]interface{} {
	props := make(map[string]interface{}, len(tags)+2)
	for k, v := range tags {
		props[k] = v
	}
	props["@id"] = fmt.Sprintf("%s/%d", elType, id)
	props["@osm_id"] = id
	// Add friendly properties for common power infrastructure
	if v, ok := tags["voltage"]; ok {
		props["voltage"] = parseVoltage(v)
	}
	if _, ok := tags["power"]; !ok {
		// ensure power tag exists in properties even if nil
		props["power"] = nil
	}
	return props
}

// parseVoltage tries to parse a voltage string like "380000" or "380 kV" into kV.
func parseVoltage(s string) interface{} {
	s = strings.TrimSpace(s)
	var kv float64
	if _, err := fmt.Sscanf(s, "%f", &kv); err == nil {
		if kv > 1000 {
			kv /= 1000 // convert V to kV
		}
		return kv
	}
	return s
}

func emptyFC() []byte {
	return []byte(`{"type":"FeatureCollection","features":[]}`)
}

// clampBBox limits the bounding box to at most maxDeg degrees on each axis
// (centered on the original box to avoid shifting the view).
func clampBBox(bbox *BBox, maxDeg float64) *BBox {
	lonSpan := bbox.MaxLon - bbox.MinLon
	latSpan := bbox.MaxLat - bbox.MinLat

	if lonSpan <= maxDeg && latSpan <= maxDeg {
		return bbox
	}

	centerLon := (bbox.MinLon + bbox.MaxLon) / 2
	centerLat := (bbox.MinLat + bbox.MaxLat) / 2

	halfLon := min64(lonSpan/2, maxDeg/2)
	halfLat := min64(latSpan/2, maxDeg/2)

	return &BBox{
		MinLon: centerLon - halfLon,
		MaxLon: centerLon + halfLon,
		MinLat: centerLat - halfLat,
		MaxLat: centerLat + halfLat,
	}
}

func min64(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
