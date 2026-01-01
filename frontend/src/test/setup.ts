import '@testing-library/jest-dom'

// Mock fetch globally
global.fetch = vi.fn()

// Mock crypto.randomUUID
if (!global.crypto) {
  global.crypto = {} as Crypto
}
global.crypto.randomUUID = vi.fn(() => '12345678-1234-1234-1234-123456789012')

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
})
