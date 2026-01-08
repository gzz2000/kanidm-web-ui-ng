function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(value.length + (4 - (value.length % 4)) % 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function convertRequestOptions(options: Record<string, unknown>): PublicKeyCredentialRequestOptions {
  const container =
    options && typeof options === 'object' && 'publicKey' in options
      ? (options.publicKey as Record<string, unknown>)
      : options
  const publicKey = structuredClone(container) as Record<string, unknown>

  if (typeof publicKey.challenge === 'string') {
    publicKey.challenge = base64UrlToBuffer(publicKey.challenge)
  }

  if (Array.isArray(publicKey.allowCredentials)) {
    publicKey.allowCredentials = publicKey.allowCredentials.map((cred) => {
      if (cred && typeof cred === 'object' && typeof cred.id === 'string') {
        return { ...cred, id: base64UrlToBuffer(cred.id) }
      }
      return cred
    })
  }

  return publicKey as PublicKeyCredentialRequestOptions
}

function convertCreationOptions(options: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  const container =
    options && typeof options === 'object' && 'publicKey' in options
      ? (options.publicKey as Record<string, unknown>)
      : options
  const publicKey = structuredClone(container) as Record<string, unknown>

  if (typeof publicKey.challenge === 'string') {
    publicKey.challenge = base64UrlToBuffer(publicKey.challenge)
  }

  if (publicKey.user && typeof publicKey.user === 'object' && typeof publicKey.user.id === 'string') {
    publicKey.user = {
      ...publicKey.user,
      id: base64UrlToBuffer(publicKey.user.id),
    }
  }

  if (Array.isArray(publicKey.excludeCredentials)) {
    publicKey.excludeCredentials = publicKey.excludeCredentials.map((cred) => {
      if (cred && typeof cred === 'object' && typeof cred.id === 'string') {
        return { ...cred, id: base64UrlToBuffer(cred.id) }
      }
      return cred
    })
  }

  return publicKey as PublicKeyCredentialCreationOptions
}

function serializeAssertion(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
    },
  }
}

function serializeAttestation(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64Url(response.attestationObject),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
    },
    clientExtensionResults: credential.getClientExtensionResults
      ? credential.getClientExtensionResults()
      : {},
    transports: response.getTransports ? response.getTransports() : undefined,
  }
}

export async function performPasskeyRequest(options: Record<string, unknown>) {
  const publicKey = convertRequestOptions(options)
  const credential = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('No credential returned from passkey flow')
  }

  return serializeAssertion(credential)
}

export async function performPasskeyCreation(options: Record<string, unknown>) {
  const publicKey = convertCreationOptions(options)
  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('No credential returned from passkey creation')
  }

  return serializeAttestation(credential)
}
