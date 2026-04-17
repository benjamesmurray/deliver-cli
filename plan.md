# Implementation Plan to Address User Feedback

## 1. Fix "State Anxiety" (Backtracking)

**Root Cause:**
The agent lacks confidence that its file modifications (like editing a requirements document) have successfully updated the internal state machine. To check or "refresh" the state, it mistakenly calls `sc_init`, which causes a reset/re-scaffolding and leads to a loop.

**Implementation Steps:**
1. **Add `sc_refresh` Tool:** 
   - Add a new MCP tool `sc_refresh` in `src/tools/specTools.ts`. Under the hood, this tool will execute the existing `spec-cli verify` or `spec-cli status` command to perform a health check and print the current state.
2. **Update OpenAPI Definition:**
   - Define `sc_refresh` in `api/spec-workflow.openapi.yaml` with a clear description: "Force a refresh and synchronization of the internal workflow state machine after editing a document. Use this to verify action persistence."
3. **Update System Prompts:**
   - In `api/spec-workflow.openapi.yaml`, modify the instructions to explicitly state: "To verify your actions have persisted and to refresh the state, use `sc_refresh`. **NEVER** use `sc_init` to refresh the state, as it will reset the workflow."

## 2. Fix "Edit Tool Context Mismatch"

**Root Cause:**
When trying to remove `<template-requirements>`, `<template-design>`, etc., the standard `edit` tool (which relies on exact string matching) often fails because local MoE models struggle to reproduce the exact whitespace, newlines, and indentation found in the document.

**Implementation Steps:**
1. **Create `sc_complete_template` Tool:**
   - In `src/tools/specTools.ts`, register a new MCP tool named `sc_complete_template`.
   - The tool will accept an input parameter `document` (enum: `requirements`, `design`, `tasks`, `testing`) and an optional `feature` name.
2. **Implement Programmatic Tag Removal:**
   - The tool's handler will resolve the correct file path using `SpecManager.resolveFeaturePath` and `WorkflowStateRepository.getStageFileName`.
   - It will read the file and use a Regular Expression (e.g., `/<template-\w+>[\s\S]*?<\/template-\w+>/g`) to find and remove the tags and their placeholder contents programmatically.
   - It will then write the updated content back to the file and return a success message along with the new `sc_status`.
3. **Update OpenAPI Instructions:**
   - Add `sc_complete_template` to `api/spec-workflow.openapi.yaml`.
   - Modify the workflow guidance for all phases to say: "After completing your edits, do NOT use the standard edit tool to remove the template tags. Instead, call `sc_complete_template` to finalize the document, then call `sc_status` (or `sc_refresh`) to verify."