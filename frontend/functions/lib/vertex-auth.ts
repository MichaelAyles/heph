/**
 * Vertex AI Authentication for Cloudflare Workers
 *
 * Exchanges a GCP service account JSON key for an OAuth2 access token
 * using the Web Crypto API (no Node.js dependencies).
 */

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri: string
}

interface TokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

// In-memory token cache (persists across requests in the same isolate)
let cachedToken: { token: string; expiresAt: number } | null = null

/**
 * Import a PEM-encoded RSA private key as a CryptoKey
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers and whitespace
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')

  // Decode base64 to ArrayBuffer
  const binaryString = atob(pemBody)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

/**
 * Base64url encode (no padding)
 */
function base64url(data: ArrayBuffer | Uint8Array | string): string {
  let base64: string
  if (typeof data === 'string') {
    base64 = btoa(data)
  } else {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    base64 = btoa(binary)
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Create a signed JWT for Google OAuth2
 */
async function createSignedJwt(serviceAccount: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600, // 1 hour
  }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const key = await importPrivateKey(serviceAccount.private_key)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )

  return `${signingInput}.${base64url(signature)}`
}

/**
 * Get an OAuth2 access token for Vertex AI.
 * Caches the token in memory (refreshes 5 minutes before expiry).
 */
export async function getVertexAccessToken(serviceAccountJson: string): Promise<string> {
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.token
  }

  const serviceAccount: ServiceAccountKey = JSON.parse(serviceAccountJson)
  const jwt = await createSignedJwt(serviceAccount)

  const response = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get access token: ${response.status} ${error}`)
  }

  const data = (await response.json()) as TokenResponse

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  return data.access_token
}

/**
 * Build the Vertex AI endpoint URL for a given model and action.
 */
export function getVertexUrl(
  projectId: string,
  region: string,
  model: string,
  action: 'generateContent' | 'streamGenerateContent'
): string {
  // Strip provider prefix (e.g. "google/gemini-3-flash-preview" → "gemini-3-flash-preview")
  const cleanModel = model.includes('/') ? model.split('/').pop()! : model
  return `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${cleanModel}:${action}`
}
