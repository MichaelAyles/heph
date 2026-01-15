-- Migration: Complete Orchestrator Graph Edges
-- Adds missing edges for loops and Command API routing

-- =============================================================================
-- ADD MISSING ENCLOSURE EDGES
-- =============================================================================

-- Re-review loop (decide can send back to review for different feedback)
INSERT OR IGNORE INTO orchestrator_edges (id, from_node, to_node, condition_name, condition_label, edge_type) VALUES
('edge_decide_rereview', 'decideEnclosure', 'reviewEnclosure', 'reReview', 'Re-Review', 'loop');

-- Request user input edge
INSERT OR IGNORE INTO orchestrator_edges (id, from_node, to_node, condition_name, condition_label, edge_type) VALUES
('edge_decide_userinput', 'decideEnclosure', 'requestUserInput', 'needsInput', 'Needs Input', 'conditional');

-- =============================================================================
-- ADD MISSING FIRMWARE EDGES
-- =============================================================================

-- Re-review loop
INSERT OR IGNORE INTO orchestrator_edges (id, from_node, to_node, condition_name, condition_label, edge_type) VALUES
('edge_firmware_rereview', 'decideFirmware', 'reviewFirmware', 'reReview', 'Re-Review', 'loop');

-- Request user input edge
INSERT OR IGNORE INTO orchestrator_edges (id, from_node, to_node, condition_name, condition_label, edge_type) VALUES
('edge_firmware_userinput', 'decideFirmware', 'requestUserInput', 'needsInput', 'Needs Input', 'conditional');

-- =============================================================================
-- ADD USER INPUT RESUME EDGES
-- =============================================================================

-- After user provides input, resume at decide nodes to re-evaluate
INSERT OR IGNORE INTO orchestrator_edges (id, from_node, to_node, condition_name, condition_label, edge_type) VALUES
('edge_userinput_enclosure', 'requestUserInput', 'decideEnclosure', 'enclosure', 'Resume Enclosure', 'conditional'),
('edge_userinput_firmware', 'requestUserInput', 'decideFirmware', 'firmware', 'Resume Firmware', 'conditional');

-- =============================================================================
-- ADD MISSING PCB VALIDATION LOOP
-- =============================================================================

-- If PCB validation fails, retry block selection
INSERT OR IGNORE INTO orchestrator_edges (id, from_node, to_node, condition_name, condition_label, edge_type) VALUES
('edge_validate_retry', 'validatePcb', 'selectBlocks', 'invalid', 'Retry', 'loop');
