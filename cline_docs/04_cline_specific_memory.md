### Cline-Specific Memory

*   `cline_docs/04_cline_specific_memory.md`: Stores information specific to Cline's (or another AI editor's) usage and workarounds.
    *   **Purpose:** To ensure Cline uses its memory system effectively.
    *   **Action:** Created the directory and initial file.
    *   **Trigger:** After completing each task, run `scripts/bash/update-memory.sh update` to update active-context.md and progress.md.
    *   **Auto-Update Rule:** When you learn something important about the user, the project, or encounter a significant change, immediately update the relevant memory file.
    *   **Memory Decay:** If memory files grow too large (>200 lines), archive old content to `memory/archive/`.
    *   **Session Start:** Always read `memory/active-context.md` first to restore context.