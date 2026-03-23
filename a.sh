# scan_project.sh
# Scans all Rust and TypeScript files in src/ and src-tauri/ directories
# Usage: ./scan_project.sh [project_root]

PROJECT_DIR="${1:-.}"
SRC_DIR="$PROJECT_DIR/src"
TAURI_DIR="$PROJECT_DIR/src-tauri"
OUTPUT_FILE="$PROJECT_DIR/scan_output.txt"

# Colors for terminal
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

log() { echo -e "${CYAN}$1${NC}"; }
section() { echo -e "\n${YELLOW}==============================${NC}"; echo -e "${YELLOW} $1${NC}"; echo -e "${YELLOW}==============================${NC}"; }

{
  section "PROJECT STRUCTURE"
  echo ""
  echo "--- src/ (TypeScript/TSX) ---"
  find "$SRC_DIR" -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | sort

  echo ""
  echo "--- src-tauri/ (Rust) ---"
  find "$TAURI_DIR" -type f -name "*.rs" 2>/dev/null | sort

  # ─── TypeScript / TSX Files ───────────────────────────────────────────────
  section "TYPESCRIPT / TSX FILES CONTENT"

  while IFS= read -r file; do
    echo ""
    echo "================================================================"
    echo "FILE: $file"
    echo "================================================================"
    cat "$file"
    echo ""
  done < <(find "$SRC_DIR" -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | sort)

  # ─── Rust Files ───────────────────────────────────────────────────────────
  section "RUST FILES CONTENT"

  while IFS= read -r file; do
    echo ""
    echo "================================================================"
    echo "FILE: $file"
    echo "================================================================"
    cat "$file"
    echo ""
  done < <(find "$TAURI_DIR" -type f -name "*.rs" 2>/dev/null | sort)

  # ─── Piano / Key / Song Related Snippets ──────────────────────────────────
  section "PIANO / KEY / SONG / BUFFER RELATED SNIPPETS"

  echo ""
  echo "--- Matches in src/ ---"
  grep -rn \
    -e "piano" -e "Piano" \
    -e "rain" -e "Rain" \
    -e "song" -e "Song" \
    -e "selector" -e "Selector" \
    -e "buffer" -e "Buffer" \
    -e "keyPress\|key_press\|onPress\|on_press\|handleKey\|handle_key" \
    -e "touch\|Touch" \
    --include="*.ts" --include="*.tsx" \
    "$SRC_DIR" 2>/dev/null

  echo ""
  echo "--- Matches in src-tauri/ ---"
  grep -rn \
    -e "piano" -e "Piano" \
    -e "rain" -e "Rain" \
    -e "song" -e "Song" \
    -e "selector" -e "Selector" \
    -e "buffer" -e "Buffer" \
    -e "key_press\|handle_key\|play_note\|play_key" \
    -e "touch\|Touch" \
    --include="*.rs" \
    "$TAURI_DIR" 2>/dev/null

  # ─── Summary ──────────────────────────────────────────────────────────────
  section "SUMMARY"

  TS_COUNT=$(find "$SRC_DIR" -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | wc -l)
  RS_COUNT=$(find "$TAURI_DIR" -type f -name "*.rs" 2>/dev/null | wc -l)

  echo ""
  echo "TypeScript/TSX files scanned : $TS_COUNT"
  echo "Rust files scanned           : $RS_COUNT"
  echo "Output saved to              : $OUTPUT_FILE"

} | tee "$OUTPUT_FILE"

log "\nDone! Full scan saved to: $OUTPUT_FILE"
