package api

import (
	"net/http"

	"calliope-backend/internal/models"

	"github.com/gin-gonic/gin"
)

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
