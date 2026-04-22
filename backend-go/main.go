package main

import (
	"calliope-backend/internal/api"
	"calliope-backend/internal/storage"
	"flag"
	"fmt"
	"log"
	"os"
)

func main() {
	port := flag.String("port", "8082", "API server port")
	dbPath := flag.String("db", "./calliope.db", "SQLite database path")
	flag.Parse()

	// Initialize database
	db, err := storage.InitDB(*dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Initialize API server
	server := api.NewServer(db, *port)

	// Write PID file for Electron to manage (owner-only permissions).
	pidFile := ".backend.pid"
	if err := os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", os.Getpid())), 0600); err != nil {
		log.Printf("Warning: Could not write PID file: %v", err)
	}
	defer os.Remove(pidFile)

	log.Printf("Starting Calliope Backend on port %s", *port)
	if err := server.Start(); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
