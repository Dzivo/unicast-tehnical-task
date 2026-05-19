package mp4

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const boxHeaderSize = 8

var (
	ErrInvalidBoxSize     = errors.New("invalid box size")
	ErrUnexpectedInitBox  = errors.New("expected ftyp followed by moov as first two boxes")
	ErrUnsupportedBoxSize = errors.New("large box size (64-bit) is not supported")
)

type boxHeader struct {
	Size uint32
	Type string
}

func readBoxHeader(r io.Reader) (boxHeader, error) {
	header := make([]byte, boxHeaderSize)
	if _, err := io.ReadFull(r, header); err != nil {
		return boxHeader{}, err
	}

	size := binary.BigEndian.Uint32(header[:4])
	if size == 1 {
		return boxHeader{}, ErrUnsupportedBoxSize
	}
	if size < boxHeaderSize {
		return boxHeader{}, ErrInvalidBoxSize
	}

	return boxHeader{Size: size, Type: string(header[4:8])}, nil
}

func ExtractInitializationSegment(srcPath string, outputDir string) (string, error) {
	src, err := os.Open(srcPath)
	if err != nil {
		return "", fmt.Errorf("open source: %w", err)
	}
	defer src.Close()

	ftyp, err := readBoxHeader(src)
	if err != nil {
		return "", fmt.Errorf("read ftyp header: %w", err)
	}
	if ftyp.Type != "ftyp" {
		return "", ErrUnexpectedInitBox
	}

	ftypBody := make([]byte, ftyp.Size-boxHeaderSize)
	if _, err := io.ReadFull(src, ftypBody); err != nil {
		return "", fmt.Errorf("read ftyp body: %w", err)
	}

	moov, err := readBoxHeader(src)
	if err != nil {
		return "", fmt.Errorf("read moov header: %w", err)
	}
	if moov.Type != "moov" {
		return "", ErrUnexpectedInitBox
	}

	moovBody := make([]byte, moov.Size-boxHeaderSize)
	if _, err := io.ReadFull(src, moovBody); err != nil {
		return "", fmt.Errorf("read moov body: %w", err)
	}

	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return "", fmt.Errorf("create output directory: %w", err)
	}

	base := filepath.Base(srcPath)
	destination := filepath.Join(outputDir, fmt.Sprintf("%s.init.mp4", base))
	out, err := os.Create(destination)
	if err != nil {
		return "", fmt.Errorf("create output file: %w", err)
	}
	defer out.Close()

	if err := writeBox(out, ftyp, ftypBody); err != nil {
		return "", err
	}
	if err := writeBox(out, moov, moovBody); err != nil {
		return "", err
	}

	return destination, nil
}

func writeBox(w io.Writer, header boxHeader, body []byte) error {
	buf := make([]byte, boxHeaderSize)
	binary.BigEndian.PutUint32(buf[:4], header.Size)
	copy(buf[4:], []byte(header.Type))

	if _, err := w.Write(buf); err != nil {
		return fmt.Errorf("write box header: %w", err)
	}
	if _, err := w.Write(body); err != nil {
		return fmt.Errorf("write box body: %w", err)
	}
	return nil
}
