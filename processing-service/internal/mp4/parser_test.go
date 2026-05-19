package mp4

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
)

func makeBox(name string, data []byte) []byte {
	buf := make([]byte, 8+len(data))
	binary.BigEndian.PutUint32(buf[:4], uint32(len(buf)))
	copy(buf[4:8], []byte(name))
	copy(buf[8:], data)
	return buf
}

func TestExtractInitializationSegment(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "video.mp4")

	ftyp := makeBox("ftyp", []byte{1, 2, 3})
	moov := makeBox("moov", []byte{4, 5})
	mdat := makeBox("mdat", []byte{9, 8, 7})

	if err := os.WriteFile(source, append(append(ftyp, moov...), mdat...), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	outPath, err := ExtractInitializationSegment(source, dir)
	if err != nil {
		t.Fatalf("extract init segment: %v", err)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}

	expected := append(ftyp, moov...)
	if string(data) != string(expected) {
		t.Fatalf("unexpected output bytes")
	}
}

func TestExtractInitializationSegmentUnexpectedBoxes(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "video.mp4")

	bad := makeBox("moov", []byte{1, 2, 3})
	if err := os.WriteFile(source, bad, 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	_, err := ExtractInitializationSegment(source, dir)
	if err == nil {
		t.Fatal("expected error")
	}
}
