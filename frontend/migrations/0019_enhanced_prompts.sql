-- Migration 0019: Enhanced orchestrator_prompts
-- Adds input/output schemas, context selectors, iteration config, and user prompt templates
-- for dynamic, admin-configurable prompt execution

-- Add new columns to orchestrator_prompts
ALTER TABLE orchestrator_prompts ADD COLUMN input_schema TEXT;  -- JSON: Zod-compatible schema for required inputs
ALTER TABLE orchestrator_prompts ADD COLUMN output_schema TEXT;  -- JSON: Schema for validating LLM outputs
ALTER TABLE orchestrator_prompts ADD COLUMN context_selector TEXT;  -- JSON array: Which spec fields to include
ALTER TABLE orchestrator_prompts ADD COLUMN iteration_config TEXT;  -- JSON: { maxAttempts, exitCondition, exitThreshold }
ALTER TABLE orchestrator_prompts ADD COLUMN user_prompt_template TEXT;  -- Template with {{variable}} placeholders
ALTER TABLE orchestrator_prompts ADD COLUMN output_format TEXT DEFAULT 'json' CHECK (output_format IN ('json', 'code', 'text', 'image_prompt'));

-- Add context_tags column if it doesn't exist (it was added in migration 0016 but we need to ensure it's here)
-- This is a no-op if the column already exists, but SQLite will error if we try to add it again
-- So we'll use a conditional approach via a dummy select

-- Update existing prompts with context selectors and output formats

-- Orchestrator agent
UPDATE orchestrator_prompts SET
  context_selector = '["*"]',
  output_format = 'json',
  iteration_config = '{"maxAttempts": 100, "exitCondition": "stages.export.status === ''complete''"}',
  user_prompt_template = 'User request: {{description}}

Mode: {{mode}}

