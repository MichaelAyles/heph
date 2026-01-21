-- Hard rejection criteria for instant rejection without LLM call
-- Pattern-based matching for known unsupported categories

CREATE TABLE IF NOT EXISTS hard_rejection_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL,
  reason TEXT NOT NULL,
  category TEXT NOT NULL, -- 'safety', 'capability', 'legal'
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for active criteria lookup
CREATE INDEX IF NOT EXISTS idx_hard_rejection_active ON hard_rejection_criteria(is_active);
CREATE INDEX IF NOT EXISTS idx_hard_rejection_category ON hard_rejection_criteria(category);

-- Seed initial rejection criteria
-- Category: capability (beyond our hardware/software capabilities)
INSERT INTO hard_rejection_criteria (pattern, reason, category) VALUES
('FPGA|fpga|field.programmable', 'FPGA designs require specialized tooling and expertise not available in PHAESTUS.', 'capability'),
('ASIC|asic|custom.chip', 'Custom chip design requires semiconductor fabrication capabilities beyond our scope.', 'capability'),
('quantum|qubit', 'Quantum computing hardware requires specialized equipment and environments.', 'capability'),
('neural.implant|brain.interface|BCI', 'Neural interfaces require medical-grade components and regulatory approval.', 'capability'),
('precision.analog|sub.millivolt|microvolt', 'High-precision analog circuits require specialized components and calibration.', 'capability');

-- Category: safety (dangerous voltage, current, or materials)
INSERT INTO hard_rejection_criteria (pattern, reason, category) VALUES
('high.voltage|mains|AC.power|120V|240V|110V|220V', 'High voltage designs require safety certifications and specialized components.', 'safety'),
('industrial.motor|three.phase|3.phase', 'Industrial motor control requires safety interlocks and certified components.', 'safety'),
('laser.cutting|high.power.laser', 'High-power laser systems require safety enclosures and certifications.', 'safety'),
('radioactive|nuclear|radiation.source', 'Radioactive materials require specialized handling and licensing.', 'safety'),
('explosive|detonator|igniter', 'Explosive devices are prohibited.', 'safety');

-- Category: legal (regulatory or legal restrictions)
INSERT INTO hard_rejection_criteria (pattern, reason, category) VALUES
('medical.device|diagnostic|FDA|healthcare', 'Medical devices require FDA/regulatory approval and clinical validation.', 'legal'),
('weapon|firearm|gun|ammunition', 'Weapon-related devices are prohibited.', 'legal'),
('surveillance|spy|covert.monitoring', 'Covert surveillance devices may violate privacy laws.', 'legal'),
('jamming|signal.blocking|RF.interference', 'Signal jamming devices are illegal in most jurisdictions.', 'legal'),
('drug.synthesis|chemical.reactor', 'Drug synthesis equipment requires DEA licensing.', 'legal');
