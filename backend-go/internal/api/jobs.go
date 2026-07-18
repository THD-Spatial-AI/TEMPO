package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"calliope-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

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
