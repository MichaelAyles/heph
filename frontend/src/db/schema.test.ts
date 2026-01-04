import { describe, it, expect } from 'vitest'
import {
  userFromRow,
  sessionFromRow,
  projectFromRow,
  blockFromRow,
  settingsFromRow,
  type UserRow,
  type SessionRow,
  type ProjectRow,
  type PcbBlockRow,
  type SettingsRow,
} from './schema'

describe('schema transform functions', () => {
  describe('userFromRow', () => {
    it('should transform snake_case to camelCase', () => {
      const row: UserRow = {
        id: 'user-123',
        username: 'testuser',
        password_hash: 'hashed',
        display_name: 'Test User',
        created_at: '2024-01-01T00:00:00Z',
        last_login_at: '2024-01-02T00:00:00Z',
      }

      const result = userFromRow(row)

      expect(result).toEqual({
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
        createdAt: '2024-01-01T00:00:00Z',
        lastLoginAt: '2024-01-02T00:00:00Z',
      })
    })

    it('should handle null display_name', () => {
      const row: UserRow = {
        id: 'user-123',
        username: 'testuser',
        password_hash: 'hashed',
        display_name: null,
        created_at: '2024-01-01T00:00:00Z',
        last_login_at: null,
      }

      const result = userFromRow(row)

      expect(result.displayName).toBeNull()
      expect(result.lastLoginAt).toBeNull()
    })

    it('should not include password_hash in output', () => {
      const row: UserRow = {
        id: 'user-123',
        username: 'testuser',
        password_hash: 'secret',
        display_name: null,
        created_at: '2024-01-01T00:00:00Z',
        last_login_at: null,
      }

      const result = userFromRow(row)

      expect(result).not.toHaveProperty('password_hash')
      expect(result).not.toHaveProperty('passwordHash')
    })
  })

  describe('sessionFromRow', () => {
    it('should transform snake_case to camelCase', () => {
      const row: SessionRow = {
        id: 'session-123',
        user_id: 'user-456',
        expires_at: '2024-01-08T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
      }

      const result = sessionFromRow(row)

      expect(result).toEqual({
        id: 'session-123',
        userId: 'user-456',
        expiresAt: '2024-01-08T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
      })
    })
  })

  describe('projectFromRow', () => {
    it('should transform snake_case to camelCase', () => {
      const row: ProjectRow = {
        id: 'proj-123',
        user_id: 'user-456',
        name: 'My Project',
        description: 'A test project',
        status: 'draft',
        spec: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      }

      const result = projectFromRow(row)

      expect(result).toEqual({
        id: 'proj-123',
        userId: 'user-456',
        name: 'My Project',
        description: 'A test project',
        status: 'draft',
        spec: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      })
    })

    it('should parse spec JSON when present', () => {
      const spec = {
        description: 'test',
        requirements: [],
        decisions: [],
      }
      const row: ProjectRow = {
        id: 'proj-123',
        user_id: 'user-456',
        name: 'My Project',
        description: 'A test project',
        status: 'analyzing',
        spec: JSON.stringify(spec),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      }

      const result = projectFromRow(row)

      expect(result.spec).toEqual(spec)
    })

    it('should handle null spec', () => {
      const row: ProjectRow = {
        id: 'proj-123',
        user_id: 'user-456',
        name: 'My Project',
        description: null,
        status: 'draft',
        spec: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      }

      const result = projectFromRow(row)

      expect(result.spec).toBeNull()
      expect(result.description).toBeNull()
    })

    it('should preserve all valid status types', () => {
      const statuses = [
        'draft',
        'analyzing',
        'rejected',
        'refining',
        'generating',
        'selecting',
        'finalizing',
        'complete',
      ]

      statuses.forEach((status) => {
        const row: ProjectRow = {
          id: 'proj-123',
          user_id: 'user-456',
          name: 'My Project',
          description: null,
          status,
          spec: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        }

        const result = projectFromRow(row)
        expect(result.status).toBe(status)
      })
    })
  })

  describe('blockFromRow', () => {
    it('should transform snake_case to camelCase', () => {
      const row: PcbBlockRow = {
        id: 'block-123',
        slug: 'esp32-c6',
        name: 'ESP32-C6',
        category: 'mcu',
        description: 'Main MCU block',
        width_units: 2,
        height_units: 3,
        taps: JSON.stringify([{ net: 'VCC' }, { net: 'GND' }]),
        i2c_addresses: null,
        spi_cs: null,
        power: JSON.stringify({ currentMaxMa: 150 }),
        components: JSON.stringify([{ ref: 'U1', value: 'ESP32-C6', package: 'QFN' }]),
        is_validated: 1,
        is_active: 1,
        edges: null,
        files: null,
        net_mappings: null,
      }

      const result = blockFromRow(row)

      expect(result).toEqual({
        id: 'block-123',
        slug: 'esp32-c6',
        name: 'ESP32-C6',
        category: 'mcu',
        description: 'Main MCU block',
        widthUnits: 2,
        heightUnits: 3,
        taps: [{ net: 'VCC' }, { net: 'GND' }],
        i2cAddresses: null,
        spiCs: null,
        power: { currentMaxMa: 150 },
        components: [{ ref: 'U1', value: 'ESP32-C6', package: 'QFN' }],
        isValidated: true,
        edges: undefined,
        files: undefined,
        netMappings: undefined,
      })
    })

    it('should parse i2c_addresses when present', () => {
      const row: PcbBlockRow = {
        id: 'block-123',
        slug: 'bme280',
        name: 'BME280',
        category: 'sensor',
        description: null,
        width_units: 1,
        height_units: 1,
        taps: '[]',
        i2c_addresses: JSON.stringify(['0x76', '0x77']),
        spi_cs: null,
        power: null,
        components: null,
        is_validated: 0,
        is_active: 1,
        edges: null,
        files: null,
        net_mappings: null,
      }

      const result = blockFromRow(row)

      expect(result.i2cAddresses).toEqual(['0x76', '0x77'])
    })

    it('should handle null/empty taps', () => {
      const row: PcbBlockRow = {
        id: 'block-123',
        slug: 'test',
        name: 'Test',
        category: 'utility',
        description: null,
        width_units: 1,
        height_units: 1,
        taps: '',
        i2c_addresses: null,
        spi_cs: null,
        power: null,
        components: null,
        is_validated: 1,
        is_active: 1,
        edges: null,
        files: null,
        net_mappings: null,
      }

      const result = blockFromRow(row)

      expect(result.taps).toEqual([])
    })

    it('should handle null power', () => {
      const row: PcbBlockRow = {
        id: 'block-123',
        slug: 'test',
        name: 'Test',
        category: 'utility',
        description: null,
        width_units: 1,
        height_units: 1,
        taps: '[]',
        i2c_addresses: null,
        spi_cs: null,
        power: null,
        components: null,
        is_validated: 1,
        is_active: 1,
        edges: null,
        files: null,
        net_mappings: null,
      }

      const result = blockFromRow(row)

      expect(result.power).toEqual({ currentMaxMa: 0 })
    })

    it('should convert is_validated 0/1 to boolean', () => {
      const row1: PcbBlockRow = {
        id: 'block-1',
        slug: 'test1',
        name: 'Test 1',
        category: 'sensor',
        description: null,
        width_units: 1,
        height_units: 1,
        taps: '[]',
        i2c_addresses: null,
        spi_cs: null,
        power: null,
        components: null,
        is_validated: 1,
        is_active: 1,
        edges: null,
        files: null,
        net_mappings: null,
      }

      const row2: PcbBlockRow = {
        id: 'block-2',
        slug: 'test2',
        name: 'Test 2',
        category: 'sensor',
        description: null,
        width_units: 1,
        height_units: 1,
        taps: '[]',
        i2c_addresses: null,
        spi_cs: null,
        power: null,
        components: null,
        is_validated: 0,
        is_active: 1,
        edges: null,
        files: null,
        net_mappings: null,
      }

      expect(blockFromRow(row1).isValidated).toBe(true)
      expect(blockFromRow(row2).isValidated).toBe(false)
    })

    it('should handle all block categories', () => {
      const categories = ['mcu', 'power', 'sensor', 'output', 'connector', 'utility']

      categories.forEach((category) => {
        const row: PcbBlockRow = {
          id: 'block-123',
          slug: 'test',
          name: 'Test',
          category,
          description: null,
          width_units: 1,
          height_units: 1,
          taps: '[]',
          i2c_addresses: null,
          spi_cs: null,
          power: null,
          components: null,
          is_validated: 1,
          is_active: 1,
          edges: null,
          files: null,
          net_mappings: null,
        }

        const result = blockFromRow(row)
        expect(result.category).toBe(category)
      })
    })

    it('should use empty string for null description', () => {
      const row: PcbBlockRow = {
        id: 'block-123',
        slug: 'test',
        name: 'Test',
        category: 'utility',
        description: null,
        width_units: 1,
        height_units: 1,
        taps: '[]',
        i2c_addresses: null,
        spi_cs: null,
        power: null,
        components: null,
        is_validated: 1,
        is_active: 1,
        edges: null,
        files: null,
        net_mappings: null,
      }

      const result = blockFromRow(row)

      expect(result.description).toBe('')
    })

    it('should parse edges, files, and netMappings when present', () => {
      const edges = { north: [], south: [], east: [], west: [] }
      const files = { schematic: 'test.kicad_sch', pcb: 'test.kicad_pcb' }
      const netMappings = { GND: { globalNet: 'GND', padRefs: ['U1.1'] } }

      const row: PcbBlockRow = {
        id: 'block-123',
        slug: 'test',
        name: 'Test',
        category: 'mcu',
        description: null,
        width_units: 1,
        height_units: 1,
        taps: '[]',
        i2c_addresses: null,
        spi_cs: null,
        power: null,
        components: null,
        is_validated: 1,
        is_active: 1,
        edges: JSON.stringify(edges),
        files: JSON.stringify(files),
        net_mappings: JSON.stringify(netMappings),
      }

      const result = blockFromRow(row)

      expect(result.edges).toEqual(edges)
      expect(result.files).toEqual(files)
      expect(result.netMappings).toEqual(netMappings)
    })
  })

  describe('settingsFromRow', () => {
    it('should transform snake_case to camelCase', () => {
      const row: SettingsRow = {
        id: 1,
        llm_provider: 'openrouter',
        default_model: 'google/gemini-2.0-flash',
        openrouter_api_key: 'sk-or-123',
        gemini_api_key: null,
        updated_at: '2024-01-01T00:00:00Z',
      }

      const result = settingsFromRow(row)

      expect(result).toEqual({
        id: 1,
        llmProvider: 'openrouter',
        defaultModel: 'google/gemini-2.0-flash',
        openRouterApiKey: 'sk-or-123',
        geminiApiKey: null,
        updatedAt: '2024-01-01T00:00:00Z',
      })
    })

    it('should handle gemini provider', () => {
      const row: SettingsRow = {
        id: 1,
        llm_provider: 'gemini',
        default_model: 'gemini-pro',
        openrouter_api_key: null,
        gemini_api_key: 'AIza-123',
        updated_at: '2024-01-01T00:00:00Z',
      }

      const result = settingsFromRow(row)

      expect(result.llmProvider).toBe('gemini')
      expect(result.geminiApiKey).toBe('AIza-123')
      expect(result.openRouterApiKey).toBeNull()
    })
  })
})
