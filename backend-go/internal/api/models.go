package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// saveModel saves a full frontend model as JSON.
// timeSeries entries (csvContent strings, data arrays already stripped by the
// frontend's prepareModelForBackend) are stored inline in the config blob.
func (s *Server) saveModel(c *gin.Context) {
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, maxModelBodyBytes))
	if err != nil {
		log.Printf("[saveModel] body read error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(body) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty body"})
		return
	}
	log.Printf("[saveModel] received body: %d bytes", len(body))

	var rawModel map[string]interface{}
	if err := json.Unmarshal(body, &rawModel); err != nil {
		log.Printf("[saveModel] unmarshal error: %v (first 200 bytes: %q)", err, body[:min(200, len(body))])
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if rawModel == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body must be a JSON object"})
		return
	}

	name, _ := rawModel["name"].(string)
	if name == "" {
		name = "Unnamed Model"
	}

	modelJSON, err := json.Marshal(rawModel)
	if err != nil {
		log.Printf("[saveModel] re-marshal error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	log.Printf("[saveModel] re-marshaled: %d bytes, saving as %q", len(modelJSON), name)

	id, err := s.db.SaveFullModel(name, string(modelJSON))
	if err != nil {
		log.Printf("[saveModel] db error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[saveModel] saved model id=%d name=%q", id, name)
	c.JSON(http.StatusCreated, gin.H{"id": fmt.Sprintf("%d", id), "name": name})
}

// hasInlineTimeSeries returns true when the parsed model config already contains
// a non-empty timeSeries array stored inline (the current approach). Returns false
// for models saved with the legacy approach (timeSeries stripped from blob, stored
// in the separate timeseries_data table) so those fall back to the legacy table.
func hasInlineTimeSeries(modelData map[string]interface{}) bool {
	v, ok := modelData["timeSeries"]
	if !ok || v == nil {
		return false
	}
	switch ts := v.(type) {
	case []interface{}:
		return len(ts) > 0
	case []map[string]interface{}:
		return len(ts) > 0
	default:
		return false
	}
}

// listModels returns all saved models with parsed config.
// timeSeries entries are fetched from the dedicated table and merged in.
func (s *Server) listModels(c *gin.Context) {
	modelsList, err := s.db.ListModels()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := make([]map[string]interface{}, 0, len(modelsList))
	for _, m := range modelsList {
		var modelData map[string]interface{}
		if err := json.Unmarshal([]byte(m.Config), &modelData); err != nil || modelData == nil {
			// Skip models with corrupt or null config rather than panicking.
			log.Printf("[listModels] skipping model id=%d: unmarshal err=%v modelData=nil=%v", m.ID, err, modelData == nil)
			continue
		}
		modelData["id"] = fmt.Sprintf("%d", m.ID)
		modelData["createdAt"] = m.CreatedAt
		modelData["updatedAt"] = m.UpdatedAt

		// Prefer inline timeSeries from config blob (current approach).
		// Fall back to legacy timeseries_data table for models saved with old code
		// (old code stripped timeSeries from the blob and saved them separately).
		if !hasInlineTimeSeries(modelData) {
			tsList, _ := s.db.GetModelTimeSeries(m.ID)
			if len(tsList) > 0 {
				modelData["timeSeries"] = tsList
			} else {
				modelData["timeSeries"] = []json.RawMessage{}
			}
		}

		result = append(result, modelData)
	}

	c.JSON(http.StatusOK, result)
}

// getModel retrieves a specific model with parsed config and attached timeSeries.
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
	if err := json.Unmarshal([]byte(m.Config), &modelData); err != nil || modelData == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid model config"})
		return
	}
	modelData["id"] = fmt.Sprintf("%d", m.ID)
	modelData["createdAt"] = m.CreatedAt
	modelData["updatedAt"] = m.UpdatedAt

	// Prefer inline timeSeries from config blob; fall back to legacy table.
	if !hasInlineTimeSeries(modelData) {
		tsList, _ := s.db.GetModelTimeSeries(modelID)
		if len(tsList) > 0 {
			modelData["timeSeries"] = tsList
		} else {
			modelData["timeSeries"] = []json.RawMessage{}
		}
	}

	c.JSON(http.StatusOK, modelData)
}

// updateModel updates an existing model.
// timeSeries are replaced atomically in the dedicated table.
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
	if rawModel == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body must be a JSON object"})
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
