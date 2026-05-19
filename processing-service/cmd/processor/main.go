package main

import (
	"encoding/json"
	"errors"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/Dzivo/unicast-tehnical-task/processing-service/internal/mp4"
	"github.com/nats-io/nats.go"
)

type startMessage struct {
	FileID       int64  `json:"fileId"`
	FilePath     string `json:"filePath"`
	ProcessedDir string `json:"processedDir"`
}

type resultMessage struct {
	FileID        int64  `json:"fileId"`
	Status        string `json:"status"`
	ProcessedPath string `json:"processedPath,omitempty"`
	ErrorMessage  string `json:"errorMessage,omitempty"`
}

func main() {
	natsURL := envOrDefault("NATS_URL", "nats://localhost:4222")
	startSubject := envOrDefault("NATS_PROCESS_SUBJECT", "file.process.start")
	resultSubject := envOrDefault("NATS_RESULT_SUBJECT", "file.process.result")
	processedRoot := envOrDefault("PROCESSED_DIR", filepath.Join(".", "processed"))

	nc, err := nats.Connect(natsURL)
	if err != nil {
		log.Fatalf("connect to NATS: %v", err)
	}
	defer nc.Close()

	_, err = nc.Subscribe(startSubject, func(msg *nats.Msg) {
		var start startMessage
		if err := json.Unmarshal(msg.Data, &start); err != nil {
			log.Printf("invalid start payload: %v", err)
			return
		}

		targetDir := processedRoot
		if start.ProcessedDir != "" {
			targetDir = start.ProcessedDir
		}

		response := processFile(start.FileID, start.FilePath, targetDir)
		body, err := json.Marshal(response)
		if err != nil {
			log.Printf("marshal response: %v", err)
			return
		}

		if err := nc.Publish(resultSubject, body); err != nil {
			log.Printf("publish processing result: %v", err)
		}
	})
	if err != nil {
		log.Fatalf("subscribe to subject: %v", err)
	}

	log.Printf("processing service listening for %s", startSubject)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
}

func processFile(fileID int64, filePath string, processedDir string) resultMessage {
	if !filepath.IsAbs(filePath) {
		return resultMessage{FileID: fileID, Status: "Failed", ErrorMessage: "filePath must be absolute"}
	}

	outputPath, err := mp4.ExtractInitializationSegment(filePath, processedDir)
	if err != nil {
		statusErr := err.Error()
		if errors.Is(err, mp4.ErrUnexpectedInitBox) {
			statusErr = "expected ftyp and moov as first boxes"
		}
		return resultMessage{FileID: fileID, Status: "Failed", ErrorMessage: statusErr}
	}

	return resultMessage{FileID: fileID, Status: "Successful", ProcessedPath: outputPath}
}

func envOrDefault(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
