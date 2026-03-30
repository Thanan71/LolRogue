#!/usr/bin/env bash
# updates memory files after each task

# Get current date
CURRENT_DATE=$(date +%Y-%m-%d)

# Path constants
MEMORY_DIR="memory"
ACTIVE="$MEMORY_DIR/active-context.md"
PROGRESS="$MEMORY_DIR/progress.md"
ARCHIVE_DIR="$MEMORY_DIR/archive"

# Ensure directories exist
mkdir -p "$ARCHIVE_DIR"

# Check for "context transfer" or "new task" trigger
TRIGGER="${1:-}"

# Capture output of the task that just ran
TASK_OUTPUT=""
if [ -n "$CLAUDE_TASK_RESULT" ]; then
  TASK_OUTPUT="$CLAUDE_TASK_RESULT"
elif [ -n "$1" ] && [ "$1" != "update" ]; then
  TASK_OUTPUT="$*"
fi

# Extract key decisions and file paths from output
DECISIONS=$(echo "$TASK_OUTPUT" | grep -i "decision\|changed\|added\|modified\|created" | head -5)
FILES_CHANGED=$(echo "$TASK_OUTPUT" | grep -oE "[a-zA-Z0-9_/-]+\.(ts|tsx|js|json|md)" | sort -u | tr '\n' ', ' | sed 's/,$//')

# Update active-context.md
update_active_context() {
  local content=""
  
  # Check if file exists
  if [ -f "$ACTIVE" ]; then
    content=$(cat "$ACTIVE")
  fi

  # Update last updated date
  if grep -q "Last Updated" "$ACTIVE" 2>/dev/null; then
    sed -i.bak "s/Last Updated:.*/Last Updated: $CURRENT_DATE/" "$ACTIVE" && rm -f "$ACTIVE.bak"
  fi

  # Add recent decision if found
  if [ -n "$DECISIONS" ]; then
    # Append to recent decisions section
    echo "" >> "$ACTIVE"
    echo "### $CURRENT_DATE" >> "$ACTIVE"
    echo "$DECISIONS" >> "$ACTIVE"
  fi

  # Add files changed if found
  if [ -n "$FILES_CHANGED" ]; then
    echo "- **Files:** $FILES_CHANGED" >> "$ACTIVE"
  fi
}

# Update progress.md
update_progress() {
  if [ -f "$PROGRESS" ]; then
    # Update last updated date
    sed -i.bak "s/Last Updated:.*/Last Updated: $CURRENT_DATE/" "$PROGRESS" && rm -f "$PROGRESS.bak"
    
    # Find last completed task number
    LAST_TASK=$(grep -oE "^\*\*Task [0-9]+" "$PROGRESS" | tail -1 | grep -oE "[0-9]+")
    if [ -n "$LAST_TASK" ]; then
      NEXT_TASK=$((LAST_TASK + 1))
      # Mark last task as complete
      sed -i.bak "s/^\(\*\*Task $LAST_TASK.*\)🔲/\1✅/" "$PROGRESS" && rm -f "$PROGRESS.bak"
    fi
  fi
}

# Archive old memories if file is getting too large
archive_if_needed() {
  if [ -f "$ACTIVE" ]; then
    LINE_COUNT=$(wc -l < "$ACTIVE")
    if [ "$LINE_COUNT" -gt 200 ]; then
      ARCHIVE_FILE="$ARCHIVE_DIR/active-context-$CURRENT_DATE.md"
      cp "$ACTIVE" "$ARCHIVE_FILE"
      # Reset to just recent decisions
      echo "# Active Context" > "$ACTIVE"
      echo "" >> "$ACTIVE"
      echo "Last Updated: $CURRENT_DATE" >> "$ACTIVE"
      echo "Archived: $ARCHIVE_FILE" >> "$ACTIVE"
    fi
  fi
}

# Run updates
if [ "$TRIGGER" = "update" ]; then
  update_active_context
  update_progress
  archive_if_needed
  echo "✅ Memory files updated"
else
  echo "Usage: ./update-memory.sh update"
  echo "Run after completing tasks to update memory files"
fi