{{#if existingSpec}}
Current project state:
{{existingSpec}}
{{/if}}

{{#if stageStatus}}
Stage completion status:
- Spec: {{stageStatus.spec}}
- PCB: {{stageStatus.pcb}}
- Enclosure: {{stageStatus.enclosure}}
- Firmware: {{stageStatus.firmware}}
- Export: {{stageStatus.export}}
{{/if}}'
WHERE node_name = 'orchestrator';

-- Feasibility analyzer
UPDATE orchestrator_prompts SET
  context_selector = '["description"]',
  output_format = 'json',
  input_schema = '{
    "type": "object",
    "properties": {
      "description": { "type": "string", "minLength": 10, "maxLength": 2000 }
    },
    "required": ["description"]
  }',
  output_schema = '{
    "type": "object",
    "properties": {
      "communication": {
        "type": "object",
        "properties": {
          "type": { "type": "string" },
          "confidence": { "type": "number", "minimum": 0, "maximum": 100 },
          "notes": { "type": "string" }
        },
        "required": ["type", "confidence", "notes"]
      },
      "processing": {
        "type": "object",
        "properties": {
          "level": { "type": "string" },
          "confidence": { "type": "number", "minimum": 0, "maximum": 100 },
          "notes": { "type": "string" }
        },
        "required": ["level", "confidence", "notes"]
      },
      "power": {
        "type": "object",
        "properties": {
          "options": { "type": "array", "items": { "type": "string" } },
          "confidence": { "type": "number", "minimum": 0, "maximum": 100 },
          "notes": { "type": "string" }
        },
        "required": ["options", "confidence", "notes"]
      },
      "inputs": {
        "type": "object",
        "properties": {
          "items": { "type": "array", "items": { "type": "string" } },
          "confidence": { "type": "number", "minimum": 0, "maximum": 100 }
        },
        "required": ["items", "confidence"]
      },
      "outputs": {
        "type": "object",
        "properties": {
          "items": { "type": "array", "items": { "type": "string" } },
          "confidence": { "type": "number", "minimum": 0, "maximum": 100 }
        },
        "required": ["items", "confidence"]
      },
      "overallScore": { "type": "number", "minimum": 0, "maximum": 100 },
      "manufacturable": { "type": "boolean" },
      "rejectionReason": { "type": "string" }
    },
    "required": ["communication", "processing", "power", "inputs", "outputs", "overallScore", "manufacturable"]
  }',
  user_prompt_template = 'Analyze this product description for manufacturability:

{{description}}

Respond with a JSON object containing your analysis.'
WHERE node_name = 'feasibility';

-- Enclosure generator
UPDATE orchestrator_prompts SET
  context_selector = '["finalSpec.pcbSize", "finalSpec.inputs", "finalSpec.outputs", "finalSpec.enclosure", "blueprints[selectedBlueprint]"]',
  output_format = 'code',
  input_schema = '{
    "type": "object",
    "properties": {
      "style": { "type": "string", "enum": ["desktop", "handheld", "wall-mount", "minimal"] },
      "pcbSize": {
        "type": "object",
        "properties": {
          "width": { "type": "number" },
          "height": { "type": "number" },
          "unit": { "type": "string" }
        },
        "required": ["width", "height"]
      },
      "feedback": { "type": "string" }
    },
    "required": ["style", "pcbSize"]
  }',
  user_prompt_template = 'Generate an OpenSCAD enclosure with these specifications:

Style: {{style}}
PCB Size: {{pcbSize.width}}mm x {{pcbSize.height}}mm

Inputs requiring apertures:
{{#each inputs}}
- {{this.type}} ({{this.count}}x): {{this.notes}}
{{/each}}

Outputs requiring apertures:
{{#each outputs}}
- {{this.type}} ({{this.count}}x): {{this.notes}}
{{/each}}

{{#if feedback}}
IMPORTANT - Fix these issues from previous attempt:
{{feedback}}
{{/if}}'
WHERE node_name = 'enclosure';

-- Vision-enabled enclosure generator
UPDATE orchestrator_prompts SET
  context_selector = '["finalSpec.pcbSize", "finalSpec.inputs", "finalSpec.outputs", "blueprints[selectedBlueprint]"]',
  output_format = 'code',
  input_schema = '{
    "type": "object",
    "properties": {
      "blueprintUrl": { "type": "string", "format": "uri" },
      "pcbSize": {
        "type": "object",
        "properties": {
          "width": { "type": "number" },
          "height": { "type": "number" }
        },
        "required": ["width", "height"]
      },
      "features": { "type": "array", "items": { "type": "string" } },
      "feedback": { "type": "string" }
    },
    "required": ["blueprintUrl", "pcbSize", "features"]
  }',
  user_prompt_template = 'Study the blueprint image and generate an OpenSCAD enclosure that matches its form factor.

PCB Size: {{pcbSize.width}}mm x {{pcbSize.height}}mm

Features needing apertures:
{{#each features}}
- {{this}}
{{/each}}

{{#if feedback}}
IMPORTANT - Fix these issues:
{{feedback}}
{{/if}}'
WHERE node_name = 'enclosure_vision';

-- Firmware generator
UPDATE orchestrator_prompts SET
  context_selector = '["finalSpec", "pcb.netList", "pcb.placedBlocks"]',
  output_format = 'json',
  input_schema = '{
    "type": "object",
    "properties": {
      "finalSpec": { "type": "object" },
      "netList": { "type": "array" },
      "placedBlocks": { "type": "array" },
      "feedback": { "type": "string" }
    },
    "required": ["finalSpec"]
  }',
  output_schema = '{
    "type": "object",
    "properties": {
      "files": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "path": { "type": "string" },
            "content": { "type": "string" },
            "language": { "type": "string", "enum": ["cpp", "c", "h", "json"] }
          },
          "required": ["path", "content", "language"]
        }
      }
    },
    "required": ["files"]
  }',
  user_prompt_template = 'Generate ESP32-C6 firmware for this project:

Project Name: {{finalSpec.name}}
Summary: {{finalSpec.summary}}

Inputs:
{{#each finalSpec.inputs}}
- {{this.type}} ({{this.count}}x): {{this.notes}}
{{/each}}

Outputs:
{{#each finalSpec.outputs}}
- {{this.type}} ({{this.count}}x): {{this.notes}}
{{/each}}

Power: {{finalSpec.power.source}} ({{finalSpec.power.voltage}})
Communication: {{finalSpec.communication.type}} - {{finalSpec.communication.protocol}}

{{#if netList}}
Pin Assignments from PCB:
{{#each netList}}
- {{this.net}} -> {{this.gpio}}
{{/each}}
{{/if}}

{{#if feedback}}
IMPORTANT - Fix these issues:
{{feedback}}
{{/if}}'
WHERE node_name = 'firmware';

-- Naming generator
UPDATE orchestrator_prompts SET
  context_selector = '["description", "feasibility", "decisions"]',
  output_format = 'json',
  output_schema = '{
    "type": "object",
    "properties": {
      "names": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string", "maxLength": 15 },
            "style": { "type": "string", "enum": ["descriptive", "abstract", "portmanteau", "punchy"] },
            "reasoning": { "type": "string" }
          },
          "required": ["name", "style", "reasoning"]
        },
        "minItems": 4,
        "maxItems": 4
      }
    },
    "required": ["names"]
  }',
  user_prompt_template = 'Generate 4 creative names for this hardware project:

Description: {{description}}

Key features:
{{#if feasibility}}
- Communication: {{feasibility.communication.type}}
- Power: {{feasibility.power.options}}
- Inputs: {{feasibility.inputs.items}}
- Outputs: {{feasibility.outputs.items}}
{{/if}}

{{#if decisions}}
User decisions:
{{#each decisions}}
- {{this.question}}: {{this.answer}}
{{/each}}
{{/if}}'
WHERE node_name = 'naming';

-- Enclosure reviewer
UPDATE orchestrator_prompts SET
  context_selector = '["finalSpec", "enclosure.openScadCode"]',
  output_format = 'json',
  input_schema = '{
    "type": "object",
    "properties": {
      "openScadCode": { "type": "string" },
      "finalSpec": { "type": "object" }
    },
    "required": ["openScadCode", "finalSpec"]
  }',
  output_schema = '{
    "type": "object",
    "properties": {
      "score": { "type": "number", "minimum": 0, "maximum": 100 },
      "verdict": { "type": "string", "enum": ["accept", "revise", "reject"] },
      "issues": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "severity": { "type": "string", "enum": ["critical", "warning", "info"] },
            "category": { "type": "string", "enum": ["dimensions", "cutouts", "assembly", "printability", "code"] },
            "description": { "type": "string" },
            "suggestion": { "type": "string" }
          },
          "required": ["severity", "category", "description", "suggestion"]
        }
      },
      "positives": { "type": "array", "items": { "type": "string" } },
      "summary": { "type": "string" }
    },
    "required": ["score", "verdict", "issues", "positives", "summary"]
  }',
  iteration_config = '{"maxAttempts": 3, "exitCondition": "score >= 85 && verdict === ''accept''", "exitThreshold": 85}',
  user_prompt_template = 'Review this OpenSCAD enclosure code against the project specification:

## Project Specification
PCB Size: {{finalSpec.pcbSize.width}}mm x {{finalSpec.pcbSize.height}}mm

Inputs:
{{#each finalSpec.inputs}}
- {{this.type}} ({{this.count}}x): {{this.notes}}
{{/each}}

Outputs:
{{#each finalSpec.outputs}}
- {{this.type}} ({{this.count}}x): {{this.notes}}
{{/each}}

Enclosure Style: {{finalSpec.enclosure.style}}
Dimensions: {{finalSpec.enclosure.width}}mm x {{finalSpec.enclosure.height}}mm x {{finalSpec.enclosure.depth}}mm

## OpenSCAD Code to Review
```openscad
{{openScadCode}}
```'
WHERE node_name = 'enclosure_review';

-- Firmware reviewer
UPDATE orchestrator_prompts SET
  context_selector = '["finalSpec", "firmware.files", "pcb.netList"]',
  output_format = 'json',
  input_schema = '{
    "type": "object",
    "properties": {
      "files": { "type": "array" },
      "finalSpec": { "type": "object" },
      "netList": { "type": "array" }
    },
    "required": ["files", "finalSpec"]
  }',
  output_schema = '{
    "type": "object",
    "properties": {
      "score": { "type": "number", "minimum": 0, "maximum": 100 },
      "verdict": { "type": "string", "enum": ["accept", "revise", "reject"] },
      "issues": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "severity": { "type": "string", "enum": ["critical", "warning", "info"] },
            "category": { "type": "string", "enum": ["pins", "peripherals", "functionality", "power", "code", "safety"] },
            "file": { "type": "string" },
            "line": { "type": "number" },
            "description": { "type": "string" },
            "suggestion": { "type": "string" }
          },
          "required": ["severity", "category", "description", "suggestion"]
        }
      },
      "positives": { "type": "array", "items": { "type": "string" } },
      "missingFeatures": { "type": "array", "items": { "type": "string" } },
      "summary": { "type": "string" }
    },
    "required": ["score", "verdict", "issues", "positives", "missingFeatures", "summary"]
  }',
  iteration_config = '{"maxAttempts": 3, "exitCondition": "score >= 85 && verdict === ''accept''", "exitThreshold": 85}',
  user_prompt_template = 'Review this ESP32-C6 firmware against the project specification:

## Project Specification
Name: {{finalSpec.name}}
Summary: {{finalSpec.summary}}

Inputs:
{{#each finalSpec.inputs}}
- {{this.type}} ({{this.count}}x): {{this.notes}}
{{/each}}

Outputs:
{{#each finalSpec.outputs}}
- {{this.type}} ({{this.count}}x): {{this.notes}}
{{/each}}

Power: {{finalSpec.power.source}} ({{finalSpec.power.voltage}})
Communication: {{finalSpec.communication.type}} - {{finalSpec.communication.protocol}}

{{#if netList}}
Expected Pin Assignments:
{{#each netList}}
- {{this.net}} -> {{this.gpio}}
{{/each}}
{{/if}}

## Firmware Files to Review
{{#each files}}
### {{this.path}}
```{{this.language}}
{{this.content}}
```
{{/each}}'
WHERE node_name = 'firmware_review';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orchestrator_prompts_output_format ON orchestrator_prompts(output_format);
