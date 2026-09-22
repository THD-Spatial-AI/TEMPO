package api

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"

	"calliope-backend/internal/geoserver"
	"calliope-backend/internal/overpass"

	"github.com/gin-gonic/gin"
)

// geoComponentRe restricts OSM region/country/continent values to safe identifiers.
var geoComponentRe = regexp.MustCompile(`^[A-Za-z0-9\-_ ]{1,80}$`)

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

// getOverpassPower fetches power infrastructure for the zonal builder, bounded
// to a bbox and (for lines/substations) filtered to transmission voltages.
//
// Query params: bbox=minLon,minLat,maxLon,maxLat  kind=lines|substations|plants
//               min_voltage=<kV> (optional; applies to lines/substations)
func (s *Server) getOverpassPower(c *gin.Context) {
	kind := c.Query("kind")
	if kind != "lines" && kind != "substations" && kind != "plants" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "kind must be lines|substations|plants"})
		return
	}
	var minLon, minLat, maxLon, maxLat float64
	if _, err := fmt.Sscanf(c.Query("bbox"), "%f,%f,%f,%f", &minLon, &minLat, &maxLon, &maxLat); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bbox, use minLon,minLat,maxLon,maxLat"})
		return
	}
	var minV float64
	if v := c.Query("min_voltage"); v != "" {
		fmt.Sscanf(v, "%f", &minV)
	}

	data, err := s.osm.GetPowerFeatures(kind,
		&overpass.BBox{MinLon: minLon, MinLat: minLat, MaxLon: maxLon, MaxLat: maxLat}, minV)
	if err != nil {
		c.Data(http.StatusOK, "application/json", []byte(`{"type":"FeatureCollection","features":[]}`))
		return
	}
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

// geocode proxies a Nominatim geocoding request for the given query string.
//
// Query parameters:
//
//	q  (required) free-text search, e.g. "Germany" or "Santiago, Chile"
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

	pythonBin, scriptPath, workDir, rerr := resolveOSMScript("add_region_to_geoserver.py")
	if rerr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": rerr.Error()})
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
	cmd.Dir = workDir
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

// resolveOSMScript locates the osm-venv python and an osm_processing script,
// robust across dev and packaged installs. workDir is the osm_processing dir to
// run the script from. It enforces that the resolved script stays inside
// osm_processing (path-traversal guard). Shared by the OSM download and the
// boundary-seeding handlers.
func resolveOSMScript(scriptName string) (pythonBin, scriptPath, workDir string, err error) {
	// Resolve project root robustly across dev and packaged installs. Prefer cwd
	// only if it actually contains osm_processing, otherwise derive from the
	// backend executable location (resources directory in packaged app).
	var projectRoot string
	if cwd, e := os.Getwd(); e == nil {
		if filepath.Base(cwd) == "backend-go" {
			projectRoot = filepath.Dir(cwd)
		} else {
			projectRoot = cwd
		}
	}
	if projectRoot == "" || func() bool {
		_, e := os.Stat(filepath.Join(projectRoot, "osm_processing", scriptName))
		return e != nil
	}() {
		if exe, e := os.Executable(); e == nil {
			projectRoot = filepath.Dir(filepath.Dir(exe))
		}
	}
	if projectRoot == "" {
		projectRoot = filepath.Join(".", "..")
	}

	// Prefer the osm-venv python injected by Electron via TEMPO_OSM_PYTHON.
	// Fall back to .venv-calliope, then system python.
	if envPy := os.Getenv("TEMPO_OSM_PYTHON"); envPy != "" {
		if _, e := os.Stat(envPy); e == nil {
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
		if _, e := os.Stat(venvPython); e == nil {
			pythonBin = venvPython
			log.Printf("[OSM] Using venv python at %s", pythonBin)
		} else if runtime.GOOS == "windows" {
			pythonBin = "python"
		} else {
			pythonBin = "python3"
		}
	}

	// Resolve osm_processing root. TEMPO_OSM_SCRIPTS may point to a root
	// containing osm_processing/, the osm_processing/ dir itself, or a file path.
	osmScriptsDir := projectRoot
	if envScripts := os.Getenv("TEMPO_OSM_SCRIPTS"); envScripts != "" {
		if st, e := os.Stat(envScripts); e == nil {
			if st.IsDir() {
				if filepath.Base(envScripts) == "osm_processing" {
					osmScriptsDir = filepath.Dir(envScripts)
				} else {
					osmScriptsDir = envScripts
				}
			} else {
				parent := filepath.Dir(envScripts)
				if filepath.Base(parent) == "osm_processing" {
					osmScriptsDir = filepath.Dir(parent)
				} else {
					osmScriptsDir = parent
				}
			}
		}
	}

	scriptPath = filepath.Join(osmScriptsDir, "osm_processing", scriptName)
	if _, e := os.Stat(scriptPath); e != nil {
		alt := filepath.Join(osmScriptsDir, "resources", "osm_processing", scriptName)
		if _, altErr := os.Stat(alt); altErr == nil {
			scriptPath = alt
			osmScriptsDir = filepath.Join(osmScriptsDir, "resources")
		}
	}
	log.Printf("[OSM] projectRoot=%s scriptPath=%s", osmScriptsDir, scriptPath)

	// Verify the resolved script path is inside the expected osm_processing dir.
	expectedScriptDir := filepath.Clean(filepath.Join(osmScriptsDir, "osm_processing"))
	if !strings.HasPrefix(filepath.Clean(scriptPath), expectedScriptDir+string(filepath.Separator)) &&
		filepath.Clean(scriptPath) != expectedScriptDir {
		return "", "", "", fmt.Errorf("script path resolution error")
	}
	return pythonBin, scriptPath, filepath.Join(osmScriptsDir, "osm_processing"), nil
}
